import { assert, it } from "@effect/vitest"
import { ConfigProvider, Effect, Exit } from "effect"
import { describe } from "vitest"

import { ServerConfig } from "../../src/lib/config"

const BaseConfigProvider = ConfigProvider.fromUnknown({
  NODE_ENV: "development",
  OIDC_CLIENT_SECRETS_JSON: "{}",
  OIDC_TX_KEY_PREFIX: "pre-ets:oidc-tx:",
  OIDC_TX_SIGNING_SECRET: "synthetic-oidc-tx-signing-secret",
  OIDC_TX_TTL_SECONDS: "600",
  REDIS_URL: "redis://127.0.0.1:6379",
  SESSION_KEY_PREFIX: "pre-ets:session:",
  SESSION_SIGNING_SECRET: "synthetic-session-signing-secret",
  SESSION_STORE_TIMEOUT_MS: "2000",
  SESSION_TTL_SECONDS: "86400",
  TENANT_CONFIG_DIR: "/absolute/path/to/packages/frontend/fixtures/tenant-config",
  TENANT_RESOLUTION: "static",
  TENANT_STATIC_ALIAS: "springfield"
})

const withConfigOverrides = (overrides: Record<string, unknown>, excludeKeys: string[] = []) => {
  return ConfigProvider.fromUnknown(overrides).pipe(
    ConfigProvider.orElse(BaseConfigProvider),
    _withoutKeys(...excludeKeys)
  )
}

const _withoutKeys = (...keys: string[]) => (provider: ConfigProvider.ConfigProvider) => {
  return ConfigProvider.make(
    (path) => {
      if (keys.includes(path.join("."))) {
        return Effect.succeed(undefined)
      }
      return provider.load(path)
    }
  )
}

const withoutKeys = (...keys: string[]) => _withoutKeys(...keys)(BaseConfigProvider)

describe("ServerConfig", () => {
  describe(".env", () => {
    it.effect("defaults to development", () => {
      return Effect.gen(function*() {
        const config = yield* ServerConfig
        assert.deepEqual(config.env, "development")
      }).pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, withoutKeys("NODE_ENV"))
      )
    })

    it.effect.each([
      ["development"],
      ["production"],
      ["test"]
    ])("sets the .env from NODE_ENV=%s", ([env]) => {
      return Effect.gen(function*() {
        const config = yield* ServerConfig
        assert.deepEqual(config.env, env)
      }).pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          withConfigOverrides({
            NODE_ENV: env
          })
        )
      )
    })
  })

  describe("tenant.configDir", () => {
    it.effect("fails if not set", () => {
      return Effect.gen(function*() {
        const exit = yield* Effect.exit(ServerConfig)
        assert.isTrue(Exit.isFailure(exit))
      }).pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, withoutKeys("TENANT_CONFIG_DIR"))
      )
    })
  })
})
