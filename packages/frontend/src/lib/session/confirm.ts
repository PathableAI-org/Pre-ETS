import { resolveSessionCookie, type ResolveSessionCookieDeps } from "./cookie.ts"
import { classifyAccessEnd } from "./idle.ts"
import { type SessionStore, SessionStoreError } from "./store.ts"
import { isSessionId, type SessionRecord } from "./types.ts"

export interface ConfirmSessionAccessDependencies extends ResolveSessionCookieDeps {
  readonly store: SessionStore
}

export interface ConfirmSessionAccessInput {
  readonly cookieValue: string | undefined
  /** Mounted document session id for post-rotation mismatch handshake. */
  readonly mountedSessionId?: string
  /** Held generation for tombstone handoff validation. */
  readonly sessionEndGeneration?: number
}

export type ConfirmSessionAccessResult =
  | {
    readonly cookieSessionId: string
    readonly kind: "mismatch"
  }
  | {
    readonly expiresAt: number
    readonly idleExpiresAt: number
    readonly kind: "authenticated"
    readonly sessionId: string
  }
  | {
    readonly kind: "ended-inactivity"
    readonly mismatch?: true
    readonly sessionEndGeneration: number
    readonly sessionId: string
  }
  | {
    readonly kind: "ended-other"
    readonly mismatch?: true
    readonly sessionId?: string
  }
  | {
    readonly kind: "unavailable"
  }

/**
 * Cookie-bound confirm/read for idle recovery. Server is sole authority for cause.
 * May consume string `accessEndedCause` once while retaining `sessionEndGeneration`.
 */
export async function confirmSessionAccess(
  input: ConfirmSessionAccessInput,
  deps: ConfirmSessionAccessDependencies
): Promise<ConfirmSessionAccessResult> {
  if (input.cookieValue === undefined || input.cookieValue === "") {
    return { kind: "ended-other" }
  }

  const resolved = await resolveSessionCookie(input.cookieValue, deps)
  if (resolved.kind === "config-error") {
    return { kind: "unavailable" }
  }
  if (resolved.kind === "invalid-cookie") {
    return { kind: "ended-other" }
  }

  const cookieSessionId = resolved.claims.sid
  const mounted = input.mountedSessionId
  if (
    mounted !== undefined
    && mounted !== ""
    && mounted !== cookieSessionId
  ) {
    return await mismatchHandshake({
      cookieSessionId,
      heldGeneration: input.sessionEndGeneration,
      mountedSessionId: mounted,
      nowSeconds: resolved.clock,
      store: deps.store,
      tenantId: resolved.claims.tenant
    })
  }

  try {
    return await confirmCookieBoundSession({
      nowSeconds: resolved.clock,
      sessionId: cookieSessionId,
      store: deps.store,
      tenantId: resolved.claims.tenant
    })
  } catch (error) {
    if (error instanceof SessionStoreError) {
      return { kind: "unavailable" }
    }
    throw error
  }
}

// fallow-ignore-next-line complexity -- confirm outcomes: valid / idle-clear / latch / ended-other
async function confirmCookieBoundSession(input: {
  readonly nowSeconds: () => number
  readonly sessionId: string
  readonly store: SessionStore
  readonly tenantId: string
}): Promise<ConfirmSessionAccessResult> {
  const readResult = await input.store.read(input.sessionId)
  if (readResult.kind !== "record") {
    return { kind: "ended-other", sessionId: input.sessionId }
  }

  const { record } = readResult
  if (record.tenantId !== input.tenantId) {
    return { kind: "ended-other", sessionId: input.sessionId }
  }

  // Fresh clock after Redis load.
  const now = input.nowSeconds()

  if (record.userId !== undefined && record.idleExpiresAt !== undefined) {
    const classification = classifyAccessEnd(now, record)
    if (classification === "still-valid") {
      return {
        expiresAt: record.expiresAt,
        idleExpiresAt: record.idleExpiresAt,
        kind: "authenticated",
        sessionId: input.sessionId
      }
    }

    if (classification === "idle") {
      const cleared = await input.store.clearForInactivity(
        input.sessionId,
        now,
        input.tenantId
      )
      if (
        (cleared.kind === "cleared" || cleared.kind === "already_cleared")
        && cleared.record.sessionEndGeneration !== undefined
      ) {
        await consumeCauseKeepLatch(input.store, input.sessionId, cleared.record)
        return {
          kind: "ended-inactivity",
          sessionEndGeneration: cleared.record.sessionEndGeneration,
          sessionId: input.sessionId
        }
      }
      return { kind: "ended-other", sessionId: input.sessionId }
    }

    return { kind: "ended-other", sessionId: input.sessionId }
  }

  if (hasConsumableInactivityLatch(record, now)) {
    const generation = record.sessionEndGeneration
    if (generation === undefined) {
      return { kind: "ended-other", sessionId: input.sessionId }
    }
    await consumeCauseKeepLatch(input.store, input.sessionId, record)
    return {
      kind: "ended-inactivity",
      sessionEndGeneration: generation,
      sessionId: input.sessionId
    }
  }

  if (now >= record.expiresAt) {
    return { kind: "ended-other", sessionId: input.sessionId }
  }

  // Anonymous without inactivity evidence — not authenticated access.
  return { kind: "ended-other", sessionId: input.sessionId }
}

