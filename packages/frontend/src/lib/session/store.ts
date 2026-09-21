import { randomBytes } from "node:crypto"

import {
  createDefaultRedisClient,
  type RedisSessionClient,
  type RedisStoreOptions,
  resolveRedisStoreConfig,
  withRedisTimeout
} from "../redis/store-support.ts"
import { classifyAccessEnd, endAuthenticatedForInactivity, stampQualifyingActivity } from "./idle.ts"
import {
  RELEASE_IDLE_LOCK_SCRIPT,
  SESSION_CAS_UNDER_LOCK_SCRIPT,
  SESSION_SET_UNDER_LOCK_SCRIPT
} from "./redis-scripts.ts"
import {
  isSessionId,
  parseSessionRecord,
  parseSessionRecordDetailed,
  serializeSessionRecord,
  type SessionConfig,
  type SessionRecord
} from "./types.ts"

/** Skip Redis writes when computed `idleExpiresAt` is unchanged (~1s activity coalesce). */
export const IDLE_ACTIVITY_COALESCE_SECONDS = 1

/**
 * Idle lock lease multiplier over `storeTimeoutMs`.
 * Covers load + CAS + optional post-apply revert CAS (each op ≤ timeout), with margin.
 */
export const IDLE_LOCK_TTL_TIMEOUT_MULTIPLIER = 4

export type ClearForInactivityResult =
  | { readonly kind: "already_cleared"; readonly record: SessionRecord }
  | { readonly kind: "cleared"; readonly record: SessionRecord }
  | { readonly kind: "denied" }

export type IdleRenewalPlan =
  | { readonly kind: "coalesced"; readonly record: SessionRecord }
  | { readonly kind: "denied" }
  | {
    readonly kind: "write"
    readonly preRenewalIdleExpiresAt: number
    readonly renewed: SessionRecord
  }

export type RenewIdleActivityResult =
  | { readonly kind: "cleared"; readonly record: SessionRecord }
  | { readonly kind: "coalesced"; readonly record: SessionRecord }
  | { readonly kind: "denied" }
  | { readonly kind: "renewed"; readonly record: SessionRecord }

export interface SessionStore {
  clearForInactivity(
    sessionId: string,
    nowSeconds: number,
    expectedTenantId: string
  ): Promise<ClearForInactivityResult>
  create(id: string, record: SessionRecord): Promise<SessionStoreCreateResult>
  read(id: string): Promise<SessionStoreReadResult>
  renewIdleActivity(
    sessionId: string,
    nowSeconds: number,
    expectedTenantId: string
  ): Promise<RenewIdleActivityResult>
  update(id: string, record: SessionRecord): Promise<SessionStoreUpdateResult>
}

export type SessionStoreCreateResult =
  | { readonly kind: "collision" }
  | { readonly kind: "created" }

export type SessionStoreReadResult =
  | { readonly kind: "missing" }
  | {
    readonly kind: "record"
    readonly legacyAuthenticated: boolean
    readonly record: SessionRecord
  }

export type SessionStoreUpdateResult =
  | { readonly kind: "missing" }
  | { readonly kind: "updated" }

type CompareAndSetResult = "mismatch" | "missing" | "ok"

function lockToken(): string {
  return randomBytes(16).toString("base64url")
}

export class RedisSessionStore implements SessionStore {
  private client: RedisSessionClient | undefined
  private readonly clientFactory: (url: string) => RedisSessionClient
  private readonly clock: () => number
  private connectPromise: Promise<RedisSessionClient> | undefined
  private readonly keyPrefix: string
  private readonly timeoutMs: number
  private readonly url: string

  constructor(config: SessionConfig, options: RedisStoreOptions<RedisSessionClient> = {}) {
    const resolved = resolveRedisStoreConfig(config, options, createDefaultRedisClient)
    this.url = resolved.url
    this.keyPrefix = resolved.keyPrefix
    this.timeoutMs = resolved.timeoutMs
    this.clientFactory = resolved.clientFactory
    this.clock = options.clock ?? defaultClock
  }

  /**
   * Atomically clear an idle-expired authenticated session to anonymous + inactivity latch.
   * Does not delete session-draft keys (none in this slice).
   */
  async clearForInactivity(
    sessionId: string,
    nowSeconds: number,
    expectedTenantId: string
  ): Promise<ClearForInactivityResult> {
    return await this.withIdleLockedRecord(
      sessionId,
      expectedTenantId,
      { kind: "denied" },
      async ({ client, lockToken, raw, record }) => {
        if (record.userId === undefined) {
          if (
            record.accessEndedCause === "inactivity"
            && record.sessionEndGeneration !== undefined
          ) {
            return { kind: "already_cleared", record }
          }
          return { kind: "denied" }
        }

        if (classifyAccessEnd(nowSeconds, record) !== "idle") {
          return { kind: "denied" }
        }

        const cleared = endAuthenticatedForInactivity(record)
        const cas = await this.compareAndSetSession(
          client,
          sessionId,
          raw,
          cleared,
          lockToken
        )
        if (cas !== "ok") {
          return { kind: "denied" }
        }

        return { kind: "cleared", record: cleared }
      }
    )
  }

