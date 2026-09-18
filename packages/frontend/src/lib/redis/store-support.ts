import { createClient } from "redis"

export interface RedisConnectableClient {
  connect(): Promise<unknown>
  readonly isOpen: boolean
  on?(event: "error", listener: (error: unknown) => void): unknown
  set(
    key: string,
    value: string,
    options?: {
      readonly condition?: "NX" | "XX"
      readonly expiration?: { readonly type: "EXAT" | "PX"; readonly value: number }
    }
  ): Promise<unknown>
}

/** Default redis.js client surface used by both stores. */
export type RedisLikeClient = RedisConnectableClient & {
  get(key: string): Promise<null | string>
  getDel(key: string): Promise<null | string>
}

export type RedisOidcClient = RedisConnectableClient & {
  getDel(key: string): Promise<null | string>
}

export type RedisSessionClient = RedisConnectableClient & {
  del?(key: readonly string[] | string): Promise<unknown>
  get(key: string): Promise<null | string>
}
export interface RedisStoreConfig<C extends RedisConnectableClient = RedisLikeClient> {
  readonly clientFactory: (url: string) => C
  readonly keyPrefix: string
  readonly timeoutMs: number
  readonly url: string
}

export interface RedisStoreOptions<C extends RedisConnectableClient = RedisLikeClient> {
  readonly clientFactory?: (url: string) => C
  /** Application clock (Unix seconds). Used by idle CAS post-apply sampling when provided. */
  readonly clock?: () => number
  readonly keyPrefix?: string
  readonly timeoutMs?: number
  readonly url?: string
}

export function createDefaultRedisClient(url: string): RedisLikeClient {
  const client = createClient({
    disableOfflineQueue: true,
    url
  })
  // Swallow transport errors; callers observe them via connect/get/set failures.
  client.on("error", () => undefined)
  return client
}

export function resolveRedisStoreConfig<C extends RedisConnectableClient>(
  defaults: {
    readonly keyPrefix: string
    readonly redisUrl: string
    readonly storeTimeoutMs: number
  },
  options: RedisStoreOptions<C>,
  defaultClientFactory: (url: string) => C
): RedisStoreConfig<C> {
  return {
    clientFactory: options.clientFactory ?? defaultClientFactory,
    keyPrefix: options.keyPrefix ?? defaults.keyPrefix,
    timeoutMs: options.timeoutMs ?? defaults.storeTimeoutMs,
    url: options.url ?? defaults.redisUrl
  }
}

export async function withRedisTimeout<T>(
  timeoutMs: number,
  operation: Promise<T>,
  createTimeoutError: () => Error
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(createTimeoutError())
        }, timeoutMs)
      })
    ])
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
  }
}
