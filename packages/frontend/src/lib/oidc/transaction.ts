import { createClient } from "redis"

import {
  generateOidcState,
  isOidcState,
  type OidcTransactionRecord,
  type OidcTxConfig,
  parseOidcTransactionRecord,
  serializeOidcTransactionRecord
} from "./types.ts"

export type OidcTransactionCreateResult =
  | { readonly kind: "collision" }
  | { readonly kind: "created"; readonly state: string }
  | { readonly kind: "unavailable" }

export interface OidcTransactionStore {
  create(state: string, record: OidcTransactionRecord): Promise<OidcTransactionCreateResult>
}

interface RedisLikeClient {
  connect(): Promise<unknown>
  readonly isOpen: boolean
  on?(event: "error", listener: (error: unknown) => void): unknown
  set(
    key: string,
    value: string,
    options: {
      readonly condition: "NX"
      readonly expiration: { readonly type: "EXAT"; readonly value: number }
    }
  ): Promise<unknown>
}

interface RedisOidcTransactionStoreOptions {
  readonly clientFactory?: (url: string) => RedisLikeClient
  readonly keyPrefix?: string
  readonly timeoutMs?: number
  readonly url?: string
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
    options: RedisOidcTransactionStoreOptions = {}
  ) {
    // fallow-ignore-next-line code-duplication -- Redis store constructor mirrors session store
    this.url = options.url ?? config.redisUrl
    this.keyPrefix = options.keyPrefix ?? config.keyPrefix
    this.timeoutMs = options.timeoutMs ?? config.storeTimeoutMs
    this.clientFactory = options.clientFactory ?? defaultClientFactory
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
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      // fallow-ignore-next-line code-duplication -- same fail-closed timeout race as session store
      return await Promise.race([
        operation,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error("OIDC transaction store operation timed out."))
          }, this.timeoutMs)
        })
      ])
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
    }
  }
}

function defaultClientFactory(url: string): RedisLikeClient {
  const client = createClient({
    disableOfflineQueue: true,
    url
  })
  client.on("error", () => undefined)
  return client
}
