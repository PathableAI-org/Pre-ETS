import { Config } from "effect"

const DEFAULT_APP_ENV = "development" as const

/** Shared NODE_ENV decode (no recovery — callers choose withDefault or orElse). */
export const AppEnv = Config.Literals(["development", "production", "test"], "NODE_ENV").pipe(
  Config.orElse(() => Config.succeed(DEFAULT_APP_ENV))
)
export type AppEnv = Config.Success<typeof AppEnv>
