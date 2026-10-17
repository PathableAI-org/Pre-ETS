import { Effect, FileSystem, Layer, Option, Path, Redacted, References, Result } from "effect"
import { inspect } from "node:util"
import { describe, expect, it } from "vitest"

import type { TenantConfig } from "../../src/lib/tenant-config.ts"

import { TenantSecretLookupError, TenantSecrets } from "../../src/lib/tenant-secrets.ts"
import { TenantConfigService } from "../../src/lib/tenant.ts"

const publicConfig: TenantConfig = {
  displayName: "Springfield",
  oidc: { clientAuth: "public", clientId: "springfield-app", issuer: "https://identity.test" }
}
const confidentialConfig = (reference: string): TenantConfig => ({
  ...publicConfig,
  oidc: { ...publicConfig.oidc, clientAuth: "confidential", clientSecretRef: reference }
})

const tenantLayer = TenantConfigService.layer({
  env: "test",
  tenant: { baseHostname: "example.test", configDir: "/tenant-config", resolution: "host" }
}).pipe(
  Layer.provide(FileSystem.layerNoop({
    readDirectory: () => Effect.succeed([]),
    readFileString: () => Effect.succeed(JSON.stringify(confidentialConfig("springfield-oidc")))
  })),
  Layer.provide(Path.layer)
)

// Synthetic in-memory provider for contract evidence; it makes no claim about a deployed secrets service.
const syntheticSecretsLayer = (entries: ReadonlyMap<string, Redacted.Redacted>) => {
  const secrets = new Map(entries)
  return Layer.succeed(
    TenantSecrets,
    TenantSecrets.of({
      resolve: (reference) =>
        Effect.suspend(() => {
          const secret = secrets.get(reference)
          return secret === undefined ?
            Effect.fail(new TenantSecretLookupError({})) :
            Effect.succeed(secret)
        })
    })
  )
}

const syntheticClientSecret = "synthetic-client-secret-never-use"
const syntheticOtherSecret = "synthetic-other-secret-never-use"
const secretsLayer = syntheticSecretsLayer(
  new Map([
    ["shelbyville-oidc", Redacted.make(syntheticOtherSecret)],
    ["springfield-oidc", Redacted.make(syntheticClientSecret)]
  ])
)

const resolveCredential = (config: TenantConfig) =>
  Effect.gen(function*() {
    const service = yield* TenantConfigService
    return yield* service.resolveClientSecret(config)
  }).pipe(
    Effect.provide(tenantLayer),
    Effect.provideService(References.MinimumLogLevel, "Error")
  )

const expectSecret = (result: Option.Option<Redacted.Redacted>, expected: string) => {
  expect(Option.isSome(result)).toBe(true)
  if (Option.isSome(result)) {
    expect(Redacted.value(result.value)).toBe(expected)
    for (const representation of [JSON.stringify(result), inspect(result)]) {
      expect(representation).not.toContain(expected)
    }
  }
}

describe("TenantConfigService authentication credential handoff", () => {
  it("returns no credential for public clients without invoking the secret provider", () => {
    const lookups: string[] = []
    const result = Effect.runSync(
      resolveCredential(publicConfig).pipe(
        Effect.provideService(
          TenantSecrets,
          TenantSecrets.of({
            resolve: (reference) => {
              lookups.push(reference)
              return Effect.fail(new TenantSecretLookupError({}))
            }
          })
        )
      )
    )
    expect(result).toStrictEqual(Option.none())
    expect(lookups).toStrictEqual([])
  })

  it("resolves each confidential reference to its own redacted credential", () => {
    const springfield = Effect.runSync(
      resolveCredential(confidentialConfig("springfield-oidc")).pipe(Effect.provide(secretsLayer))
    )
    const shelbyville = Effect.runSync(
      resolveCredential(confidentialConfig("shelbyville-oidc")).pipe(Effect.provide(secretsLayer))
    )

    expectSecret(springfield, syntheticClientSecret)
    expectSecret(shelbyville, syntheticOtherSecret)
  })

  it("fails an unknown reference without disclosing resolved credentials or echoing lookup input", () => {
    const missingReference = "synthetic-provider-credential-never-use"
    const result = Effect.runSync(
      resolveCredential(confidentialConfig(missingReference)).pipe(
        Effect.provide(secretsLayer),
        Effect.result
      )
    )

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(TenantSecretLookupError)
      expect(result.failure.message).toBe("Tenant credential is unavailable")
      for (const representation of [JSON.stringify(result), String(result.failure), inspect(result.failure)]) {
        expect(representation).not.toContain(syntheticClientSecret)
        expect(representation).not.toContain(syntheticOtherSecret)
        expect(representation).not.toContain(missingReference)
      }
    }
  })

  it("reads confidential tenant files without invoking an available secret provider or returning its credential", () => {
    const lookups: string[] = []
    const document = Effect.runSync(
      Effect.gen(function*() {
        const service = yield* TenantConfigService
        return yield* service.getConfigFromHost("springfield.example.test")
      }).pipe(
        Effect.provide(tenantLayer),
        Effect.provideService(References.MinimumLogLevel, "Error"),
        Effect.provideService(
          TenantSecrets,
          TenantSecrets.of({
            resolve: (reference) => {
              lookups.push(reference)
              return Effect.succeed(Redacted.make(syntheticClientSecret))
            }
          })
        )
      )
    )
    expect(document).toStrictEqual(confidentialConfig("springfield-oidc"))
    expect(lookups).toStrictEqual([])
    expect(JSON.stringify(document)).not.toContain(syntheticClientSecret)
  })
})
