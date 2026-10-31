import { Effect, Layer } from "effect"
import * as Redis from "effect/persistence/Redis"

import { makeRedis } from "./redis.ts"

export interface Entry {
  readonly expiresAt: number
  readonly payload: string
}

export interface MemoryRedis {
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
  const [key, payload, nx, px, ttl] = args
  const expectedShape = key !== undefined && payload !== undefined && nx === "NX" && px === "PX" && ttl !== undefined
  if (!expectedShape) throw new Error("Unexpected SET shape")
  if (livePayload(entries.get(key)) !== null) return null
  entries.set(key, { expiresAt: Date.now() + Number(ttl), payload })
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
  let consumeCause: unknown
  const failNextConsume = (cause: unknown) => {
    consumeCause = cause
  }
  const send = <A>(command: string, ...args: readonly string[]) => {
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
  return { entries, failNextConsume, layer: Layer.effect(Redis.Redis, service) }
}
