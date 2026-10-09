import { fc, it } from "@fast-check/vitest"
import { Result } from "effect"
import { describe, expect } from "vitest"

import { tenantAliasFromHost } from "../../src/lib/tenant/alias"
import { TenantConfigError } from "../../src/lib/tenant/schema"

const aliasArb = fc.mixedCase(fc.constantFrom("springfield", "shelbyville"))
const baseHostnameArb = fc.domain()

const expectAliasFailure = (result: Result.Result<unknown, TenantConfigError>): void => {
  expect(Result.isFailure(result)).toBe(true)
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(TenantConfigError)
  }
}

describe("tenantAliasFromHost", () => {
  it.prop([aliasArb, baseHostnameArb])(
    "reads the lowercased alias before the configured base hostname",
    (alias, baseHostname) => {
      const result = tenantAliasFromHost(baseHostname)(`${alias}.${baseHostname}`)
      expect(result).toStrictEqual(Result.succeed(alias.toLowerCase()))
    }
  )

  it.prop([aliasArb, baseHostnameArb])(
    "treats dots in the base hostname as literal characters",
    (alias, baseHostname) => {
      fc.pre(baseHostname.includes("."))
      const mutated = baseHostname.replace(".", "X")
      expectAliasFailure(tenantAliasFromHost(baseHostname)(`${alias}.${mutated}`))
    }
  )

  it.prop([aliasArb, baseHostnameArb, baseHostnameArb])(
    "rejects a host whose suffix is not the configured base hostname",
    (alias, baseHostname, other) => {
      fc.pre(other !== baseHostname)
      expectAliasFailure(tenantAliasFromHost(baseHostname)(`${alias}.${other}`))
    }
  )

  it.prop([
    aliasArb,
    baseHostnameArb,
    fc.integer({ max: 65_535, min: 1 })
  ])("rejects a host that keeps a port", (alias, baseHostname, port) => {
    expectAliasFailure(tenantAliasFromHost(baseHostname)(`${alias}.${baseHostname}:${String(port)}`))
  })

  it.prop([aliasArb, baseHostnameArb])("rejects an extra label before the base hostname", (alias, baseHostname) => {
    expectAliasFailure(tenantAliasFromHost(baseHostname)(`${alias}.extra.${baseHostname}`))
  })

  it.prop([baseHostnameArb])("rejects the bare base hostname", (baseHostname) => {
    expectAliasFailure(tenantAliasFromHost(baseHostname)(baseHostname))
  })
})