  async create(id: string, record: SessionRecord): Promise<SessionStoreCreateResult> {
    if (!isSessionId(id)) {
      throw new SessionStoreError("Invalid session id.")
    }

    const client = await this.connectedClient()
    const result = await this.withTimeout(
      client.set(this.keyFor(id), serializeSessionRecord(record), {
        condition: "NX",
        expiration: {
          type: "EXAT",
          value: record.expiresAt
        }
      })
    )

    return result === null ? { kind: "collision" } : { kind: "created" }
  }

  async read(id: string): Promise<SessionStoreReadResult> {
    // Invalid ids are not store keys; skip Redis I/O.
    if (!isSessionId(id)) {
      return { kind: "missing" }
    }

    const client = await this.connectedClient()
    const raw = await this.withTimeout(client.get(this.keyFor(id)))
    if (raw === null) {
      return { kind: "missing" }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { kind: "missing" }
    }

    const detailed = parseSessionRecordDetailed(parsed)
    if (detailed === undefined) {
      return { kind: "missing" }
    }

    return {
      kind: "record",
      legacyAuthenticated: detailed.legacyAuthenticated,
      record: detailed.record
    }
  }

  /**
   * Atomically renew idle activity under a per-session mutation lock.
   * Stamps `lastActivityAt` from `nowSeconds` (application clock) — never Redis TIME.
   */
  async renewIdleActivity(
    sessionId: string,
    nowSeconds: number,
    expectedTenantId: string
  ): Promise<RenewIdleActivityResult> {
    return await this.withIdleLockedRecord(
      sessionId,
      expectedTenantId,
      { kind: "denied" },
      (ctx) => this.applyIdleRenewal(sessionId, nowSeconds, ctx)
    )
  }

  async update(id: string, record: SessionRecord): Promise<SessionStoreUpdateResult> {
    if (!isSessionId(id)) {
      throw new SessionStoreError("Invalid session id.")
    }

    if (parseSessionRecord(record) === undefined) {
      throw new SessionStoreError("Invalid session record.")
    }

    // Serialize with renew/clear on the same per-session idle lock.
    return await this.withIdleLockedRecord(
      id,
      record.tenantId,
      { kind: "missing" },
      async ({ client, lockToken }) => {
        const outcome = await this.setSessionUnderLock(client, id, record, lockToken)
        if (outcome === "ok") {
          return { kind: "updated" }
        }
        return { kind: "missing" }
      }
    )
  }

  private async acquireIdleLock(client: RedisSessionClient, sessionId: string): Promise<string> {
    const lockKey = this.idleLockKeyFor(sessionId)
    const token = lockToken()
    const lockTtlMs = Math.max(this.timeoutMs * IDLE_LOCK_TTL_TIMEOUT_MULTIPLIER, 1_000)
    const deadline = Date.now() + this.timeoutMs

    while (Date.now() <= deadline) {
      const result = await this.withTimeout(
        client.set(lockKey, token, {
          condition: "NX",
          expiration: {
            type: "PX",
            value: lockTtlMs
          }
        })
      )
      if (result !== null) {
        return token
      }

      await sleep(5)
    }

    throw new SessionStoreError("Session store operation timed out.")
  }

  private async applyIdleRenewal(
    sessionId: string,
    nowSeconds: number,
    ctx: {
      readonly client: RedisSessionClient
      readonly lockToken: string
      readonly raw: string
      readonly record: SessionRecord
    }
  ): Promise<RenewIdleActivityResult> {
    const plan = planIdleRenewal(ctx.record, nowSeconds)
    if (plan.kind !== "write") {
      return plan
    }

    const cas = await this.compareAndSetSession(
      ctx.client,
      sessionId,
      ctx.raw,
      plan.renewed,
      ctx.lockToken
    )
    if (cas !== "ok") {
      return { kind: "denied" }
    }

    return await this.finishIdleRenewalAfterCas(
      ctx.client,
      sessionId,
      plan.renewed,
      ctx.record,
      plan.preRenewalIdleExpiresAt,
      ctx.lockToken
    )
  }

