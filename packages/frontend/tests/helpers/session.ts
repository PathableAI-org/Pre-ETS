import { Effect, Layer } from "effect"
import * as Redis from "effect/persistence/Redis"

export interface SessionMemoryRedis {
  readonly entries: Map<string, string>
  readonly failNextCommand: (command: "GET" | "SET", cause?: unknown) => void
  readonly layer: Layer.Layer<Redis.Redis>
}

const createEntry = (entries: Map<string, string>, args: readonly string[]): null | string => {
  const [key, payload, nx, px, ttl] = args
  const expectedShape = key !== undefined && payload !== undefined && nx === "NX" && px === "PX" && ttl !== undefined
  if (!expectedShape) throw new Error("Unexpected SET shape")
  if (entries.has(key)) return null
  entries.set(key, payload)
  return "OK"
}

const execute = (entries: Map<string, string>, command: string, args: readonly string[]): unknown => {
  switch (command) {
    case "GET": {
      const key = args[0]
      if (key === undefined) throw new Error("Missing GET key")
      return entries.get(key) ?? null
    }
    case "SET":
      return createEntry(entries, args)
    default:
      throw new Error(`Unexpected Redis command: ${command}`)
  }
}

export const makeSessionMemoryRedis = (): SessionMemoryRedis => {
  const entries = new Map<string, string>()
  const failures = new Map<"GET" | "SET", unknown>()

  const failNextCommand = (command: "GET" | "SET", cause?: unknown) => {
    failures.set(command, cause ?? new Error(`controlled ${command} failure`))
  }

  const send = <A>(command: string, ...args: readonly string[]) => {
    if ((command === "GET" || command === "SET") && failures.has(command)) {
      const cause = failures.get(command)
      failures.delete(command)
      return Effect.fail(new Redis.RedisError({ cause }))
    }
    return Effect.try({
      catch: (cause) => new Redis.RedisError({ cause }),
      try: () => execute(entries, command, args) as A
    })
  }

  const service = Redis.make({
    send,
    subscribe: () => Effect.succeed(Effect.never)
  })
  return { entries, failNextCommand, layer: Layer.effect(Redis.Redis, service) }
}
