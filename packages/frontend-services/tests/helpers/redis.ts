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
