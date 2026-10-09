import { assert, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path, Schema } from "effect"
import { describe } from "vitest"

import { SecretsProvider } from "../../src/lib/secrets/provider.ts"
import { TenantAlias, type TenantConfig, TenantConfigError } from "../../src/lib/tenant/schema.ts"
import { TenantConfigService } from "../../src/lib/tenant/service.ts"

const configDir = "/tenants"
const aliasName = "springfield"
const lookupKey = "springfield-oidc-client"
const syntheticSecret = "synthetic-oidc-client-secret"

const permittedConfig = {
  displayName: "Springfield Demo",
  idleTimeoutMinutes: 5,
  oidc: {
    clientAuth: "confidential",
    clientId: "springfield-web",
    clientSecretKey: lookupKey,
    issuer: "http://127.0.0.1:8080/realms/pre-ets"
  }
} satisfies TenantConfig

const tenantFilePath = `${configDir}/${aliasName}.json`

const tenantLayer = (contents: string) =>
  TenantConfigService.layer({
    env: "test",
    tenant: {
      baseHostname: "example.test",
      configDir,
      resolution: "host"
    }
  }).pipe(
    Layer.provide(FileSystem.layerNoop({
      readFileString: (filePath) => {
        if (filePath !== tenantFilePath) {
          return Effect.die(`Missing tenant file ${filePath}`)
        }
        return Effect.succeed(contents)
      }
    })),
    Layer.provide(Path.layer)
  )

const springfield = Schema.decodeUnknownSync(TenantAlias)(aliasName)

const loadConfig = Effect.gen(function*() {
  const service = yield* TenantConfigService
  return yield* service.getConfigFromAlias(springfield)
})

describe("non-secret tenant configuration", () => {
  it.effect("decodes a permitted file including the OIDC lookup key", () =>
    Effect.gen(function*() {
      const config = yield* loadConfig
      assert.deepStrictEqual(config, permittedConfig)
    }).pipe(Effect.provide(tenantLayer(JSON.stringify(permittedConfig)))))

  it.effect("rejects an unexpected top-level field", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(loadConfig)
      assert.instanceOf(error, TenantConfigError)
    }).pipe(
      Effect.provide(tenantLayer(JSON.stringify({
        ...permittedConfig,
        password: syntheticSecret
      })))
    ))

  it.effect("rejects an unexpected nested OIDC field", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(loadConfig)
      assert.instanceOf(error, TenantConfigError)
    }).pipe(
      Effect.provide(tenantLayer(JSON.stringify({
        ...permittedConfig,
        oidc: {
          ...permittedConfig.oidc,
          clientSecret: syntheticSecret
        }
      })))
    ))

  it.effect("resolves the lookup key without placing the secret in tenant configuration", () =>
    Effect.gen(function*() {
      const config = yield* loadConfig
      const secrets = yield* SecretsProvider
      const key = config.oidc.clientSecretKey
      if (key === undefined) {
        return yield* Effect.die("expected clientSecretKey")
      }

      const resolved = yield* secrets.resolve(key)
      assert.strictEqual(resolved, syntheticSecret)
      assert.strictEqual(config.oidc.clientSecretKey, lookupKey)
      assert.equal(JSON.stringify(config).includes(syntheticSecret), false)
    }).pipe(
      Effect.provide(tenantLayer(JSON.stringify(permittedConfig))),
      Effect.provide(SecretsProvider.layerMemory({
        [lookupKey]: syntheticSecret
      }))
    ))
})
