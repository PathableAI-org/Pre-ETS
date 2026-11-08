import { Duration, Effect, Layer } from "effect"
import * as Redis from "effect/persistence/Redis"

import type { AuthenticationSettings } from "../../src/config.ts"

import { makeRedis, parseSetNx } from "./redis.ts"

/** Plain process settings for the `alpha` tenant; startup decoding is covered by the config tests. */
export const authenticationSettings = (overrides: {
  readonly callback?: string | undefined
  readonly clientSecrets?: Readonly<Record<string, string>> | undefined
  readonly prefix?: string | undefined
  readonly ttlSeconds?: number | undefined
} = {}): AuthenticationSettings => ({
  allowInsecureLoopback: false,
  callbackOrigins: { alpha: new URL(overrides.callback ?? "https://alpha.example.test") },
  clientSecrets: overrides.clientSecrets ?? {},
  transactions: {
    prefix: overrides.prefix ?? "test:authentication",
    ttl: Duration.seconds(overrides.ttlSeconds ?? 600)
  }
})

export interface Entry {
  readonly expiresAt: number
  readonly payload: string
}

export interface MemoryRedis {
  /** The next `count` attempt creations report an existing key, as a correlation collision would. */
  readonly collideNextCreates: (count: number) => void
  /** Commands sent, in order. */
  readonly commands: string[]
  readonly entries: Map<string, Entry>
  readonly failNextConsume: (cause: unknown) => void
  readonly layer: Layer.Layer<Redis.Redis>
}

const livePayload = (entry: Entry | undefined): null | string => {
  if (entry === undefined) return null
  if (entry.expiresAt <= Date.now()) return null
  return entry.payload
}

const consumeEntry = (entries: Map<string, Entry>, args: readonly string[]): null | string => {
  const key = args[0]
  if (key === undefined) throw new Error("Missing GETDEL key")
  const payload = livePayload(entries.get(key))
  entries.delete(key)
  return payload
}

const createEntry = (entries: Map<string, Entry>, args: readonly string[]): null | string => {
  const { key, payload, ttlMilliseconds } = parseSetNx(args)
  if (livePayload(entries.get(key)) !== null) return null
  entries.set(key, { expiresAt: Date.now() + ttlMilliseconds, payload })
  return "OK"
}

const execute = (entries: Map<string, Entry>, command: string, args: readonly string[]): unknown => {
  switch (command) {
    case "GETDEL":
      return consumeEntry(entries, args)
    case "SET":
      return createEntry(entries, args)
    default:
      throw new Error(`Unexpected Redis command: ${command}`)
  }
}

export const makeMemoryRedis = (): MemoryRedis => {
  const entries = new Map<string, Entry>()
  const commands: string[] = []
  let collisions = 0
  let consumeCause: unknown
  const failNextConsume = (cause: unknown) => {
    consumeCause = cause
  }
  const send = <A>(command: string, ...args: readonly string[]) => {
    commands.push(command)
    if (command === "SET" && collisions > 0) {
      collisions -= 1
      return Effect.succeed(null as A)
    }
    if (command === "GETDEL" && consumeCause !== undefined) {
      const cause = consumeCause
      consumeCause = undefined
      return Effect.fail(new Redis.RedisError({ cause }))
    }
    return Effect.try({
      catch: (cause) => new Redis.RedisError({ cause }),
      try: () => execute(entries, command, args) as A
    })
  }

  const service = makeRedis(send)
  return {
    collideNextCreates: (count) => {
      collisions = count
    },
    commands,
    entries,
    failNextConsume,
    layer: Layer.effect(Redis.Redis, service)
  }
}
