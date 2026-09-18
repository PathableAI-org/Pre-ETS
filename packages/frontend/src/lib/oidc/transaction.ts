import {
  type RedisLikeClient,
  type RedisStoreOptions,
  resolveRedisStoreConfig,
  withRedisTimeout
} from "../redis/store-support.ts"
import {
  generateOidcState,
  isOidcState,
  type OidcTransactionRecord,
  type OidcTxConfig,
  parseOidcTransactionRecord,
  serializeOidcTransactionRecord
} from "./types.ts"

export type OidcTransactionConsumeResult =
  | { readonly kind: "missing" }
  | { readonly kind: "record"; readonly record: OidcTransactionRecord }
  | { readonly kind: "unavailable" }

export type OidcTransactionCreateResult =
  | { readonly kind: "collision" }
  | { readonly kind: "created"; readonly state: string }
  | { readonly kind: "unavailable" }

export interface OidcTransactionStore {
  consume(state: string): Promise<OidcTransactionConsumeResult>
  create(state: string, record: OidcTransactionRecord): Promise<OidcTransactionCreateResult>
}

export class RedisOidcTransactionStore implements OidcTransactionStore {
  private client: RedisLikeClient | undefined
  private readonly clientFactory: (url: string) => RedisLikeClient
  private connectPromise: Promise<RedisLikeClient> | undefined
  private readonly keyPrefix: string
  private readonly timeoutMs: number
  private readonly url: string

  constructor(
    config: Pick<OidcTxConfig, "keyPrefix" | "storeTimeoutMs"> & { readonly redisUrl: string },
    options: RedisStoreOptions = {}
  ) {
    const resolved = resolveRedisStoreConfig(config, options)
    this.url = resolved.url
    this.keyPrefix = resolved.keyPrefix
    this.timeoutMs = resolved.timeoutMs
    this.clientFactory = resolved.clientFactory
  }

  async consume(state: string): Promise<OidcTransactionConsumeResult> {
    if (!isOidcState(state)) {
      return { kind: "missing" }
    }

    try {
      const client = await this.connectedClient()
      const raw = await this.withTimeout(client.getDel(this.keyFor(state)))
      if (raw === null) {
        return { kind: "missing" }
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return { kind: "missing" }
      }

      const record = parseOidcTransactionRecord(parsed)
      if (record === undefined) {
        return { kind: "missing" }
      }

      return { kind: "record", record }
    } catch {
      return { kind: "unavailable" }
    }
  }

  async create(state: string, record: OidcTransactionRecord): Promise<OidcTransactionCreateResult> {
    if (!isOidcState(state)) {
      return { kind: "unavailable" }
    }

    if (parseOidcTransactionRecord(record) === undefined) {
      return { kind: "unavailable" }
    }

    try {
      const first = await this.setNx(state, record)
      if (first === "created") {
        return { kind: "created", state }
      }

      const retryState = generateOidcState()
      const second = await this.setNx(retryState, record)
      if (second === "created") {
        return { kind: "created", state: retryState }
      }

      return { kind: "unavailable" }
    } catch {
      return { kind: "unavailable" }
    }
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
      throw error
    }
  }

  private keyFor(state: string): string {
    return `${this.keyPrefix}${state}`
  }

  private async openClient(): Promise<RedisLikeClient> {
    const client = this.clientFactory(this.url)
    this.client = client
    await this.withTimeout(client.connect())
    return client
  }

  private async setNx(
    state: string,
    record: OidcTransactionRecord
  ): Promise<"collision" | "created"> {
    const client = await this.connectedClient()
    const result = await this.withTimeout(
      client.set(this.keyFor(state), serializeOidcTransactionRecord(record), {
        condition: "NX",
        expiration: {
          type: "EXAT",
          value: record.expiresAt
        }
      })
    )

    return result === null ? "collision" : "created"
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    return await withRedisTimeout(
      this.timeoutMs,
      operation,
      () => new Error("OIDC transaction store operation timed out.")
    )
  }
}
