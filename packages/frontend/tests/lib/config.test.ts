import { assert, it } from "@effect/vitest"
import { Cause, Config, ConfigProvider, Effect, Exit, Option } from "effect"
import { describe } from "vitest"

import { ServerConfig, StartupConfig } from "../../src/lib/config"

const BaseConfigProvider = ConfigProvider.fromUnknown({
  BASE_HOSTNAME: "example.test",
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
        it.effect("keeps static resolution and its alias", () => {
          return Effect.gen(function*() {
            const config = yield* ServerConfig
            assert.deepEqual(config.tenant, {
              configDir: "/absolute/path/to/packages/frontend/fixtures/tenant-config",
              resolution: "static",
              staticAlias: "shelbyville"
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
    describe(".baseHostname", () => {
      describe("when .resolution is host", () => {
        it.effect("fails if baseHostname is not set", () => {
          return Effect.gen(function*() {
            const exit = yield* Effect.exit(ServerConfig)
            assert.isTrue(Exit.isFailure(exit))
          }).pipe(
            Effect.provideService(
              ConfigProvider.ConfigProvider,
              withConfigOverrides({
                TENANT_RESOLUTION: "host"
              }, ["BASE_HOSTNAME"])
            )
          )
        })
        it.effect("succeeds if baseHostname is set", () => {
          return Effect.gen(function*() {
            const config = yield* ServerConfig
            assert.deepPropertyVal(config.tenant, "baseHostname", "example.test")
          }).pipe(
            Effect.provideService(
              ConfigProvider.ConfigProvider,
              withConfigOverrides({
                BASE_HOSTNAME: "example.test",
                TENANT_RESOLUTION: "host"
              })
            )
          )
        })
      })
      describe("when .resolution is static", () => {
        it.effect("succeeds if baseHostname is not set", () => {
          return Effect.gen(function*() {
            const config = yield* ServerConfig
            assert.doesNotHaveAnyKeys(config.tenant, ["baseHostname"])
          }).pipe(
            Effect.provideService(
              ConfigProvider.ConfigProvider,
              withConfigOverrides({
                TENANT_RESOLUTION: "static",
                TENANT_STATIC_ALIAS: "springfield"
              }, ["BASE_HOSTNAME"])
            )
          )
        })
      })
      describe("when .env is production and .resolution is static", () => {
        it.effect("succeeds if baseHostname is not set", () => {
          return Effect.gen(function*() {
            const config = yield* ServerConfig
            assert.doesNotHaveAnyKeys(config.tenant, ["baseHostname"])
          }).pipe(
            Effect.provideService(
              ConfigProvider.ConfigProvider,
              withConfigOverrides({
                NODE_ENV: "production",
                TENANT_RESOLUTION: "static",
                TENANT_STATIC_ALIAS: "shelbyville"
              }, ["BASE_HOSTNAME"])
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

  describe(".redis", () => {
    it.effect("defaults the local compose URL when REDIS_URL is absent", () => {
      return Effect.gen(function*() {
        const config = yield* ServerConfig
        assert.deepEqual(config.redis.url, "redis://127.0.0.1:6379")
      }).pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, BaseConfigProvider)
      )
    })

    it.effect("reads REDIS_URL", () => {
      return Effect.gen(function*() {
        const config = yield* ServerConfig
        assert.deepEqual(config.redis.url, "redis://cache.test:6379")
      }).pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          withConfigOverrides({ REDIS_URL: "redis://cache.test:6379" })
        )
      )
    })
  })

  describe(".session", () => {
    it.effect("defaults the versioned session prefix when SESSION_KEY_PREFIX is absent", () => {
      return Effect.gen(function*() {
        const config = yield* ServerConfig
        assert.deepEqual(config.session.keyPrefix, "preets:session:v1")
      }).pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, BaseConfigProvider)
      )
    })

    it.effect("reads SESSION_KEY_PREFIX", () => {
      return Effect.gen(function*() {
        const config = yield* ServerConfig
        assert.deepEqual(config.session.keyPrefix, "test:session:owned")
      }).pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          withConfigOverrides({ SESSION_KEY_PREFIX: "test:session:owned" })
        )
      )
    })
  })
})

const configError = (exit: Exit.Exit<unknown, unknown>): boolean => {
  if (!Exit.isFailure(exit)) return false
  const error = Cause.findErrorOption(exit.cause)
  return Option.isSome(error) && error.value instanceof Config.ConfigError
}

// StartupConfig contract: one Config failure before infrastructure, without URL or protocol selection (V-006).
describe("StartupConfig", () => {
  it.effect("fails with ConfigError when TENANT_CONFIG_DIR is omitted", () => {
    return Effect.gen(function*() {
      const exit = yield* Effect.exit(StartupConfig)
      assert.isTrue(configError(exit))
    }).pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        withConfigOverrides({}, ["TENANT_CONFIG_DIR"])
      )
    )
  })

  it.effect("defaults LOG_LEVEL to Info", () => {
    return Effect.gen(function*() {
      const config = yield* StartupConfig
      assert.strictEqual(config.logLevel, "Info")
      assert.strictEqual(config.server.tenant.resolution, "host")
    }).pipe(
      Effect.provideService(ConfigProvider.ConfigProvider, BaseConfigProvider)
    )
  })

  it.effect("fails with ConfigError when LOG_LEVEL is invalid", () => {
    return Effect.gen(function*() {
      const exit = yield* Effect.exit(StartupConfig)
      assert.isTrue(configError(exit))
    }).pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        withConfigOverrides({ LOG_LEVEL: "loud" })
      )
    )
  })

  it.effect("does not apply URL or protocol selection", () => {
    return Effect.gen(function*() {
      const config = yield* StartupConfig
      assert.deepEqual(config.otel.endpoint, Option.some("not a url"))
      assert.deepEqual(config.otel.exportUrl, Option.some("not a url/v1/traces"))
      assert.deepEqual(config.otel.protocol, Option.some("grpc"))
    }).pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        withConfigOverrides({
          OTEL_EXPORTER_OTLP_ENDPOINT: "not a url",
          OTEL_EXPORTER_OTLP_PROTOCOL: "grpc"
        })
      )
    )
  })
})
