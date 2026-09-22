import fs from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CONFIG_UNAVAILABLE, INVALID_MODE_DIAGNOSTIC, LOCAL_CONFIG_ERROR } from "../../src/lib/tenant/types.ts"
import { setRequestHost } from "./next-headers-stub.ts"
import { localRecord, springfieldConfig, springfieldRecord, writeTempTenantConfigDir } from "./tenant-fixtures.ts"

function isForbidden(error: unknown): boolean {
  return error instanceof Error && error.message === "FORBIDDEN"
}

describe("tenant runtime", () => {
  const tempDirs: string[] = []

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    setRequestHost(undefined)
    vi.resetModules()
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true })
    }
  })

  it("uses the production suffix and ignores TENANT_RESOLUTION=static", async () => {
    const dir = writeTempTenantConfigDir([springfieldRecord])
    tempDirs.push(dir)
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("TENANT_RESOLUTION", "static")
    vi.stubEnv("TENANT_STATIC_ALIAS", "springfield")
    vi.stubEnv("TENANT_CONFIG_DIR", dir)
    const { getCurrentTenant } = await import("../../src/lib/tenant/prod.ts")

    setRequestHost("springfield.pathable.com")
    await expect(getCurrentTenant()).resolves.toBe("springfield")

    setRequestHost("springfield.localhost:3000")
    await expect(getCurrentTenant()).rejects.toSatisfy(isForbidden)
  })

  it("uses the development suffix for host association", async () => {
    const dir = writeTempTenantConfigDir([springfieldRecord])
    tempDirs.push(dir)
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("TENANT_RESOLUTION", "host")
    vi.stubEnv("TENANT_CONFIG_DIR", dir)
    const { getCurrentTenant } = await import("../../src/lib/tenant/dev.ts")

    setRequestHost("springfield.localhost:3000")
    await expect(getCurrentTenant()).resolves.toBe("springfield")

    setRequestHost("springfield.pathable.com")
    await expect(getCurrentTenant()).rejects.toSatisfy(isForbidden)
  })

  it("ignores Host in development static mode", async () => {
    const dir = writeTempTenantConfigDir([localRecord])
    tempDirs.push(dir)
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("TENANT_RESOLUTION", "static")
    vi.stubEnv("TENANT_STATIC_ALIAS", "springfield")
    vi.stubEnv("TENANT_CONFIG_DIR", dir)
    const { getCurrentTenant, getCurrentTenantConfig } = await import("../../src/lib/tenant/dev.ts")

    setRequestHost("shelbyville.localhost:3000")
    await expect(getCurrentTenant()).resolves.toBe("springfield")
    await expect(getCurrentTenantConfig("springfield")).resolves.toEqual({
      displayName: "Local Demo",
      oidc: springfieldConfig.oidc
    })
  })

  it("emits the safe invalid-mode diagnostic once and still selects host", async () => {
    const dir = writeTempTenantConfigDir([springfieldRecord])
    tempDirs.push(dir)
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("TENANT_RESOLUTION", "automatic")
    vi.stubEnv("TENANT_CONFIG_DIR", dir)
    const { getCurrentTenant } = await import("../../src/lib/tenant/dev.ts")

    expect(error).toHaveBeenCalledWith(JSON.stringify(INVALID_MODE_DIAGNOSTIC))
    expect(JSON.stringify(error.mock.calls)).not.toContain("automatic")

    setRequestHost("springfield.localhost:3000")
    await expect(getCurrentTenant()).resolves.toBe("springfield")
  })

  it("does not change selection when the diagnostic sink throws", async () => {
    const dir = writeTempTenantConfigDir([springfieldRecord])
    tempDirs.push(dir)
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("sink failed")
    })
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("TENANT_RESOLUTION", "automatic")
    vi.stubEnv("TENANT_CONFIG_DIR", dir)
    const { getCurrentTenant } = await import("../../src/lib/tenant/dev.ts")

    setRequestHost("springfield.localhost:3000")
    await expect(getCurrentTenant()).resolves.toBe("springfield")
  })

  it("throws when development static alias is missing", async () => {
    const dir = writeTempTenantConfigDir([springfieldRecord])
    tempDirs.push(dir)
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("TENANT_RESOLUTION", "static")
    vi.stubEnv("TENANT_CONFIG_DIR", dir)
    const { getCurrentTenant } = await import("../../src/lib/tenant/dev.ts")
    await expect(getCurrentTenant()).rejects.toThrow(LOCAL_CONFIG_ERROR)
  })

  it("forbids a non-canonical or unknown slug in the config accessor", async () => {
    const dir = writeTempTenantConfigDir([springfieldRecord])
    tempDirs.push(dir)
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("TENANT_CONFIG_DIR", dir)
    const { getCurrentTenantConfig } = await import("../../src/lib/tenant/index.ts")

    await expect(getCurrentTenantConfig("www")).rejects.toSatisfy(isForbidden)
    await expect(getCurrentTenantConfig("shelbyville")).rejects.toSatisfy(isForbidden)
  })

  it("throws when a tenant file cannot be parsed", async () => {
    const dir = writeTempTenantConfigDir([], { rawFiles: { "springfield.json": "{not-json" } })
    tempDirs.push(dir)
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("TENANT_CONFIG_DIR", dir)
    const { getCurrentTenantConfig } = await import("../../src/lib/tenant/index.ts")
    await expect(getCurrentTenantConfig("springfield")).rejects.toThrow(CONFIG_UNAVAILABLE)
  })

  it("throws when a configured record is invalid", async () => {
    const dir = writeTempTenantConfigDir([], {
      rawFiles: {
        "springfield.json": JSON.stringify({ config: { displayName: "" }, slug: "springfield" })
      }
    })
    tempDirs.push(dir)
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("TENANT_CONFIG_DIR", dir)
    const { getCurrentTenantConfig } = await import("../../src/lib/tenant/index.ts")
    await expect(getCurrentTenantConfig("springfield")).rejects.toThrow(CONFIG_UNAVAILABLE)
  })

  it("returns Display Name and oidc for a known slug", async () => {
    const dir = writeTempTenantConfigDir([springfieldRecord])
    tempDirs.push(dir)
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("TENANT_CONFIG_DIR", dir)
    const { getCurrentTenantConfig } = await import("../../src/lib/tenant/index.ts")
    await expect(getCurrentTenantConfig("springfield")).resolves.toEqual(springfieldConfig)
  })

  it("loads production host association unless NODE_ENV is development", async () => {
    const dir = writeTempTenantConfigDir([springfieldRecord, localRecord])
    tempDirs.push(dir)
    fs.writeFileSync(`${dir}/springfield.json`, JSON.stringify(springfieldRecord))
    vi.stubEnv("NODE_ENV", "test")
    vi.stubEnv("TENANT_RESOLUTION", "static")
    vi.stubEnv("TENANT_STATIC_ALIAS", "springfield")
    vi.stubEnv("TENANT_CONFIG_DIR", dir)
    const { getCurrentTenant } = await import("../../src/lib/tenant/index.ts")

    setRequestHost("springfield.pathable.com")
    await expect(getCurrentTenant()).resolves.toBe("springfield")

    setRequestHost("springfield.localhost:3000")
    await expect(getCurrentTenant()).rejects.toSatisfy(isForbidden)
  })
})
