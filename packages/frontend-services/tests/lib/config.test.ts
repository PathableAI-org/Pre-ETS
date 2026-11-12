import { assert, it } from "@effect/vitest"
import { Cause, Config, ConfigProvider, Duration, Effect, Exit, Option, Redacted, Schema } from "effect"
import { inspect } from "node:util"
import { describe } from "vitest"

import { type OtelSettings, StartupConfig } from "../../src/config.ts"

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

  it.effect("keeps a decoded client secret redacted", () =>
    Effect.gen(function*() {
      const secret = "controlled-client-secret"
      const exit = yield* startupWith({ OIDC_CLIENT_SECRETS_JSON: JSON.stringify({ alpha: secret }) })
      assert.isTrue(Exit.isSuccess(exit))
      if (Exit.isSuccess(exit)) {
        const { clientSecrets } = exit.value.authentication
        assert.notInclude(`${inspect(clientSecrets)} ${JSON.stringify(clientSecrets)}`, secret)
        assert.strictEqual(clientSecrets.alpha && Redacted.value(clientSecrets.alpha), secret)
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

const otelOn = {
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318/",
  OTEL_SDK_DISABLED: false,
  OTEL_SERVICE_NAME: "pre-ets-frontend"
}

const browserTracingOf = (exit: Exit.Exit<{ readonly otel: OtelSettings }, unknown>) =>
  Exit.isSuccess(exit) && !exit.value.otel.disabled ? exit.value.otel.browserTracing : undefined

const endpointRefusal =
  "BROWSER_TRACING_ENABLED requires an OTEL_EXPORTER_OTLP_ENDPOINT without credentials, query, or fragment"

const trueLiterals = ["true", "yes", "on", "1", "y"] as const
const falseLiterals = ["false", "no", "off", "0", "n"] as const

describe("StartupConfig browser tracing switch (V-007)", () => {
  it.effect.each(
    [
      ["OTEL on, switch unset", otelOn, false],
      ["OTEL on, switch true", { ...otelOn, BROWSER_TRACING_ENABLED: "true" }, true],
      ["OTEL on, switch false", { ...otelOn, BROWSER_TRACING_ENABLED: "false" }, false],
      ["OTEL off, switch unset", {}, false],
      ["OTEL off, switch true", { BROWSER_TRACING_ENABLED: "true" }, false],
      ["OTEL off, switch false", { BROWSER_TRACING_ENABLED: "false" }, false]
    ] as const
  )("%s starts with browser tracing on: %s", ([, overrides, on]) =>
    Effect.gen(function*() {
      const exit = yield* startupWith(overrides)
      assert.isTrue(Exit.isSuccess(exit))
      assert.strictEqual(browserTracingOf(exit) !== undefined, on)
    }))

  it.effect.each([["OTEL on", otelOn], ["OTEL off", {}]] as const)(
    "%s refuses startup on an unrecognized switch value",
    ([, overrides]) =>
      Effect.gen(function*() {
        const exit = yield* startupWith({ ...overrides, BROWSER_TRACING_ENABLED: "maybe" })
        assert.isTrue(configError(exit))
        assert.include(failureText(exit), "BROWSER_TRACING_ENABLED")
      })
  )

  it.effect.prop(
    "browser tracing is on if and only if OTEL is on and the switch decodes to true",
    [Schema.Boolean, Schema.Literals(["unset", ...trueLiterals, ...falseLiterals])],
    ([otelEnabled, switchValue]) =>
      Effect.gen(function*() {
        const exit = yield* startupWith({
          ...(otelEnabled ? otelOn : {}),
          ...(switchValue === "unset" ? {} : { BROWSER_TRACING_ENABLED: switchValue })
        })
        assert.isTrue(Exit.isSuccess(exit))
        const expected = otelEnabled && (trueLiterals as readonly string[]).includes(switchValue)
        assert.strictEqual(browserTracingOf(exit) !== undefined, expected)
      })
  )
})

describe("StartupConfig browser tracing settings (V-009)", () => {
  const on = { ...otelOn, BROWSER_TRACING_ENABLED: "true" }

  it.effect("carries exactly the server's endpoint, name, version, and run identifier, and no headers", () =>
    Effect.gen(function*() {
      const exit = yield* startupWith({
        ...on,
        OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Bearer synthetic-collector-token",
        OTEL_RESOURCE_ATTRIBUTES: "service.version=abc123,service.instance.id=run%2D1",
        OTEL_SERVICE_VERSION: "abc123"
      })
      const settings = browserTracingOf(exit)
      assert.deepStrictEqual(
        settings === undefined ? undefined : { ...settings, endpoint: settings.endpoint.href },
        {
          endpoint: "http://127.0.0.1:4318/",
          serviceInstanceId: "run-1",
          serviceName: "pre-ets-frontend",
          serviceVersion: "abc123"
        }
      )
    }))

  it.effect.each(["service.instance.id=run-1,broken", "service.instance.id=run-1,a=b=c", "service.instance.id=%E0"])(
    "starts without a run identifier when the resource attribute list %s is malformed",
    (attributes) =>
      Effect.gen(function*() {
        const exit = yield* startupWith({ ...on, OTEL_RESOURCE_ATTRIBUTES: attributes })
        assert.isTrue(Exit.isSuccess(exit))
        assert.isDefined(browserTracingOf(exit))
        assert.isUndefined(browserTracingOf(exit)?.serviceInstanceId)
      })
  )

  it.effect.each(["true", "false"])(
    "refuses a malformed credential-bearing endpoint without echoing it (switch %s)",
    (switchValue) =>
      Effect.gen(function*() {
        const raw = "http://user:secret@[bad"
        const exit = yield* startupWith({
          ...otelOn,
          BROWSER_TRACING_ENABLED: switchValue,
          OTEL_EXPORTER_OTLP_ENDPOINT: raw
        })
        assert.isTrue(configError(exit))
        const text = failureText(exit)
        assert.include(text, "OTEL_EXPORTER_OTLP_ENDPOINT")
        assert.notInclude(text, "secret")
        assert.notInclude(text, "[bad")
      })
  )

  it.effect.each(
    [
      ["http://user:secret@127.0.0.1:4318/", "secret"],
      ["http://127.0.0.1:4318/?api_key=synthetic-key", "synthetic-key"],
      ["http://127.0.0.1:4318/#x", "#x"],
      ["ftp://127.0.0.1:4318/", "ftp:"]
    ] as const
  )("refuses endpoint %s when the switch is on, without echoing it", ([endpoint, secret]) =>
    Effect.gen(function*() {
      const exit = yield* startupWith({ ...on, OTEL_EXPORTER_OTLP_ENDPOINT: endpoint })
      assert.isTrue(configError(exit))
      const text = failureText(exit)
      assert.include(text, endpointRefusal)
      assert.notInclude(text, secret)
      assert.notInclude(text, "127.0.0.1")
    }))

  it.effect.each([
    "http://user:secret@127.0.0.1:4318/",
    "http://127.0.0.1:4318/?api_key=synthetic-key",
    "http://127.0.0.1:4318/#x"
  ])("accepts endpoint %s for server-only export when the switch is off", (endpoint) =>
    Effect.gen(function*() {
      const exit = yield* startupWith({ ...otelOn, OTEL_EXPORTER_OTLP_ENDPOINT: endpoint })
      assert.isTrue(Exit.isSuccess(exit))
      assert.isUndefined(browserTracingOf(exit))
    }))
})
