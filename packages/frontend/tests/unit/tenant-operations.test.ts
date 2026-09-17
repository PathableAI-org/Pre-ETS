import { afterEach, describe, expect, it, vi } from "vitest"

import { localRecordJson, springfieldConfig, springfieldRecordsJson } from "./tenant-fixtures.ts"

describe("tenant operations", () => {
  afterEach(() => {
    vi.resetModules()
  })

  it("forces host mode when production is true even if mode is static", async () => {
    const { createTenantOperations } = await import("../../src/lib/tenant/operations.ts")
    const operations = createTenantOperations({
      hostRecordsJson: springfieldRecordsJson,
      hostSuffix: "pathable.com",
      localConfigJson: localRecordJson,
      mode: "static",
      production: true
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
    vi.stubEnv("NODE_ENV", "development")
    const { createEnvTenantOperations } = await import("../../src/lib/tenant/operations.ts")

    const productionOps = createEnvTenantOperations({
      NODE_ENV: "production",
      TENANT_CONFIG_RECORDS_JSON: springfieldRecordsJson,
      TENANT_LOCAL_CONFIG_JSON: localRecordJson,
      TENANT_RESOLUTION: "static"
    })
    const productionResult = await productionOps.resolve({ host: "springfield.pathable.com" })
    expect(productionResult).toMatchObject({
      kind: "ok",
      origin: "host-associated",
      tenantId: "springfield"
    })

    const devOps = createEnvTenantOperations({
      NODE_ENV: "development",
      TENANT_CONFIG_RECORDS_JSON: springfieldRecordsJson,
      TENANT_LOCAL_CONFIG_JSON: localRecordJson,
      TENANT_RESOLUTION: "static"
    })
    const devResult = await devOps.resolve({ host: "shelbyville.localhost:3000" })
    expect(devResult).toMatchObject({
      kind: "ok",
      origin: "local-static",
      tenantId: "springfield"
    })

    vi.unstubAllEnvs()
  })

  it("honors an explicit production override argument", async () => {
    const { createEnvTenantOperations } = await import("../../src/lib/tenant/operations.ts")

    const ops = createEnvTenantOperations(
      {
        NODE_ENV: "development",
        TENANT_CONFIG_RECORDS_JSON: springfieldRecordsJson,
        TENANT_LOCAL_CONFIG_JSON: localRecordJson,
        TENANT_RESOLUTION: "static"
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
})
