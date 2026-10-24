import { Config } from "effect"

/** Process Redis URL. An absent value uses the local compose instance. */
export const RedisUrl = Config.String("REDIS_URL").pipe(
  Config.withDefault("redis://127.0.0.1:6379")
)
