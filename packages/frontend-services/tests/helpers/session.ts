import { NodeRedis } from "@effect/platform-node"
import { Clock, Context, Deferred, Effect, Layer } from "effect"
import * as Redis from "effect/persistence/Redis"
import { randomUUID } from "node:crypto"
import { expect } from "vitest"

import { type NoUsableSession, SessionService, type UsableSession } from "../../src/session.ts"
import { makeRedis, poolClock } from "./redis.ts"

export interface StoredSessionRecord {
  readonly payload: string
  readonly ttlMilliseconds: number
}

type SessionRedisCommand = "DEL" | "EVALSHA" | "SET"

/**
 * A fault the next matching command meets instead of, or around, real Redis.
 *
 * - `Fail`: the command is not sent and fails with `cause`.
 * - `FailAfterApply`: the command runs on Redis, then its reply is lost.
 * - `Hold`: the command waits on `release` after signalling `started`, then runs.
 * - `Reply`: the command is not sent and returns `value`.
 */
type SessionRedisFault =
  | { readonly _tag: "Fail"; readonly cause: unknown }
  | { readonly _tag: "FailAfterApply" }
  | {
    readonly _tag: "Hold"
    readonly release: Deferred.Deferred<undefined>
    readonly started: Deferred.Deferred<undefined>
  }
  | { readonly _tag: "Reply"; readonly value: unknown }

/**
 * Real Redis for one scenario's key prefix, so session tests run the production
 * Lua script. Faults cover only replies and failures the session parent must handle;
 * record semantics always come from Redis.
 */
export class SessionRedis extends Context.Service<SessionRedis, {
  /** Store commands the session service sent, in order. Setup and inspection are not recorded. */
  readonly commands: Effect.Effect<readonly string[]>
  readonly injectNext: (command: SessionRedisCommand, fault: SessionRedisFault) => Effect.Effect<void>
  /** Every live record under this scenario's prefix, by key. */
  readonly records: Effect.Effect<ReadonlyMap<string, StoredSessionRecord>, Redis.RedisError>
  readonly removeAll: Effect.Effect<void, Redis.RedisError>
  /** Replaces each live record's payload, keeping its TTL. */
  readonly rewriteAll: (rewrite: (payload: string) => string) => Effect.Effect<void, Redis.RedisError>
}>()("SessionRedis") {}

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379"

const nodeRedis = NodeRedis.layer({ disableOfflineQueue: true, url: redisUrl }).pipe(
  Layer.provide(Layer.succeed(Clock.Clock, poolClock))
)

const ownedKeys = Effect.fnUntraced(function*(redis: Redis.Redis["Service"], prefix: string) {
  const keys: string[] = []
  let cursor = "0"
  do {
    const [next, page] = yield* redis.send<readonly [string, readonly string[]]>(
      "SCAN",
      cursor,
      "MATCH",
      `${prefix}:*`,
      "COUNT",
      "1000"
    )
    keys.push(...page)
    cursor = next
  } while (cursor !== "0")
  return keys
})

const readRecords = Effect.fnUntraced(function*(redis: Redis.Redis["Service"], prefix: string) {
  const records = new Map<string, StoredSessionRecord>()
  for (const key of yield* ownedKeys(redis, prefix)) {
    const payload = yield* redis.send<null | string>("GET", key)
    const ttlMilliseconds = yield* redis.send<number>("PTTL", key)
    if (payload !== null) records.set(key, { payload, ttlMilliseconds })
  }
  return records
})

const removeOwned = Effect.fnUntraced(function*(redis: Redis.Redis["Service"], prefix: string) {
  const keys = yield* ownedKeys(redis, prefix)
  if (keys.length > 0) yield* redis.send("DEL", ...keys)
})

const applyFault = <A>(
  fault: SessionRedisFault,
  forward: Effect.Effect<A, Redis.RedisError>
): Effect.Effect<A, Redis.RedisError> => {
  switch (fault._tag) {
    case "Fail":
      return Effect.fail(new Redis.RedisError({ cause: fault.cause }))
    case "FailAfterApply":
      return forward.pipe(
        Effect.andThen(Effect.fail(new Redis.RedisError({ cause: new Error("controlled lost reply") })))
      )
    case "Hold":
      return Deferred.succeed(fault.started, undefined).pipe(
        Effect.andThen(Deferred.await(fault.release)),
        Effect.andThen(forward)
      )
    case "Reply":
      return Effect.succeed(fault.value as A)
  }
}

const makeSessionRedis = Effect.fnUntraced(function*(prefix: string) {
  const real = yield* Redis.Redis
  yield* Effect.addFinalizer(() => Effect.ignore(removeOwned(real, prefix)))
  const commands: string[] = []
  const faults = new Map<string, SessionRedisFault>()

  const send = <A>(command: string, ...args: readonly string[]) =>
    Effect.suspend(() => {
      commands.push(command)
      const fault = faults.get(command)
      faults.delete(command)
      const forward = real.send<A>(command, ...args)
      return fault === undefined ? forward : applyFault(fault, forward)
    })

  const control = SessionRedis.of({
    commands: Effect.sync(() => [...commands]),
    injectNext: (command, fault) => Effect.sync(() => faults.set(command, fault)),
    records: readRecords(real, prefix),
    removeAll: removeOwned(real, prefix),
    rewriteAll: Effect.fnUntraced(function*(rewrite) {
      for (const [key, { payload }] of yield* readRecords(real, prefix)) {
        yield* real.send("SET", key, rewrite(payload), "KEEPTTL")
      }
    })
  })
  const redis = yield* makeRedis(send)
  return Context.make(SessionRedis, control).pipe(Context.add(Redis.Redis, redis))
})

/**
 * A fresh session world per build: the real SessionService on real Redis under a
 * unique key prefix, plus the scenario's SessionRedis controls. Owned keys are
 * deleted when the scope closes.
 */
export const sessionWorld: Layer.Layer<SessionRedis | SessionService, Redis.RedisError> = Layer.unwrap(
  Effect.sync(() => {
    const prefix = `test:session:${randomUUID()}`
    const redis = Layer.effectContext(makeSessionRedis(prefix)).pipe(Layer.provide(nodeRedis))
    return SessionService.layer({ keyPrefix: prefix }).pipe(Layer.provideMerge(redis))
  })
)

/** Public session state without the store observation time, which differs per transition by design (research D6). */
export const sessionState = (session: NoUsableSession | UsableSession) => {
  if (session._tag === "NoUsableSession") return session
  const { observedAtEpochMilliseconds, ...state } = session
  expect(Number.isFinite(observedAtEpochMilliseconds)).toBe(true)
  return state
}
