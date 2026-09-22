import fs from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createStaticTenantSource } from "../../src/lib/tenant/source.ts"
import { LOCAL_CONFIG_ERROR } from "../../src/lib/tenant/types.ts"
import {
  localRecord,
  shelbyvilleRecord,
  springfieldConfig,
  springfieldRecord,
  writeTempTenantConfigDir
} from "./tenant-fixtures.ts"

describe("tenant operations", () => {
  const tempDirs: string[] = []

  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true })
    }
  })

  it("forces host mode when production is true even if mode is static", async () => {
    const { createTenantOperations } = await import("../../src/lib/tenant/operations.ts")
    const operations = createTenantOperations({
      hostSuffix: "pathable.com",
      mode: "static",
      production: true,
      staticAlias: "springfield",
      tenantSource: createStaticTenantSource([springfieldRecord])
    })

    const result = await operations.resolve({ host: "springfield.pathable.com" })

    expect(result).toEqual({
      config: springfieldConfig,
      kind: "ok",
      origin: "host-associated",
      tenantId: "springfield"
    })
  })

  it("uses env.NODE_ENV for production default, not global process.env", async () => {
    const dir = writeTempTenantConfigDir([springfieldRecord, localRecord])
    tempDirs.push(dir)
    // localRecord overwrites springfield.json with Local Demo — write both distinctly
    fs.writeFileSync(
      `${dir}/springfield.json`,
      JSON.stringify(springfieldRecord)
    )
    fs.writeFileSync(`${dir}/shelbyville.json`, JSON.stringify(shelbyvilleRecord))

    vi.stubEnv("NODE_ENV", "development")
    const { createEnvTenantOperations } = await import("../../src/lib/tenant/operations.ts")

    const productionOps = createEnvTenantOperations({
      NODE_ENV: "production",
      TENANT_CONFIG_DIR: dir,
      TENANT_RESOLUTION: "static",
      TENANT_STATIC_ALIAS: "springfield"
    })
    const productionResult = await productionOps.resolve({ host: "springfield.pathable.com" })
    expect(productionResult).toMatchObject({
      kind: "ok",
      origin: "host-associated",
      tenantId: "springfield"
    })

    const localDir = writeTempTenantConfigDir([localRecord])
    tempDirs.push(localDir)
    const devOps = createEnvTenantOperations({
      NODE_ENV: "development",
      TENANT_CONFIG_DIR: localDir,
      TENANT_RESOLUTION: "static",
      TENANT_STATIC_ALIAS: "springfield"
    })
    const devResult = await devOps.resolve({ host: "shelbyville.localhost:3000" })
    expect(devResult).toMatchObject({
      kind: "ok",
      origin: "local-static",
      tenantId: "springfield"
    })
    if (devResult.kind === "ok") {
      expect(devResult.config.displayName).toBe("Local Demo")
    }
  })

  it("honors an explicit production override argument", async () => {
    const dir = writeTempTenantConfigDir([springfieldRecord])
    tempDirs.push(dir)
    const { createEnvTenantOperations } = await import("../../src/lib/tenant/operations.ts")

    const ops = createEnvTenantOperations(
      {
        NODE_ENV: "development",
        TENANT_CONFIG_DIR: dir,
        TENANT_RESOLUTION: "static",
        TENANT_STATIC_ALIAS: "springfield"
      },
      true
    )
    const result = await ops.resolve({ host: "springfield.pathable.com" })

    expect(result).toMatchObject({
      kind: "ok",
      origin: "host-associated",
      tenantId: "springfield"
    })
  })

  it("isolates two filesystem tenants and maps missing/mismatch correctly", async () => {
    const dir = writeTempTenantConfigDir([springfieldRecord, shelbyvilleRecord])
    tempDirs.push(dir)
    const { createTenantOperations } = await import("../../src/lib/tenant/operations.ts")
    const operations = createTenantOperations({
      configDir: dir,
      hostSuffix: "pathable.com",
      mode: "host"
    })

    await expect(operations.resolve({ host: "springfield.pathable.com" })).resolves.toMatchObject({
      kind: "ok",
      origin: "host-associated",
      tenantId: "springfield"
    })
    await expect(operations.resolve({ host: "shelbyville.pathable.com" })).resolves.toMatchObject({
      kind: "ok",
      tenantId: "shelbyville"
    })
    await expect(operations.resolve({ host: "unknown.pathable.com" })).resolves.toEqual({
      kind: "unknown"
    })

    fs.writeFileSync(
      `${dir}/springfield.json`,
      JSON.stringify({ ...shelbyvilleRecord, slug: "shelbyville" })
    )
    // Bust process cache by constructing a fresh operations/source
    const fresh = createTenantOperations({
      configDir: dir,
      hostSuffix: "pathable.com",
      mode: "host"
    })
    await expect(fresh.resolve({ host: "springfield.pathable.com" })).resolves.toMatchObject({
      kind: "config-error"
    })
  })

  it("returns config-error for missing or non-canonical static alias", async () => {
    const dir = writeTempTenantConfigDir([springfieldRecord])
    tempDirs.push(dir)
    const { createTenantOperations } = await import("../../src/lib/tenant/operations.ts")

    const missing = createTenantOperations({
      configDir: dir,
      hostSuffix: "localhost",
      mode: "static"
    })
    await expect(missing.resolve({ host: "localhost:3000" })).resolves.toEqual({
      kind: "config-error",
      message: LOCAL_CONFIG_ERROR
    })

    const blank = createTenantOperations({
      configDir: dir,
      hostSuffix: "localhost",
      mode: "static",
      staticAlias: "   "
    })
    await expect(blank.resolve({ host: "localhost:3000" })).resolves.toEqual({
      kind: "config-error",
      message: LOCAL_CONFIG_ERROR
    })

    const unknown = createTenantOperations({
      configDir: dir,
      hostSuffix: "localhost",
      mode: "static",
      staticAlias: "unknown"
    })
    await expect(unknown.resolve({ host: "localhost:3000" })).resolves.toEqual({
      kind: "config-error",
      message: LOCAL_CONFIG_ERROR
    })
  })

  it("silently ignores conflicting superseded JSON env documents", async () => {
    const dir = writeTempTenantConfigDir([springfieldRecord])
    tempDirs.push(dir)
    const { createEnvTenantOperations } = await import("../../src/lib/tenant/operations.ts")

    const ops = createEnvTenantOperations({
      NODE_ENV: "production",
      TENANT_CONFIG_DIR: dir,
      TENANT_CONFIG_RECORDS_JSON: JSON.stringify([
        {
          config: { ...springfieldConfig, displayName: "Inline Must Not Win" },
          slug: "springfield"
        }
      ]),
      TENANT_LOCAL_CONFIG_JSON: JSON.stringify({
        config: { ...springfieldConfig, displayName: "Inline Static Must Not Win" },
        slug: "springfield"
      })
    })

    const result = await ops.resolve({ host: "springfield.pathable.com" })
    expect(result).toMatchObject({
      kind: "ok",
      tenantId: "springfield"
    })
    if (result.kind === "ok") {
      expect(result.config.displayName).toBe("Springfield Demo")
    }
  })
})
