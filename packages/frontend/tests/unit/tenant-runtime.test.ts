import { afterEach, describe, expect, it, vi } from "vitest"

import { CONFIG_UNAVAILABLE, INVALID_MODE_DIAGNOSTIC, LOCAL_CONFIG_ERROR } from "../../src/lib/tenant/types.ts"
import { setRequestHost } from "./next-headers-stub.ts"

function isForbidden(error: unknown): boolean {
  return error instanceof Error && error.message === "FORBIDDEN"
}

const springfieldRecords = JSON.stringify([
  {
    config: { displayName: "Springfield Demo" },
    slug: "springfield"
  }
])

const localRecord = JSON.stringify({
  config: { displayName: "Local Demo" },
  slug: "springfield"
})

describe("tenant runtime", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    setRequestHost(undefined)
    vi.resetModules()
  })

  it("uses the production suffix and ignores TENANT_RESOLUTION=static", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("TENANT_RESOLUTION", "static")
    vi.stubEnv("TENANT_CONFIG_RECORDS_JSON", springfieldRecords)
    vi.stubEnv("TENANT_LOCAL_CONFIG_JSON", localRecord)
    const { getCurrentTenant } = await import("../../src/lib/tenant/prod.ts")

    setRequestHost("springfield.pathable.com")
    await expect(getCurrentTenant()).resolves.toBe("springfield")

    setRequestHost("springfield.localhost:3000")
    await expect(getCurrentTenant()).rejects.toSatisfy(isForbidden)
  })

  it("uses the development suffix for host association", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("TENANT_RESOLUTION", "host")
    vi.stubEnv("TENANT_CONFIG_RECORDS_JSON", springfieldRecords)
    const { getCurrentTenant } = await import("../../src/lib/tenant/dev.ts")

    setRequestHost("springfield.localhost:3000")
    await expect(getCurrentTenant()).resolves.toBe("springfield")

    setRequestHost("springfield.pathable.com")
    await expect(getCurrentTenant()).rejects.toSatisfy(isForbidden)
  })

  it("ignores Host in development static mode", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("TENANT_RESOLUTION", "static")
    vi.stubEnv("TENANT_LOCAL_CONFIG_JSON", localRecord)
    const { getCurrentTenant, getCurrentTenantConfig } = await import("../../src/lib/tenant/dev.ts")

    setRequestHost("shelbyville.localhost:3000")
    await expect(getCurrentTenant()).resolves.toBe("springfield")
    await expect(getCurrentTenantConfig("springfield")).resolves.toEqual({ displayName: "Local Demo" })
  })

  it("emits the safe invalid-mode diagnostic once and still selects host", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("TENANT_RESOLUTION", "automatic")
    vi.stubEnv("TENANT_CONFIG_RECORDS_JSON", springfieldRecords)
    const { getCurrentTenant } = await import("../../src/lib/tenant/dev.ts")

    expect(error).toHaveBeenCalledWith(JSON.stringify(INVALID_MODE_DIAGNOSTIC))
    expect(JSON.stringify(error.mock.calls)).not.toContain("automatic")

    setRequestHost("springfield.localhost:3000")
    await expect(getCurrentTenant()).resolves.toBe("springfield")
  })

  it("does not change selection when the diagnostic sink throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("sink failed")
    })
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("TENANT_RESOLUTION", "automatic")
    vi.stubEnv("TENANT_CONFIG_RECORDS_JSON", springfieldRecords)
    const { getCurrentTenant } = await import("../../src/lib/tenant/dev.ts")

    setRequestHost("springfield.localhost:3000")
    await expect(getCurrentTenant()).resolves.toBe("springfield")
  })

  it("throws when development static data is missing", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("TENANT_RESOLUTION", "static")
    const { getCurrentTenant } = await import("../../src/lib/tenant/dev.ts")
    await expect(getCurrentTenant()).rejects.toThrow(LOCAL_CONFIG_ERROR)
  })

  it("forbids a non-canonical or unknown slug in the config accessor", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("TENANT_CONFIG_RECORDS_JSON", springfieldRecords)
    const { getCurrentTenantConfig } = await import("../../src/lib/tenant/index.ts")

    await expect(getCurrentTenantConfig("www")).rejects.toSatisfy(isForbidden)
    await expect(getCurrentTenantConfig("shelbyville")).rejects.toSatisfy(isForbidden)
  })

  it("throws when configured records cannot be read", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("TENANT_CONFIG_RECORDS_JSON", "{not-json")
    const { getCurrentTenantConfig } = await import("../../src/lib/tenant/index.ts")
    await expect(getCurrentTenantConfig("springfield")).rejects.toThrow(CONFIG_UNAVAILABLE)
  })

  it("throws when a configured record is invalid", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv(
      "TENANT_CONFIG_RECORDS_JSON",
      JSON.stringify([{ config: { displayName: "" }, slug: "springfield" }])
    )
    const { getCurrentTenantConfig } = await import("../../src/lib/tenant/index.ts")
    await expect(getCurrentTenantConfig("springfield")).rejects.toThrow(CONFIG_UNAVAILABLE)
  })

  it("returns Display Name for a known slug", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("TENANT_CONFIG_RECORDS_JSON", springfieldRecords)
    const { getCurrentTenantConfig } = await import("../../src/lib/tenant/index.ts")
    await expect(getCurrentTenantConfig("springfield")).resolves.toEqual({
      displayName: "Springfield Demo"
    })
  })

  it("loads production host association unless NODE_ENV is development", async () => {
    vi.stubEnv("NODE_ENV", "test")
    vi.stubEnv("TENANT_RESOLUTION", "static")
    vi.stubEnv("TENANT_CONFIG_RECORDS_JSON", springfieldRecords)
    vi.stubEnv("TENANT_LOCAL_CONFIG_JSON", localRecord)
    const { getCurrentTenant } = await import("../../src/lib/tenant/index.ts")

    setRequestHost("springfield.pathable.com")
    await expect(getCurrentTenant()).resolves.toBe("springfield")

    setRequestHost("springfield.localhost:3000")
    await expect(getCurrentTenant()).rejects.toSatisfy(isForbidden)
  })
})
