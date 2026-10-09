import fs from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"

import { springfieldConfig, writeTempTenantConfigDir } from "./tenant-fixtures.ts"

const tempDirs: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true })
  }
})

function configDirWith(files: Readonly<Record<string, string>>): string {
  const dir = writeTempTenantConfigDir([], { rawFiles: files })
  tempDirs.push(dir)
  return dir
}

async function loadTenant(configDir: string) {
  vi.stubEnv("NODE_ENV", "production")
  vi.stubEnv("TENANT_CONFIG_DIR", configDir)
  vi.resetModules()
  return await import("../../src/lib/tenant/index.ts")
}

describe("tenant public interface", () => {
  it("returns the tenant config for a known alias", async () => {
    const tenant = await loadTenant(configDirWith({
      "springfield.json": JSON.stringify(springfieldConfig)
    }))

    await expect(tenant.getCurrentTenantConfig("springfield")).resolves.toEqual(springfieldConfig)
  })

  it("rejects www", async () => {
    const tenant = await loadTenant(configDirWith({
      "springfield.json": JSON.stringify(springfieldConfig)
    }))

    await expect(tenant.getCurrentTenantConfig("www")).rejects.toBeInstanceOf(tenant.TenantConfigError)
  })

  it("rejects a missing tenant file", async () => {
    const tenant = await loadTenant(configDirWith({
      "springfield.json": JSON.stringify(springfieldConfig)
    }))

    await expect(tenant.getCurrentTenantConfig("shelbyville")).rejects.toBeInstanceOf(tenant.TenantConfigError)
  })

  it("resolves an unknown host as unknown", async () => {
    const tenant = await loadTenant(configDirWith({}))

    await expect(tenant.createEnvTenantOperations().resolve({ host: undefined })).resolves.toEqual({
      kind: "unknown"
    })
  })

  it("resolves a host to the associated tenant config", async () => {
    vi.stubEnv("BASE_HOSTNAME", "localhost")
    const tenant = await loadTenant(configDirWith({
      "springfield.json": JSON.stringify(springfieldConfig)
    }))

    await expect(tenant.createEnvTenantOperations().resolve({ host: "springfield.localhost" })).resolves.toEqual({
      config: springfieldConfig,
      kind: "ok",
      origin: "host-associated",
      tenantId: "springfield"
    })
  })
})
