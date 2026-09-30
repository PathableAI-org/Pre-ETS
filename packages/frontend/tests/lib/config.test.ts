import { assert, it } from "@effect/vitest"
import { ConfigProvider, Effect, Exit } from "effect"
import { describe } from "vitest"

import { ServerConfig } from "../../src/lib/config"

const BaseConfigProvider = ConfigProvider.fromUnknown({
  NODE_ENV: "development",
  TENANT_CONFIG_DIR: "/absolute/path/to/packages/frontend/fixtures/tenant-config",
  TENANT_RESOLUTION: "host",
  TENANT_STATIC_ALIAS: "springfield"
})

const withConfigOverrides = (overrides: Record<string, unknown>, excludeKeys: string[] = []) => {
  return ConfigProvider.fromUnknown(overrides).pipe(
    ConfigProvider.orElse(BaseConfigProvider),
    _withoutKeys(...excludeKeys)
  )
}

const _withoutKeys = (...keys: string[]) => (provider: ConfigProvider.ConfigProvider) => {
  const missing: ConfigProvider.Node | undefined = undefined
  return ConfigProvider.make(
    (path) => {
      if (keys.includes(path.join("."))) {
        return Effect.succeed(missing)
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

  describe(".tenant", () => {
    describe(".configDir", () => {
      it.effect.each([
        ["static"],
        ["host"]
      ])("fails if not set when resolution is %s", ([resolution]) => {
        return Effect.gen(function*() {
          const exit = yield* Effect.exit(ServerConfig)
          assert.isTrue(Exit.isFailure(exit))
        }).pipe(
          Effect.provideService(
            ConfigProvider.ConfigProvider,
            withConfigOverrides({
              TENANT_RESOLUTION: resolution
            }, ["TENANT_CONFIG_DIR"])
          )
        )
      })
      it.effect("succeeds if set", () => {
        const configDir = "/absolute/path/to/packages/frontend/fixtures/tenant-config"
        return Effect.gen(function*() {
          const config = yield* ServerConfig
          assert.deepEqual(config.tenant.configDir, configDir)
        }).pipe(
          Effect.provideService(
            ConfigProvider.ConfigProvider,
            withConfigOverrides({
              TENANT_CONFIG_DIR: configDir
            })
          )
        )
      })
    })
    describe(".resolution", () => {
      describe("when .env is production", () => {
        it.effect("ignores static resolution and its alias", () => {
          return Effect.gen(function*() {
            const config = yield* ServerConfig
            assert.deepEqual(config.tenant, {
              configDir: "/absolute/path/to/packages/frontend/fixtures/tenant-config",
              resolution: "host"
            })
          }).pipe(
            Effect.provideService(
              ConfigProvider.ConfigProvider,
              withConfigOverrides({
                NODE_ENV: "production",
                TENANT_RESOLUTION: "static",
                TENANT_STATIC_ALIAS: "shelbyville"
              })
            )
          )
        })
        it.effect("succeeds if resolution is host", () => {
          return Effect.gen(function*() {
            const config = yield* ServerConfig
            assert.deepEqual(config.tenant.resolution, "host")
          }).pipe(
            Effect.provideService(
              ConfigProvider.ConfigProvider,
              withConfigOverrides({
                NODE_ENV: "production",
                TENANT_RESOLUTION: "host"
              })
            )
          )
        })
      })

      describe("when env is not production", () => {
        it.effect.each([
          ["development", "host"],
          ["development", "static"],
          ["test", "host"],
          ["test", "static"]
        ])("succeeds if resolution is %s", ([env, resolution]) => {
          return Effect.gen(function*() {
            const config = yield* ServerConfig
            assert.deepEqual(config.tenant.resolution, resolution)
          }).pipe(
            Effect.provideService(
              ConfigProvider.ConfigProvider,
              withConfigOverrides({
                NODE_ENV: env,
                TENANT_RESOLUTION: resolution
              })
            )
          )
        })
      })
    })
    describe(".staticAlias", () => {
      describe("when .resolution is static", () => {
        it.effect("fails if staticAlias is not set", () => {
          return Effect.gen(function*() {
            const exit = yield* Effect.exit(ServerConfig)
            assert.isTrue(Exit.isFailure(exit))
          }).pipe(
            Effect.provideService(
              ConfigProvider.ConfigProvider,
              withConfigOverrides({
                TENANT_RESOLUTION: "static"
              }, ["TENANT_STATIC_ALIAS"])
            )
          )
        })
        it.effect("succeeds if staticAlias is set", () => {
          return Effect.gen(function*() {
            const config = yield* ServerConfig
            assert.deepPropertyVal(config.tenant, "staticAlias", "springfield")
          }).pipe(
            Effect.provideService(
              ConfigProvider.ConfigProvider,
              withConfigOverrides({
                TENANT_RESOLUTION: "static",
                TENANT_STATIC_ALIAS: "springfield"
              })
            )
          )
        })
      })
      describe("when .resolution is host", () => {
        it.effect("succeeds if staticAlias is not set", () => {
          return Effect.gen(function*() {
            const config = yield* ServerConfig
            assert.doesNotHaveAnyKeys(config.tenant, ["staticAlias"])
          }).pipe(
            Effect.provideService(
              ConfigProvider.ConfigProvider,
              withConfigOverrides({
                TENANT_RESOLUTION: "host"
              }, ["TENANT_STATIC_ALIAS"])
            )
          )
        })
        it.effect("ignores staticAlias if set", () => {
          return Effect.gen(function*() {
            const config = yield* ServerConfig
            assert.doesNotHaveAnyKeys(config.tenant, ["staticAlias"])
          }).pipe(
            Effect.provideService(
              ConfigProvider.ConfigProvider,
              withConfigOverrides({
                TENANT_RESOLUTION: "host",
                TENANT_STATIC_ALIAS: "springfield"
              })
            )
          )
        })
      })
    })
  })
})