  /** Map Redis failures without a client-side race timeout (mutating EVAL under lock). */
  private async awaitRedis<T>(operation: Promise<T>): Promise<T> {
    try {
      return await operation
    } catch (error) {
      throw toStoreError(error)
    }
  }

  /**
   * Atomic compare-and-set under the idle lock (Lua). Single round-trip; refuses writes when
   * the lock token no longer matches so a timed-out client cannot land a late mutation.
   * Intentionally not wrapped in `withTimeout`: a Promise.race abort would release the lease
   * while EVAL may still complete under the held token. Lock TTL + token check fence hangs.
   */
  private async compareAndSetSession(
    client: RedisSessionClient,
    sessionId: string,
    expectedSerialized: string,
    next: SessionRecord,
    lockToken: string
  ): Promise<CompareAndSetResult> {
    const serialized = serializeSessionRecord(next)
    const result = await this.awaitRedis(
      client.eval(SESSION_CAS_UNDER_LOCK_SCRIPT, {
        arguments: [
          lockToken,
          expectedSerialized,
          serialized,
          String(next.expiresAt)
        ],
        keys: [this.keyFor(sessionId), this.idleLockKeyFor(sessionId)]
      })
    )

    if (result === "ok") {
      return "ok"
    }
    if (result === "missing") {
      return "missing"
    }
    // mismatch | stolen | unexpected → fail closed (no retry here).
    return "mismatch"
  }

  private async connectedClient(): Promise<RedisSessionClient> {
    // An open socket is not necessarily ready to accept commands. Concurrent
    // callers must await the connection handshake before using the client.
    if (this.client?.isOpen && this.connectPromise === undefined) {
      return this.client
    }

    if (this.connectPromise !== undefined) {
      try {
        return await this.connectPromise
      } catch (error) {
        throw toStoreError(error)
      }
    }

    this.connectPromise = this.openClient()
    try {
      return await this.connectPromise
    } catch (error) {
      this.connectPromise = undefined
      this.client = undefined
      throw toStoreError(error)
    } finally {
      this.connectPromise = undefined
    }
  }

  private async finishIdleRenewalAfterCas(
    client: RedisSessionClient,
    sessionId: string,
    renewed: SessionRecord,
    prior: SessionRecord,
    preRenewalIdleExpiresAt: number,
    lockToken: string
  ): Promise<RenewIdleActivityResult> {
    // Post-apply re-check (still under lock): deadline wins over the extended write.
    const now1 = this.clock()
    if (now1 >= preRenewalIdleExpiresAt || now1 >= prior.expiresAt) {
      return await this.revertOrClearAfterFailedPostCheck(
        client,
        sessionId,
        renewed,
        prior,
        now1,
        preRenewalIdleExpiresAt,
        lockToken
      )
    }

    return { kind: "renewed", record: renewed }
  }

  private idleLockKeyFor(id: string): string {
    return `${this.keyPrefix}idle-lock:${id}`
  }

  private keyFor(id: string): string {
    return `${this.keyPrefix}${id}`
  }

  private async loadRawRecord(
    client: RedisSessionClient,
    sessionId: string
  ): Promise<undefined | { readonly raw: string; readonly record: SessionRecord }> {
    const raw = await this.withTimeout(client.get(this.keyFor(sessionId)))
    if (raw === null) {
      return undefined
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return undefined
    }

    const record = parseSessionRecord(parsed)
    if (record === undefined) {
      return undefined
    }

    return { raw, record }
  }

  private async openClient(): Promise<RedisSessionClient> {
    const client = this.clientFactory(this.url)
    this.client = client
    await this.withTimeout(client.connect())
    return client
  }

  private async releaseIdleLock(
    client: RedisSessionClient,
    sessionId: string,
    token: string
  ): Promise<void> {
    try {
      await this.withTimeout(
        client.eval(RELEASE_IDLE_LOCK_SCRIPT, {
          arguments: [token],
          keys: [this.idleLockKeyFor(sessionId)]
        })
      )
    } catch {
      // Lock TTL covers abandonment; do not mask the primary operation outcome.
    }
  }

