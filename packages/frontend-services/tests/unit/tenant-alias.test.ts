import { NodeServices } from "@effect/platform-node"
import { fc, it } from "@fast-check/vitest"
import { Effect, References, Result } from "effect"
import { describe, expect } from "vitest"

import { TenantConfigService } from "../../src/tenant.ts"

const aliasArb = fc.mixedCase(fc.constantFrom("springfield", "shelbyville"))
const baseHostnameArb = fc.domain()

const aliasFromHost = (baseHostname: string, host: string) =>
  Effect.gen(function*() {
    const service = yield* TenantConfigService
    return service.getAlias(host)
  }).pipe(
    Effect.provide(TenantConfigService.layer({
      env: "test",
      tenant: {
        baseHostname,
        configDir: "/tenant-config",
        resolution: "host"
      }
    })),
    Effect.provide(NodeServices.layer),
    Effect.provideService(References.MinimumLogLevel, "Error"),
    Effect.runSync
  )

const expectAliasFailure = (result: Result.Result<unknown, { readonly status: number }>): void => {
  expect(Result.isFailure(result)).toBe(true)
  if (Result.isFailure(result)) {
    expect(result.failure.status).toBe(404)
  }
}

describe("TenantConfigService.getAlias", () => {
  it.prop([aliasArb, baseHostnameArb])(
    "reads the lowercased alias before the configured base hostname",
    (alias, baseHostname) => {
      const result = aliasFromHost(baseHostname, `${alias}.${baseHostname}`)
      expect(result).toStrictEqual(Result.succeed(alias.toLowerCase()))
    }
  )

  it.prop([aliasArb, baseHostnameArb])(
    "treats dots in the base hostname as literal characters",
    (alias, baseHostname) => {
      fc.pre(baseHostname.includes("."))
      const mutated = baseHostname.replace(".", "X")
      expectAliasFailure(aliasFromHost(baseHostname, `${alias}.${mutated}`))
    }
  )

  it.prop([aliasArb, baseHostnameArb, baseHostnameArb])(
    "rejects a host whose suffix is not the configured base hostname",
    (alias, baseHostname, other) => {
      fc.pre(other !== baseHostname)
      expectAliasFailure(aliasFromHost(baseHostname, `${alias}.${other}`))
    }
  )

  it.prop([
    aliasArb,
    baseHostnameArb,
    fc.integer({ max: 65_535, min: 1 })
  ])("rejects a host that keeps a port", (alias, baseHostname, port) => {
    expectAliasFailure(aliasFromHost(baseHostname, `${alias}.${baseHostname}:${String(port)}`))
  })

  it.prop([aliasArb, baseHostnameArb])("rejects an extra label before the base hostname", (alias, baseHostname) => {
    expectAliasFailure(aliasFromHost(baseHostname, `${alias}.extra.${baseHostname}`))
  })

  it.prop([baseHostnameArb])("rejects the bare base hostname", (baseHostname) => {
    expectAliasFailure(aliasFromHost(baseHostname, baseHostname))
  })
})
