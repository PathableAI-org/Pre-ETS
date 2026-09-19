import { vi } from "vitest"

import type { RedisEvalOptions } from "../../../src/lib/redis/store-support.ts"

import {
  RELEASE_IDLE_LOCK_SCRIPT,
  SESSION_CAS_UNDER_LOCK_SCRIPT,
  SESSION_SET_UNDER_LOCK_SCRIPT
} from "../../../src/lib/session/redis-scripts.ts"

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
  beforeEval: ((script: string, options: RedisEvalOptions) => Promise<void> | void) | undefined
  beforeGet: ((key: string) => Promise<void> | void) | undefined
  beforeSet:
    | ((key: string, value: string, options?: RedisSetOptions) => Promise<void> | void)
    | undefined

  readonly del = vi.fn(async (key: readonly string[] | string) => this.delImpl(key))
  readonly eval = vi.fn(async (script: string, options: RedisEvalOptions) => this.evalImpl(script, options))
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

  private compareAndWrite(
    sessionKey: string,
    expected: string,
    next: string
  ): "mismatch" | "missing" | "ok" {
    const current = this.liveValue(sessionKey)
    if (current === null) {
      return "missing"
    }
    if (current !== expected) {
      return "mismatch"
    }
    this.entries.set(sessionKey, { value: next })
    return "ok"
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

  private evalCasUnderLock(options: RedisEvalOptions): "mismatch" | "missing" | "ok" | "stolen" {
    const { args, keys } = requireEvalParts(options, 2, 4, "CAS")
    const sessionKey = requirePart(keys, 0, "CAS KEYS")
    const lockKey = requirePart(keys, 1, "CAS KEYS")
    const token = requirePart(args, 0, "CAS ARGV")
    const expected = requirePart(args, 1, "CAS ARGV")
    const next = requirePart(args, 2, "CAS ARGV")
    const lockOutcome = this.lockOwnership(lockKey, token)
    if (lockOutcome !== "ok") {
      return lockOutcome
    }
    return this.compareAndWrite(sessionKey, expected, next)
  }

  private async evalImpl(script: string, options: RedisEvalOptions): Promise<unknown> {
    if (this.beforeEval !== undefined) {
      await this.beforeEval(script, options)
    }

    const normalized = script.trim()
    if (normalized === SESSION_CAS_UNDER_LOCK_SCRIPT) {
      return this.evalCasUnderLock(options)
    }
    if (normalized === SESSION_SET_UNDER_LOCK_SCRIPT) {
      return this.evalSetUnderLock(options)
    }
    if (normalized === RELEASE_IDLE_LOCK_SCRIPT) {
      return this.evalReleaseLock(options)
    }

    throw new Error(`MemoryRedis: unsupported eval script`)
  }

  private evalReleaseLock(options: RedisEvalOptions): number {
    const { args, keys } = requireEvalParts(options, 1, 1, "release")
    const lockKey = requirePart(keys, 0, "release KEYS")
    const token = requirePart(args, 0, "release ARGV")
    if (this.liveValue(lockKey) !== token) {
      return 0
    }
    this.entries.delete(lockKey)
    return 1
  }

  private evalSetUnderLock(options: RedisEvalOptions): "missing" | "ok" | "stolen" {
    const { args, keys } = requireEvalParts(options, 2, 2, "SET under lock")
    const sessionKey = requirePart(keys, 0, "SET KEYS")
    const lockKey = requirePart(keys, 1, "SET KEYS")
    const token = requirePart(args, 0, "SET ARGV")
    const next = requirePart(args, 1, "SET ARGV")
    const lockOutcome = this.lockOwnership(lockKey, token)
    if (lockOutcome !== "ok") {
      return lockOutcome
    }
    if (this.liveValue(sessionKey) === null) {
      return "missing"
    }
    this.entries.set(sessionKey, { value: next })
    return "ok"
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

  private lockOwnership(lockKey: string, token: string): "ok" | "stolen" {
    return this.liveValue(lockKey) === token ? "ok" : "stolen"
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

function requireEvalParts(
  options: RedisEvalOptions,
  keyCount: number,
  argCount: number,
  label: string
): { readonly args: string[]; readonly keys: string[] } {
  const keys = options.keys ?? []
  const args = options.arguments ?? []
  if (keys.length < keyCount || args.length < argCount) {
    throw new Error(`MemoryRedis ${label}: missing KEYS/ARGV`)
  }
  return {
    args: args.slice(0, argCount),
    keys: keys.slice(0, keyCount)
  }
}

function requirePart(values: readonly string[], index: number, label: string): string {
  const value = values[index]
  if (value === undefined) {
    throw new Error(`MemoryRedis ${label}: missing index ${String(index)}`)
  }
  return value
}