  private async revertOrClearAfterFailedPostCheck(
    client: RedisSessionClient,
    sessionId: string,
    renewed: SessionRecord,
    prior: SessionRecord,
    now1: number,
    preRenewalIdleExpiresAt: number,
    lockToken: string
  ): Promise<RenewIdleActivityResult> {
    const renewedSerialized = serializeSessionRecord(renewed)

    if (
      now1 >= preRenewalIdleExpiresAt
      && preRenewalIdleExpiresAt <= prior.expiresAt
    ) {
      const cleared = endAuthenticatedForInactivity(renewed)
      const cas = await this.compareAndSetSession(
        client,
        sessionId,
        renewedSerialized,
        cleared,
        lockToken
      )
      if (cas === "ok") {
        return { kind: "cleared", record: cleared }
      }
      return { kind: "denied" }
    }

    // Absolute deadline won: revert the not-yet-validated extension.
    const cas = await this.compareAndSetSession(
      client,
      sessionId,
      renewedSerialized,
      prior,
      lockToken
    )
    if (cas !== "ok") {
      return { kind: "denied" }
    }
    return { kind: "denied" }
  }

  private async setSessionUnderLock(
    client: RedisSessionClient,
    sessionId: string,
    record: SessionRecord,
    lockToken: string
  ): Promise<"missing" | "ok" | "stolen"> {
    // Same as compareAndSetSession: do not Promise.race-timeout mutating EVAL under the lease.
    const result = await this.awaitRedis(
      client.eval(SESSION_SET_UNDER_LOCK_SCRIPT, {
        arguments: [lockToken, serializeSessionRecord(record), String(record.expiresAt)],
        keys: [this.keyFor(sessionId), this.idleLockKeyFor(sessionId)]
      })
    )
    if (result === "ok" || result === "missing" || result === "stolen") {
      return result
    }
    return "stolen"
  }

  /**
   * Shared idle mutation prelude: validate id, acquire lock, load + tenant-bind.
   * Callers supply domain logic; lock is always released in `finally`.
   */
  private async withIdleLockedRecord<T>(
    sessionId: string,
    expectedTenantId: string,
    denied: T,
    mutate: (ctx: {
      readonly client: RedisSessionClient
      readonly lockToken: string
      readonly raw: string
      readonly record: SessionRecord
    }) => Promise<T>
  ): Promise<T> {
    if (!isSessionId(sessionId)) {
      return denied
    }

    const client = await this.connectedClient()
    const acquired = await this.acquireIdleLock(client, sessionId)
    try {
      const loaded = await this.loadRawRecord(client, sessionId)
      if (loaded === undefined) {
        return denied
      }

      const { raw, record } = loaded
      if (record.tenantId !== expectedTenantId) {
        return denied
      }

      return await mutate({ client, lockToken: acquired, raw, record })
    } finally {
      await this.releaseIdleLock(client, sessionId, acquired)
    }
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    try {
      return await withRedisTimeout(
        this.timeoutMs,
        operation,
        () => new SessionStoreError("Session store operation timed out.")
      )
    } catch (error) {
      throw toStoreError(error)
    }
  }
}

export class SessionStoreError extends Error {
  override readonly name = "SessionStoreError"
}

/**
 * Pure pre-CAS idle renewal decision (exported for unit coverage).
 */
export function planIdleRenewal(
  record: SessionRecord,
  nowSeconds: number
): IdleRenewalPlan {
  if (!isIdleAuthenticatedRecord(record)) {
    return { kind: "denied" }
  }

  // now0: caller-supplied application clock (pre-CAS stamp).
  if (nowSeconds >= record.idleExpiresAt || nowSeconds >= record.expiresAt) {
    return { kind: "denied" }
  }

  const renewed = stampQualifyingActivity(record, nowSeconds)
  if (
    renewed.idleExpiresAt === undefined
    || renewed.lastActivityAt === undefined
    || renewed.idleDurationMinutes === undefined
  ) {
    return { kind: "denied" }
  }
  if (renewed.idleExpiresAt < record.idleExpiresAt) {
    // Do not regress a newer accepted heartbeat.
    return { kind: "denied" }
  }
  // ~1s coalesce: same computed idleExpiresAt ⇒ skip Redis write.
  if (renewed.idleExpiresAt === record.idleExpiresAt) {
    return { kind: "coalesced", record }
  }

  return {
    kind: "write",
    preRenewalIdleExpiresAt: record.idleExpiresAt,
    renewed
  }
}

function defaultClock(): number {
  return Math.floor(Date.now() / 1000)
}

function isIdleAuthenticatedRecord(record: SessionRecord): record is SessionRecord & {
  readonly idleDurationMinutes: number
  readonly idleExpiresAt: number
  readonly lastActivityAt: number
  readonly userId: string
  readonly userName: string
} {
  return record.userId !== undefined
    && record.userName !== undefined
    && record.idleDurationMinutes !== undefined
    && record.lastActivityAt !== undefined
    && record.idleExpiresAt !== undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function toStoreError(error: unknown): SessionStoreError {
  if (error instanceof SessionStoreError) {
    return error
  }

  return new SessionStoreError("Session store unavailable.")
}
