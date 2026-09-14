import { describe, expect, it } from "vitest"

import { INVALID_MODE_DIAGNOSTIC } from "../../src/tenant/model.ts"
import { loadTenantSettings } from "../../src/tenant/settings.ts"

const springfield = {
  config: { displayName: "Springfield Demo" },
  slug: "springfield"
}

describe("tenant settings", () => {
  it("does not parse unused local static data in host mode", () => {
    const settings = loadTenantSettings({
      NODE_ENV: "production",
      TENANT_CONFIG_RECORDS_JSON: JSON.stringify([springfield]),
      TENANT_LOCAL_CONFIG_JSON: "{not-json",
      TENANT_RESOLUTION: "host"
    })

    expect(settings.ok).toBe(true)
  })

  it("ignores production static mode and keeps host association", () => {
    const settings = loadTenantSettings({
      NODE_ENV: "production",
      TENANT_CONFIG_RECORDS_JSON: JSON.stringify([springfield]),
      TENANT_LOCAL_CONFIG_JSON: JSON.stringify({
        config: { displayName: "Must Not Be Used" },
        slug: "local-demo"
      }),
      TENANT_RESOLUTION: "static"
    })

    expect(settings.ok).toBe(true)
    if (!settings.ok) {
      return
    }

    expect(settings.value.mode).toBe("host")
    expect(settings.value.localRecord).toBeUndefined()
  })

  it("emits the safe invalid-mode diagnostic once and still selects host", () => {
    const warnings: unknown[] = []
    const settings = loadTenantSettings(
      {
        NODE_ENV: "development",
        TENANT_CONFIG_RECORDS_JSON: JSON.stringify([springfield]),
        TENANT_RESOLUTION: "automatic"
      },
      (diagnostic) => {
        warnings.push(diagnostic)
      }
    )

    expect(settings.ok).toBe(true)
    if (!settings.ok) {
      return
    }

    expect(settings.value.mode).toBe("host")
    expect(warnings).toEqual([INVALID_MODE_DIAGNOSTIC])
  })

  it("does not change selection when the warning sink throws", () => {
    const settings = loadTenantSettings(
      {
        NODE_ENV: "development",
        TENANT_CONFIG_RECORDS_JSON: JSON.stringify([springfield]),
        TENANT_RESOLUTION: "automatic"
      },
      () => {
        throw new Error("sink failed")
      }
    )

    expect(settings.ok).toBe(true)
    if (!settings.ok) {
      return
    }

    expect(settings.value.mode).toBe("host")
  })

  it("requires a valid local record only in effective static mode", () => {
    const missing = loadTenantSettings({
      NODE_ENV: "development",
      TENANT_RESOLUTION: "static"
    })
    expect(missing).toMatchObject({ mode: "static", ok: false, reason: "invalid-config" })
  })
})
