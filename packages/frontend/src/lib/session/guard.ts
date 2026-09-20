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
export async function guardAuthenticatedAccess(
  input: GuardAuthenticatedAccessInput,
  deps: GuardAuthenticatedAccessDependencies
): Promise<GuardAuthenticatedAccessResult> {
  const loaded = await readGuardRecord(input.sessionId, deps.store)
  if (loaded.kind === "deny") {
    return loaded
  }

  return await evaluateGuardRecord(input, deps, loaded.record, loaded.legacyAuthenticated)
}

async function clearIdleAndDeny(
  input: GuardAuthenticatedAccessInput,
  deps: GuardAuthenticatedAccessDependencies,
  nowSeconds: number,
  remainingClearRetries: number
): Promise<GuardAuthenticatedAccessResult> {
  try {
    const cleared = await deps.store.clearForInactivity(
      input.sessionId,
      nowSeconds,
      input.tenantId
    )
    if (cleared.kind === "cleared" || cleared.kind === "already_cleared") {
      return deny("inactivity", true)
    }
  } catch (error) {
    if (error instanceof SessionStoreError) {
      return deny("store-error", false)
    }
    throw error
  }

  // Read/classify ran outside the mutation lock — a renew (or absolute/CAS loss)
  // can win before clearForInactivity. Never claim inactivity on a denied clear.
  if (remainingClearRetries <= 0) {
    return deny("not-authenticated", false)
  }

  const loaded = await readGuardRecord(input.sessionId, deps.store)
  if (loaded.kind === "deny") {
    return loaded
  }

  return await evaluateGuardRecord(
    input,
    deps,
    loaded.record,
    loaded.legacyAuthenticated,
    remainingClearRetries - 1
  )
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

async function evaluateGuardRecord(
  input: GuardAuthenticatedAccessInput,
  deps: GuardAuthenticatedAccessDependencies,
  record: SessionRecord,
  legacyAuthenticated: boolean,
  remainingClearRetries = 1
): Promise<GuardAuthenticatedAccessResult> {
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
    return await clearIdleAndDeny(input, deps, nowSeconds, remainingClearRetries)
  }

  return deny("absolute", false)
}

async function readGuardRecord(
  sessionId: string,
  store: SessionStore
): Promise<
  | Extract<GuardAuthenticatedAccessResult, { kind: "deny" }>
  | {
    readonly kind: "record"
    readonly legacyAuthenticated: boolean
    readonly record: SessionRecord
  }
> {
  let readResult
  try {
    readResult = await store.read(sessionId)
  } catch (error) {
    if (error instanceof SessionStoreError) {
      return deny("store-error", false)
    }
    throw error
  }

  if (readResult.kind !== "record") {
    return deny("missing", false)
  }

  return {
    kind: "record",
    legacyAuthenticated: readResult.legacyAuthenticated,
    record: readResult.record
  }
}
