import { Clock, Effect } from "effect"
import * as Redis from "effect/persistence/Redis"

// `Redis.make` starts a pool reaper that sleeps on the active clock. TestClock
// does not complete that sleep when the test scope closes, so doubles keep the
// default wall clock for construction only.
const poolClock = Effect.runSync(Clock.clockWith((clock) => Effect.succeed(clock)))

export const makeRedis = (
  send: <A>(command: string, ...args: readonly string[]) => Effect.Effect<A, Redis.RedisError>
) =>
  Redis.make({
    connect: Effect.succeed({ close: Effect.void, send }),
    send,
    subscribe: () => Effect.succeed(Effect.never)
  }).pipe(Effect.provideService(Clock.Clock, poolClock))

/** Parses the `SET key payload NX PX ttl` shape the stores send; any other shape is a test failure. */
export const parseSetNx = (args: readonly string[]): { key: string; payload: string; ttlMilliseconds: number } => {
  const [key, payload, nx, px, ttl] = args
  const expectedShape = key !== undefined && payload !== undefined && nx === "NX" && px === "PX" && ttl !== undefined
  if (!expectedShape) throw new Error("Unexpected SET shape")
  return { key, payload, ttlMilliseconds: Number(ttl) }
}