/**
 * Clearing string `accessEndedCause` is allowed only while generation latch remains.
 */
async function consumeCauseKeepLatch(
  store: SessionStore,
  sessionId: string,
  record: SessionRecord
): Promise<void> {
  if (
    record.accessEndedCause === undefined
    || record.sessionEndGeneration === undefined
  ) {
    return
  }

  const latchOnly: SessionRecord = {
    expiresAt: record.expiresAt,
    sessionEndGeneration: record.sessionEndGeneration,
    tenantId: record.tenantId
  }

  try {
    await store.update(sessionId, latchOnly)
  } catch {
    // Latch consume is best-effort; generation remains on the prior write.
  }
}

function hasConsumableInactivityLatch(
  record: SessionRecord,
  nowSeconds: number
): boolean {
  if (record.userId !== undefined) {
    return false
  }
  if (nowSeconds >= record.expiresAt) {
    return false
  }
  if (record.sessionEndGeneration === undefined) {
    return false
  }
  // Generation alone is enough after cause consume; cause may still be present.
  return record.accessEndedCause === "inactivity"
    || record.sessionEndGeneration >= 1
}

// fallow-ignore-next-line complexity -- post-rotation mismatch: latch validate + cause consume
async function mismatchHandshake(input: {
  readonly cookieSessionId: string
  readonly heldGeneration: number | undefined
  readonly mountedSessionId: string
  readonly nowSeconds: () => number
  readonly store: SessionStore
  readonly tenantId: string
}): Promise<ConfirmSessionAccessResult> {
  if (!isSessionId(input.mountedSessionId)) {
    return { cookieSessionId: input.cookieSessionId, kind: "mismatch" }
  }

  try {
    const readResult = await input.store.read(input.mountedSessionId)
    if (readResult.kind !== "record") {
      return { cookieSessionId: input.cookieSessionId, kind: "mismatch" }
    }

    const { record } = readResult
    if (record.tenantId !== input.tenantId) {
      return { cookieSessionId: input.cookieSessionId, kind: "mismatch" }
    }

    const now = input.nowSeconds()
    if (!hasConsumableInactivityLatch(record, now)) {
      return { cookieSessionId: input.cookieSessionId, kind: "mismatch" }
    }

    const generation = record.sessionEndGeneration
    if (generation === undefined) {
      return { cookieSessionId: input.cookieSessionId, kind: "mismatch" }
    }
    if (
      input.heldGeneration !== undefined
      && input.heldGeneration !== generation
    ) {
      return { cookieSessionId: input.cookieSessionId, kind: "mismatch" }
    }

    await consumeCauseKeepLatch(input.store, input.mountedSessionId, record)
    return {
      kind: "ended-inactivity",
      mismatch: true,
      sessionEndGeneration: generation,
      sessionId: input.mountedSessionId
    }
  } catch (error) {
    if (error instanceof SessionStoreError) {
      return { kind: "unavailable" }
    }
    throw error
  }
}
