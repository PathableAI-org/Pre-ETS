import { fc, it } from "@fast-check/vitest"
import { Result } from "effect"
import { describe, expect } from "vitest"

import { tenantAliasFromServerConfig } from "../../src/lib/tenant/alias"
import { type TenantFailure, TenantNotFound } from "../../src/lib/tenant/schema"

const aliasArb = fc.mixedCase(fc.constantFrom("springfield", "shelbyville"))
const baseHostnameArb = fc.domain()

const expectAliasFailure = (result: Result.Result<unknown, TenantFailure>): void => {
  expect(Result.isFailure(result)).toBe(true)
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(TenantNotFound)
  }
}

describe("tenantAliasFromServerConfig", () => {
  it.prop([aliasArb, baseHostnameArb])(
    "reads the lowercased alias before the configured base hostname",
    (alias, baseHostname) => {
      const result = tenantAliasFromServerConfig({ baseHostname, configDir: "/tenant-config", resolution: "host" })(
        `${alias}.${baseHostname}`
      )
      expect(result).toStrictEqual(Result.succeed(alias.toLowerCase()))
    }
  )

  it.prop([aliasArb, baseHostnameArb])(
    "treats dots in the base hostname as literal characters",
    (alias, baseHostname) => {
      fc.pre(baseHostname.includes("."))
      const mutated = baseHostname.replace(".", "X")
      expectAliasFailure(
        tenantAliasFromServerConfig({ baseHostname, configDir: "/tenant-config", resolution: "host" })(
          `${alias}.${mutated}`
        )
      )
    }
  )

  it.prop([aliasArb, baseHostnameArb, baseHostnameArb])(
    "rejects a host whose suffix is not the configured base hostname",
    (alias, baseHostname, other) => {
      fc.pre(other !== baseHostname)
      expectAliasFailure(
        tenantAliasFromServerConfig({ baseHostname, configDir: "/tenant-config", resolution: "host" })(
          `${alias}.${other}`
        )
      )
    }
  )

  it.prop([
    aliasArb,
    baseHostnameArb,
    fc.integer({ max: 65_535, min: 1 })
  ])("rejects a host that keeps a port", (alias, baseHostname, port) => {
    expectAliasFailure(
      tenantAliasFromServerConfig({ baseHostname, configDir: "/tenant-config", resolution: "host" })(
        `${alias}.${baseHostname}:${String(port)}`
      )
    )
  })

  it.prop([aliasArb, baseHostnameArb])("rejects an extra label before the base hostname", (alias, baseHostname) => {
    expectAliasFailure(
      tenantAliasFromServerConfig({ baseHostname, configDir: "/tenant-config", resolution: "host" })(
        `${alias}.extra.${baseHostname}`
      )
    )
  })

  it.prop([baseHostnameArb])("rejects the bare base hostname", (baseHostname) => {
    expectAliasFailure(
      tenantAliasFromServerConfig({ baseHostname, configDir: "/tenant-config", resolution: "host" })(baseHostname)
    )
  })
})
