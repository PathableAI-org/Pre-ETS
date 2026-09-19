import { describe, expect, it } from "vitest"

import { createStaticTenantSource } from "../../src/lib/tenant/source.ts"
import { CONFIG_UNAVAILABLE, effectiveIdleTimeoutMinutes, parseTenantConfig } from "../../src/lib/tenant/types.ts"

const validOidc = {
  clientAuth: "public" as const,
  clientId: "springfield-web",
  connection: "springfield-idp",
  issuer: "https://identity.example/realms/pre-ets"
}

const baseConfig = {
  displayName: "Springfield Demo",
  oidc: validOidc
}

describe("tenant idleTimeoutMinutes policy", () => {
  it("omits idleTimeoutMinutes → effective 30 for new sessions", () => {
    const config = parseTenantConfig(baseConfig)
    expect(config).toEqual(baseConfig)
    expect(config).toBeDefined()
    if (config === undefined) {
      return
    }
    expect(config.idleTimeoutMinutes).toBeUndefined()
    expect(effectiveIdleTimeoutMinutes(config)).toBe(30)
  })

  it("accepts every whole minute from 5 through 30 inclusive", () => {
    for (let minutes = 5; minutes <= 30; minutes += 1) {
      const config = parseTenantConfig({
        ...baseConfig,
        idleTimeoutMinutes: minutes
      })
      expect(config).toBeDefined()
      if (config === undefined) {
        return
      }
      expect(config.idleTimeoutMinutes).toBe(minutes)
      expect(effectiveIdleTimeoutMinutes(config)).toBe(minutes)
    }
  })

  it("rejects fractional, out-of-range, non-integer, null, and disable-like values", () => {
    const invalid = [4, 31, 0, -1, 5.5, true, false, "30", null, "disable"]
    for (const idleTimeoutMinutes of invalid) {
      expect(
        parseTenantConfig({
          ...baseConfig,
          idleTimeoutMinutes
        }),
        `expected reject for ${String(idleTimeoutMinutes)}`
      ).toBeUndefined()
    }
  })

  it("whole-source fail-fast: one invalid idle field makes the tenant source unusable", () => {
    expect(() =>
      createStaticTenantSource([
        {
          config: { ...baseConfig, idleTimeoutMinutes: 15 },
          slug: "springfield"
        },
        {
          config: { ...baseConfig, displayName: "Shelbyville", idleTimeoutMinutes: 4 },
          slug: "shelbyville"
        }
      ])
    ).toThrow(CONFIG_UNAVAILABLE)
  })

  it("does not substitute 30 when an explicit invalid idle field is present", () => {
    expect(
      parseTenantConfig({
        ...baseConfig,
        idleTimeoutMinutes: 31
      })
    ).toBeUndefined()
  })
})
