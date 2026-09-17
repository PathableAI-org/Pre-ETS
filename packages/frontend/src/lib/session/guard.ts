import { classifyAccessEnd, isInactivityClaim } from "./idle.ts"
import { type SessionStore, SessionStoreError } from "./store.ts"
import { type SessionContext, sessionContextFromRecord, type SessionRecord } from "./types.ts"

export interface GuardAuthenticatedAccessDependencies {
  readonly nowSeconds?: () => number
  readonly store: SessionStore
}

export interface GuardAuthenticatedAccessInput {
  readonly sessionId: string
  readonly tenantId: string
}

export type GuardAuthenticatedAccessResult =
  | {
    readonly context: SessionContext
    readonly kind: "allow"
    readonly record: SessionRecord
  }
  | {
    readonly inactivity: boolean
    readonly kind: "deny"
    readonly reason: GuardDenyReason
  }

export type GuardDenyReason =
  | "absolute"
  | "inactivity"
  | "legacy"
  | "missing"
  | "not-authenticated"
  | "store-error"
  | "tenant"

/**
 * When context carries `userId`, re-validate via store+guard; anonymous contexts pass through.
 */
export async function assertGuardedSession(
  context: SessionContext,
  deps: GuardAuthenticatedAccessDependencies
): Promise<SessionContext> {
  if (context.userId === undefined) {
    return context
  }

  const result = await guardAuthenticatedAccess(
    {
      sessionId: context.sessionId,
      tenantId: context.tenantId
    },
    deps
  )

  if (result.kind === "deny") {
    throw new Error("Authenticated session access denied.")
  }

  return result.context
}

/**
 * Centralized protected-op check: Redis re-read, idle-shaped auth, tenant bind,
 * fresh clock after load, dual deadlines. When idle binds (including equality pin),
 * atomically clear for inactivity. Missing/store error never claim inactivity.
 */
// fallow-ignore-next-line complexity -- guard branches: missing / tenant / idle-clear / dual deadlines
export async function guardAuthenticatedAccess(
  input: GuardAuthenticatedAccessInput,
  deps: GuardAuthenticatedAccessDependencies
): Promise<GuardAuthenticatedAccessResult> {
  let readResult
  try {
    readResult = await deps.store.read(input.sessionId)
  } catch (error) {
    if (error instanceof SessionStoreError) {
      return deny("store-error", false)
    }
    throw error
  }

  if (readResult.kind !== "record") {
    return deny("missing", false)
  }

  const { legacyAuthenticated, record } = readResult

  if (record.tenantId !== input.tenantId) {
    return deny("tenant", false)
  }

  if (legacyAuthenticated) {
    return deny("legacy", false)
  }

  if (record.userId === undefined || record.idleExpiresAt === undefined) {
    return deny("not-authenticated", false)
  }

  // Fresh application clock AFTER Redis load — do not reuse a pre-I/O sample.
  const nowSeconds = (deps.nowSeconds ?? defaultNowSeconds)()
  const classification = classifyAccessEnd(nowSeconds, record)

  if (classification === "still-valid") {
    return {
      context: sessionContextFromRecord(input.sessionId, record),
      kind: "allow",
      record
    }
  }

  if (isInactivityClaim(classification)) {
    try {
      await deps.store.clearForInactivity(input.sessionId, nowSeconds, input.tenantId)
    } catch (error) {
      if (error instanceof SessionStoreError) {
        return deny("store-error", false)
      }
      throw error
    }
    return deny("inactivity", true)
  }

  return deny("absolute", false)
}

function defaultNowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function deny(reason: GuardDenyReason, inactivity: boolean): Extract<
  GuardAuthenticatedAccessResult,
  { kind: "deny" }
> {
  return { inactivity, kind: "deny", reason }
}
