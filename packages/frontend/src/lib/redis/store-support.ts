import { createClient } from "redis"

export interface RedisLikeClient {
  connect(): Promise<unknown>
  get(key: string): Promise<null | string>
  getDel(key: string): Promise<null | string>
  readonly isOpen: boolean
  on?(event: "error", listener: (error: unknown) => void): unknown
  set(
    key: string,
    value: string,
    options: {
      readonly condition?: "NX" | "XX"
      readonly expiration: { readonly type: "EXAT"; readonly value: number }
    }
  ): Promise<unknown>
}

export interface RedisStoreConfig {
  readonly clientFactory: (url: string) => RedisLikeClient
  readonly keyPrefix: string
  readonly timeoutMs: number
  readonly url: string
}

export interface RedisStoreOptions {
  readonly clientFactory?: (url: string) => RedisLikeClient
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

export function resolveRedisStoreConfig(
  defaults: {
    readonly keyPrefix: string
    readonly redisUrl: string
    readonly storeTimeoutMs: number
  },
  options: RedisStoreOptions = {}
): RedisStoreConfig {
  return {
    clientFactory: options.clientFactory ?? createDefaultRedisClient,
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
