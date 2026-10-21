import { describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem, Logger, Path, Result } from "effect"

import { TenantConfigService } from "../../src/lib/tenant.ts"

const tenantFile = {
  displayName: "Policy example",
  oidc: {
    clientAuth: "public",
    clientId: "policy-client",
    issuer: "https://identity.example.test"
  }
}

const readPolicy = Effect.fnUntraced(
  function*(_policy: Record<string, unknown>) {
    const service = yield* TenantConfigService
    const config = yield* service.getConfigFromHost("policy.example.test")
    return { config, policy: service.effectiveSessionPolicy(config) }
  },
  Effect.result,
  (effect, policy) =>
    effect.pipe(
      Effect.provide(TenantConfigService.layer({
        env: "test",
        tenant: { baseHostname: "example.test", configDir: "/tenant-config", resolution: "host" }
      })),
      Effect.provide(FileSystem.layerNoop({
        readDirectory: () => Effect.succeed(["policy.json"]),
        readFileString: () => Effect.succeed(JSON.stringify({ ...tenantFile, ...policy }))
      })),
      Effect.provide(Path.layer),
      Effect.provide(Logger.layer([]))
    )
)

const validTimeouts = Array.from({ length: 26 }, (_, offset) => offset + 5)

describe("effective tenant session policy", () => {
  it.effect("defaults omitted policy to 30/5 without adding fields to the parsed tenant file", () =>
    Effect.gen(function*() {
      const result = yield* readPolicy({})
      expect(result).toStrictEqual(Result.succeed({
        config: tenantFile,
        policy: { idleTimeoutMinutes: 30, warningLeadMinutes: 5 }
      }))
    }))

  it.effect.each(validTimeouts)(
    "accepts timeout %i and applies its omitted-warning default",
    (idleTimeoutMinutes) =>
      Effect.gen(function*() {
        const result = yield* readPolicy({ idleTimeoutMinutes })
        expect(result).toStrictEqual(Result.succeed({
          config: { ...tenantFile, idleTimeoutMinutes },
          policy: { idleTimeoutMinutes, warningLeadMinutes: idleTimeoutMinutes === 5 ? 0 : 5 }
        }))
      })
  )

  it.effect.each(validTimeouts)(
    "accepts every whole-minute warning below timeout %i, including explicit disable",
    (idleTimeoutMinutes) =>
      Effect.gen(function*() {
        for (let warningLeadMinutes = 0; warningLeadMinutes < idleTimeoutMinutes; warningLeadMinutes++) {
          const result = yield* readPolicy({ idleTimeoutMinutes, warningLeadMinutes })
          expect(result).toStrictEqual(Result.succeed({
            config: { ...tenantFile, idleTimeoutMinutes, warningLeadMinutes },
            policy: { idleTimeoutMinutes, warningLeadMinutes }
          }))
        }
      })
  )

  it.effect.each([0, 1, 29])(
    "validates explicit warning %i against the omitted 30-minute timeout",
    (warningLeadMinutes) =>
      Effect.gen(function*() {
        const result = yield* readPolicy({ warningLeadMinutes })
        expect(result).toStrictEqual(Result.succeed({
          config: { ...tenantFile, warningLeadMinutes },
          policy: { idleTimeoutMinutes: 30, warningLeadMinutes }
        }))
      })
  )

  it.effect.each([
    ["below range", 4],
    ["above range", 31],
    ["fractional", 5.5],
    ["numeric string", "15"],
    ["null", null],
    ["boolean", true]
  ])(
    "rejects an explicit %s timeout without substituting defaults",
    ([_name, idleTimeoutMinutes]) =>
      Effect.gen(function*() {
        const result = yield* readPolicy({ idleTimeoutMinutes })
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) expect(result.failure.status).toBe(404)
      })
  )

  it.effect.each([
    ["negative", -1],
    ["fractional", 1.5],
    ["numeric string", "0"],
    ["null", null],
    ["boolean", false],
    ["equal to default timeout", 30],
    ["above default timeout", 31]
  ])(
    "rejects an explicit %s warning without substituting defaults",
    ([_name, warningLeadMinutes]) =>
      Effect.gen(function*() {
        const result = yield* readPolicy({ warningLeadMinutes })
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) expect(result.failure.status).toBe(404)
      })
  )

  it.effect.each(validTimeouts)(
    "rejects warning equal to or greater than explicit timeout %i",
    (idleTimeoutMinutes) =>
      Effect.gen(function*() {
        for (const warningLeadMinutes of [idleTimeoutMinutes, idleTimeoutMinutes + 1]) {
          const result = yield* readPolicy({ idleTimeoutMinutes, warningLeadMinutes })
          expect(Result.isFailure(result)).toBe(true)
          if (Result.isFailure(result)) expect(result.failure.status).toBe(404)
        }
      })
  )
})
