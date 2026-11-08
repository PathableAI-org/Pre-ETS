import { assert, it } from "@effect/vitest"
import { Cause, Config, ConfigProvider, Duration, Effect, Exit, Option } from "effect"
import { describe } from "vitest"

import { StartupConfig } from "../../src/config.ts"

const BaseConfigProvider = ConfigProvider.fromUnknown({
  BASE_HOSTNAME: "example.test",
  NODE_ENV: "development",
  OTEL_SDK_DISABLED: true,
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

const configError = (exit: Exit.Exit<unknown, unknown>): boolean => {
  if (!Exit.isFailure(exit)) return false
  const error = Cause.findErrorOption(exit.cause)
  return Option.isSome(error) && error.value instanceof Config.ConfigError
}

describe("StartupConfig settings", () => {
  describe(".env", () => {
    it.effect("defaults to development", () => {
      return Effect.gen(function*() {
        const config = yield* StartupConfig
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
        const config = yield* StartupConfig
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

    it.effect("fails on an unsupported NODE_ENV instead of defaulting", () => {
      return Effect.gen(function*() {
        const exit = yield* Effect.exit(StartupConfig)
        assert.isTrue(configError(exit))
      }).pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, withConfigOverrides({ NODE_ENV: "staging" }))
      )
    })
  })

  describe(".tenant", () => {
    describe(".configDir [PREETS-TENANT-004]", () => {
      it.effect.each([
        ["static"],
        ["host"]
      ])("fails if not set when resolution is %s", ([resolution]) => {
        return Effect.gen(function*() {
          const exit = yield* Effect.exit(StartupConfig)
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
          const config = yield* StartupConfig
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
            const config = yield* StartupConfig
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
            const config = yield* StartupConfig
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
            const config = yield* StartupConfig
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
    describe(".baseHostname [PREETS-TENANT-003]", () => {
      describe("when .resolution is host", () => {
        it.effect("fails if baseHostname is not set", () => {
          return Effect.gen(function*() {
            const exit = yield* Effect.exit(StartupConfig)
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
            const config = yield* StartupConfig
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
            const config = yield* StartupConfig
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
            const config = yield* StartupConfig
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
            const exit = yield* Effect.exit(StartupConfig)
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
            const config = yield* StartupConfig
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
            const config = yield* StartupConfig
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
            const config = yield* StartupConfig
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
        const config = yield* StartupConfig
        assert.deepEqual(config.redisUrl, "redis://127.0.0.1:6379")
      }).pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, BaseConfigProvider)
      )
    })

    it.effect("reads REDIS_URL", () => {
      return Effect.gen(function*() {
        const config = yield* StartupConfig
        assert.deepEqual(config.redisUrl, "redis://cache.test:6379")
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
        const config = yield* StartupConfig
        assert.deepEqual(config.session.keyPrefix, "preets:session:v1")
      }).pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, BaseConfigProvider)
      )
    })

    it.effect("reads SESSION_KEY_PREFIX", () => {
      return Effect.gen(function*() {
        const config = yield* StartupConfig
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

// StartupConfig contract: one Config failure before infrastructure, without URL or protocol selection (V-006).
describe("StartupConfig [PREETS-TENANT-004]", () => {
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
      assert.strictEqual(config.tenant.resolution, "host")
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
})

const startupWith = (overrides: Record<string, unknown>) =>
  Effect.exit(StartupConfig).pipe(
    Effect.provideService(ConfigProvider.ConfigProvider, withConfigOverrides(overrides))
  )

const failureText = (exit: Exit.Exit<unknown, unknown>): string =>
  Exit.isFailure(exit) ? String(Cause.squash(exit.cause)) : ""

describe("StartupConfig authentication [PREETS-SESSION-002]", () => {
  it.effect("defaults absent authentication settings", () =>
    Effect.gen(function*() {
      const exit = yield* startupWith({})
      assert.isTrue(Exit.isSuccess(exit))
      if (Exit.isSuccess(exit)) {
        const { authentication } = exit.value
        assert.isFalse(authentication.allowInsecureLoopback)
        assert.deepEqual(authentication.callbackOrigins, {})
        assert.deepEqual(authentication.clientSecrets, {})
        assert.strictEqual(authentication.transactions.prefix, "preets:oidc-tx:v1")
        assert.strictEqual(Duration.toSeconds(authentication.transactions.ttl), 600)
      }
    }))

  it.effect.each(["0", "-1", "1.5", "word", "601", "060", " 60", "1e2", "0x10", "999999999999999999999999"])(
    "rejects transaction TTL %s without echoing it",
    (ttl) =>
      Effect.gen(function*() {
        const exit = yield* startupWith({ OIDC_TX_TTL_SECONDS: ttl })
        assert.isTrue(configError(exit))
        assert.notInclude(failureText(exit), ttl)
      })
  )

  it.effect.each(["1", "600"])("accepts transaction TTL boundary %s", (ttl) =>
    Effect.gen(function*() {
      const exit = yield* startupWith({ OIDC_TX_TTL_SECONDS: ttl })
      assert.isTrue(Exit.isSuccess(exit))
      if (Exit.isSuccess(exit)) {
        assert.strictEqual(Duration.toSeconds(exit.value.authentication.transactions.ttl), Number(ttl))
      }
    }))

  it.effect("rejects malformed credential JSON without echoing it", () =>
    Effect.gen(function*() {
      const raw = "{controlled-invalid-secret-map"
      const exit = yield* startupWith({ OIDC_CLIENT_SECRETS_JSON: raw })
      assert.isTrue(configError(exit))
      assert.notInclude(failureText(exit), raw)
    }))

  it.effect("rejects malformed callback configuration", () =>
    Effect.gen(function*() {
      assert.isTrue(configError(yield* startupWith({ OIDC_CALLBACK_ORIGINS_JSON: "not-json" })))
    }))

  it.effect("rejects a callback authority that is not an origin", () =>
    Effect.gen(function*() {
      const exit = yield* startupWith({ OIDC_CALLBACK_ORIGINS_JSON: JSON.stringify({ alpha: "https://a.test/path" }) })
      assert.isTrue(configError(exit))
    }))
})
