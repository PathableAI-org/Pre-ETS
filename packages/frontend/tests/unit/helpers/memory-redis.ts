import { vi } from "vitest"

export interface RedisSetOptions {
  readonly condition?: "NX" | "XX"
  readonly expiration?: { readonly type: "EXAT" | "PX"; readonly value: number }
}

interface MemoryEntry {
  /** Only used for PX lock TTLs; EXAT session keys are not wall-clock expired in this mock. */
  readonly pxExpiresAtMs?: number
  readonly value: string
}

/** In-memory Redis stand-in for deterministic lock/CAS interleaving. */
export class MemoryRedis {
  /** Optional hooks for interleaving / CAS predicate tests. */
  beforeGet: ((key: string) => Promise<void> | void) | undefined
  beforeSet:
    | ((key: string, value: string, options?: RedisSetOptions) => Promise<void> | void)
    | undefined

  readonly del = vi.fn(async (key: readonly string[] | string) => this.delImpl(key))
  readonly get = vi.fn(async (key: string) => this.getImpl(key))

  readonly isOpen = true
  readonly set = vi.fn(async (key: string, value: string, options?: RedisSetOptions) =>
    this.setImpl(key, value, options)
  )
  private readonly entries = new Map<string, MemoryEntry>()

  connect(): Promise<void> {
    return Promise.resolve()
  }

  keys(): string[] {
    return [...this.entries.keys()]
  }

  on(): this {
    return this
  }

  private delImpl(key: readonly string[] | string): Promise<number> {
    const keys = typeof key === "string" ? [key] : [...key]
    let removed = 0
    for (const k of keys) {
      if (this.entries.delete(k)) {
        removed += 1
      }
    }
    return Promise.resolve(removed)
  }

  private async getImpl(key: string): Promise<null | string> {
    if (this.beforeGet !== undefined) {
      await this.beforeGet(key)
    }
    return this.liveValue(key)
  }

  /** Read value, deleting the entry when its PX TTL has elapsed. */
  private liveValue(key: string): null | string {
    const entry = this.entries.get(key)
    if (entry === undefined) {
      return null
    }
    if (entry.pxExpiresAtMs !== undefined && Date.now() >= entry.pxExpiresAtMs) {
      this.entries.delete(key)
      return null
    }
    return entry.value
  }

  private peek(key: string): null | string {
    return this.liveValue(key)
  }

  private async setImpl(
    key: string,
    value: string,
    options?: RedisSetOptions
  ): Promise<null | string> {
    if (this.beforeSet !== undefined) {
      await this.beforeSet(key, value, options)
    }
    const existing = this.peek(key)
    if (!passesSetCondition(existing, options?.condition)) {
      return null
    }

    this.entries.set(key, entryForSet(value, options))
    return "OK"
  }
}

/** Build a memory entry, applying PX TTL when present. */
export function entryForSet(value: string, options?: RedisSetOptions): MemoryEntry {
  if (options?.expiration?.type === "PX") {
    return { pxExpiresAtMs: Date.now() + options.expiration.value, value }
  }
  return { value }
}

/** NX/XX predicate for MemoryRedis SET (exported for unit coverage). */
export function passesSetCondition(
  existing: null | string,
  condition: "NX" | "XX" | undefined
): boolean {
  if (condition === "NX") {
    return existing === null
  }
  if (condition === "XX") {
    return existing !== null
  }
  return true
}
