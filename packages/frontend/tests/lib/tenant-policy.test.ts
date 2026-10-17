import { Effect, FileSystem, Logger, Path, Result } from "effect"
import { describe, expect, it } from "vitest"

import { TenantConfigService } from "../../src/lib/tenant.ts"

const tenantFile = {
  displayName: "Policy example",
  oidc: {
    clientAuth: "public",
    clientId: "policy-client",
    issuer: "https://identity.example.test"
  }
}

const readPolicy = (policy: Record<string, unknown>) => {
  const document = { ...tenantFile, ...policy }
  return Effect.gen(function*() {
    const service = yield* TenantConfigService
    const config = yield* service.getConfigFromHost("policy.example.test")
    return { config, policy: service.effectiveSessionPolicy(config) }
  }).pipe(
    Effect.result,
    Effect.provide(TenantConfigService.layer({
      env: "test",
      tenant: { baseHostname: "example.test", configDir: "/tenant-config", resolution: "host" }
    })),
    Effect.provide(FileSystem.layerNoop({
      readDirectory: () => Effect.succeed(["policy.json"]),
      readFileString: () => Effect.succeed(JSON.stringify(document))
    })),
    Effect.provide(Path.layer),
    Effect.provide(Logger.layer([])),
    Effect.runPromise
  )
}

const validTimeouts = Array.from({ length: 26 }, (_, offset) => offset + 5)

describe("effective tenant session policy", () => {
  it("defaults omitted policy to 30/5 without adding fields to the parsed tenant file", async () => {
    const result = await readPolicy({})
    expect(result).toStrictEqual(Result.succeed({
      config: tenantFile,
      policy: { idleTimeoutMinutes: 30, warningLeadMinutes: 5 }
    }))
  })

  it.each(validTimeouts)("accepts timeout %i and applies its omitted-warning default", async (idleTimeoutMinutes) => {
    const result = await readPolicy({ idleTimeoutMinutes })
    expect(result).toStrictEqual(Result.succeed({
      config: { ...tenantFile, idleTimeoutMinutes },
      policy: { idleTimeoutMinutes, warningLeadMinutes: idleTimeoutMinutes === 5 ? 0 : 5 }
    }))
  })

  it.each(validTimeouts)(
    "accepts every whole-minute warning below timeout %i, including explicit disable",
    async (idleTimeoutMinutes) => {
      for (let warningLeadMinutes = 0; warningLeadMinutes < idleTimeoutMinutes; warningLeadMinutes++) {
        const result = await readPolicy({ idleTimeoutMinutes, warningLeadMinutes })
        expect(result).toStrictEqual(Result.succeed({
          config: { ...tenantFile, idleTimeoutMinutes, warningLeadMinutes },
          policy: { idleTimeoutMinutes, warningLeadMinutes }
        }))
      }
    }
  )

  it.each([0, 1, 29])(
    "validates explicit warning %i against the omitted 30-minute timeout",
    async (warningLeadMinutes) => {
      const result = await readPolicy({ warningLeadMinutes })
      expect(result).toStrictEqual(Result.succeed({
        config: { ...tenantFile, warningLeadMinutes },
        policy: { idleTimeoutMinutes: 30, warningLeadMinutes }
      }))
    }
  )

  it.each([
    ["below range", 4],
    ["above range", 31],
    ["fractional", 5.5],
    ["numeric string", "15"],
    ["null", null],
    ["boolean", true]
  ])("rejects an explicit %s timeout without substituting defaults", async (_name, idleTimeoutMinutes) => {
    const result = await readPolicy({ idleTimeoutMinutes })
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) expect(result.failure.status).toBe(404)
  })

  it.each([
    ["negative", -1],
    ["fractional", 1.5],
    ["numeric string", "0"],
    ["null", null],
    ["boolean", false],
    ["equal to default timeout", 30],
    ["above default timeout", 31]
  ])("rejects an explicit %s warning without substituting defaults", async (_name, warningLeadMinutes) => {
    const result = await readPolicy({ warningLeadMinutes })
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) expect(result.failure.status).toBe(404)
  })

  it.each(validTimeouts)("rejects warning equal to or greater than explicit timeout %i", async (idleTimeoutMinutes) => {
    for (const warningLeadMinutes of [idleTimeoutMinutes, idleTimeoutMinutes + 1]) {
      const result = await readPolicy({ idleTimeoutMinutes, warningLeadMinutes })
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) expect(result.failure.status).toBe(404)
    }
  })
})
