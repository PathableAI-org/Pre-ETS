import { randomBytes } from "node:crypto"
import { createClient } from "redis"

import { classifyAccessEnd, endAuthenticatedForInactivity, stampQualifyingActivity } from "./idle.ts"
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

export type ClearForInactivityResult =
  | { readonly kind: "already_cleared"; readonly record: SessionRecord }
  | { readonly kind: "cleared"; readonly record: SessionRecord }
  | { readonly kind: "denied" }

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

interface RedisLikeClient {
  connect(): Promise<unknown>
  del(key: readonly string[] | string): Promise<unknown>
  get(key: string): Promise<null | string>
  readonly isOpen: boolean
  on?(event: "error", listener: (error: unknown) => void): unknown
  set(key: string, value: string, options?: RedisSetOptions): Promise<unknown>
}

interface RedisSessionStoreOptions {
  readonly clientFactory?: (url: string) => RedisLikeClient
  /** Application clock (Unix seconds) for post-apply `now1` sampling. Inject in tests. */
  readonly clock?: () => number
  readonly keyPrefix?: string
  readonly timeoutMs?: number
  readonly url?: string
}

interface RedisSetOptions {
  readonly condition?: "NX" | "XX"
  readonly expiration?: {
    readonly type: "EXAT" | "PX"
    readonly value: number
  }
}

export class RedisSessionStore implements SessionStore {
  private client: RedisLikeClient | undefined
  private readonly clientFactory: (url: string) => RedisLikeClient
  private readonly clock: () => number
  private connectPromise: Promise<RedisLikeClient> | undefined
  private readonly keyPrefix: string
  private readonly timeoutMs: number
  private readonly url: string

  constructor(config: SessionConfig, options: RedisSessionStoreOptions = {}) {
    this.url = options.url ?? config.redisUrl
    this.keyPrefix = options.keyPrefix ?? config.keyPrefix
    this.timeoutMs = options.timeoutMs ?? config.storeTimeoutMs
    this.clientFactory = options.clientFactory ?? defaultClientFactory
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
      async ({ client, raw, record }) => {
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
        const cas = await this.compareAndSetSession(client, sessionId, raw, cleared)
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

    const client = await this.connectedClient()
    const result = await this.withTimeout(
      client.set(this.keyFor(id), serializeSessionRecord(record), {
        condition: "XX",
        expiration: {
          type: "EXAT",
          value: record.expiresAt
        }
      })
    )

    return result === null ? { kind: "missing" } : { kind: "updated" }
  }

  private async acquireIdleLock(client: RedisLikeClient, sessionId: string): Promise<string> {
    const lockKey = this.idleLockKeyFor(sessionId)
    const token = lockToken()
    const lockTtlMs = Math.max(this.timeoutMs * 2, 1_000)
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

  // fallow-ignore-next-line complexity -- CAS renew: coalesce, write, post-apply re-check
  private async applyIdleRenewal(
    sessionId: string,
    nowSeconds: number,
    ctx: {
      readonly client: RedisLikeClient
      readonly raw: string
      readonly record: SessionRecord
    }
  ): Promise<RenewIdleActivityResult> {
    const { client, raw, record } = ctx
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

    const preRenewalIdleExpiresAt = record.idleExpiresAt
    const cas = await this.compareAndSetSession(client, sessionId, raw, renewed)
    if (cas !== "ok") {
      return { kind: "denied" }
    }

    // Post-apply re-check (still under lock): deadline wins over the extended write.
    const now1 = this.clock()
    if (now1 >= preRenewalIdleExpiresAt || now1 >= record.expiresAt) {
      return await this.revertOrClearAfterFailedPostCheck(
        client,
        sessionId,
        renewed,
        record,
        now1,
        preRenewalIdleExpiresAt
      )
    }

    return { kind: "renewed", record: renewed }
  }

  private async compareAndSetSession(
    client: RedisLikeClient,
    sessionId: string,
    expectedSerialized: string,
    next: SessionRecord
  ): Promise<CompareAndSetResult> {
    const key = this.keyFor(sessionId)
    const current = await this.withTimeout(client.get(key))
    if (current === null) {
      return "missing"
    }

    // CAS predicate: refuse blind SET when the expected authenticated shape changed.
    if (current !== expectedSerialized) {
      return "mismatch"
    }

    const serialized = serializeSessionRecord(next)
    const result = await this.withTimeout(
      client.set(key, serialized, {
        condition: "XX",
        expiration: {
          type: "EXAT",
          value: next.expiresAt
        }
      })
    )
    if (result === null) {
      return "missing"
    }

    const written = await this.withTimeout(client.get(key))
    if (written !== serialized) {
      return "mismatch"
    }

    return "ok"
  }

  private async connectedClient(): Promise<RedisLikeClient> {
    if (this.client?.isOpen) {
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
    }
  }

  private idleLockKeyFor(id: string): string {
    return `${this.keyPrefix}idle-lock:${id}`
  }

  private keyFor(id: string): string {
    return `${this.keyPrefix}${id}`
  }

  private async loadRawRecord(
    client: RedisLikeClient,
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

  private async openClient(): Promise<RedisLikeClient> {
    const client = this.clientFactory(this.url)
    this.client = client
    await this.withTimeout(client.connect())
    return client
  }

  private async releaseIdleLock(
    client: RedisLikeClient,
    sessionId: string,
    token: string
  ): Promise<void> {
    const lockKey = this.idleLockKeyFor(sessionId)
    try {
      const current = await this.withTimeout(client.get(lockKey))
      if (current === token) {
        await this.withTimeout(client.del(lockKey))
      }
    } catch {
      // Lock TTL covers abandonment; do not mask the primary operation outcome.
    }
  }

  private async revertOrClearAfterFailedPostCheck(
    client: RedisLikeClient,
    sessionId: string,
    renewed: SessionRecord,
    prior: SessionRecord,
    now1: number,
    preRenewalIdleExpiresAt: number
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
        cleared
      )
      if (cas === "ok") {
        return { kind: "cleared", record: cleared }
      }
      return { kind: "denied" }
    }

    // Absolute deadline won: revert the not-yet-validated extension.
    const cas = await this.compareAndSetSession(client, sessionId, renewedSerialized, prior)
    if (cas !== "ok") {
      return { kind: "denied" }
    }
    return { kind: "denied" }
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
      readonly client: RedisLikeClient
      readonly raw: string
      readonly record: SessionRecord
    }) => Promise<T>
  ): Promise<T> {
    if (!isSessionId(sessionId)) {
      return denied
    }

    const client = await this.connectedClient()
    const lockToken = await this.acquireIdleLock(client, sessionId)
    try {
      const loaded = await this.loadRawRecord(client, sessionId)
      if (loaded === undefined) {
        return denied
      }

      const { raw, record } = loaded
      if (record.tenantId !== expectedTenantId) {
        return denied
      }

      return await mutate({ client, raw, record })
    } finally {
      await this.releaseIdleLock(client, sessionId, lockToken)
    }
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(new SessionStoreError("Session store operation timed out."))
          }, this.timeoutMs)
        })
      ])
    } catch (error) {
      throw toStoreError(error)
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
    }
  }
}

export class SessionStoreError extends Error {
  override readonly name = "SessionStoreError"
}

function defaultClientFactory(url: string): RedisLikeClient {
  const client = createClient({
    disableOfflineQueue: true,
    url
  })
  // Swallow transport errors; callers observe them via connect/get/set failures.
  client.on("error", () => undefined)
  return client as unknown as RedisLikeClient
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

function lockToken(): string {
  return randomBytes(16).toString("base64url")
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
