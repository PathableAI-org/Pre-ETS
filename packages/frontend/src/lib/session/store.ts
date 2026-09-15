import { createClient } from "redis"

import { parseSessionRecord, serializeSessionRecord, type SessionConfig, type SessionRecord } from "./types.ts"

export interface SessionStore {
  create(id: string, record: SessionRecord): Promise<SessionStoreCreateResult>
  read(id: string): Promise<SessionStoreReadResult>
}

export type SessionStoreCreateResult =
  | { readonly kind: "collision" }
  | { readonly kind: "created" }

export type SessionStoreReadResult =
  | { readonly kind: "missing" }
  | { readonly kind: "record"; readonly record: SessionRecord }

interface RedisLikeClient {
  connect(): Promise<unknown>
  get(key: string): Promise<null | string>
  readonly isOpen: boolean
  set(
    key: string,
    value: string,
    options: {
      readonly expiration: { readonly type: "EXAT"; readonly value: number }
      readonly NX: true
    }
  ): Promise<unknown>
}

interface RedisSessionStoreOptions {
  readonly clientFactory?: (url: string) => RedisLikeClient
  readonly keyPrefix?: string
  readonly timeoutMs?: number
  readonly url?: string
}

export class RedisSessionStore implements SessionStore {
  private client: RedisLikeClient | undefined
  private readonly clientFactory: (url: string) => RedisLikeClient
  private connectPromise: Promise<RedisLikeClient> | undefined
  private readonly keyPrefix: string
  private readonly timeoutMs: number
  private readonly url: string

  constructor(config: SessionConfig, options: RedisSessionStoreOptions = {}) {
    this.url = options.url ?? config.redisUrl
    this.keyPrefix = options.keyPrefix ?? config.keyPrefix
    this.timeoutMs = options.timeoutMs ?? config.storeTimeoutMs
    this.clientFactory = options.clientFactory ?? defaultClientFactory
  }

  async create(id: string, record: SessionRecord): Promise<SessionStoreCreateResult> {
    const client = await this.connectedClient()
    const result = await this.withTimeout(
      client.set(this.keyFor(id), serializeSessionRecord(record), {
        expiration: {
          type: "EXAT",
          value: record.expiresAt
        },
        NX: true
      })
    )

    return result === null ? { kind: "collision" } : { kind: "created" }
  }

  async read(id: string): Promise<SessionStoreReadResult> {
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

    const record = parseSessionRecord(parsed)
    if (record === undefined) {
      return { kind: "missing" }
    }

    return { kind: "record", record }
  }

  private async connectedClient(): Promise<RedisLikeClient> {
    if (this.client?.isOpen) {
      return this.client
    }

    if (this.connectPromise !== undefined) {
      return await this.connectPromise
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

  private keyFor(id: string): string {
    return `${this.keyPrefix}${id}`
  }

  private async openClient(): Promise<RedisLikeClient> {
    const client = this.clientFactory(this.url)
    this.client = client
    await this.withTimeout(client.connect())
    return client
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
  return createClient({
    disableOfflineQueue: true,
    url
  })
}

function toStoreError(error: unknown): SessionStoreError {
  if (error instanceof SessionStoreError) {
    return error
  }

  return new SessionStoreError("Session store unavailable.")
}
