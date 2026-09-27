import { fc, it } from "@fast-check/vitest"
import { Result } from "effect"
import { describe, expect } from "vitest"

import { tenantAliasFromHost } from "../../src/lib/tenant/alias"

const hostArb = fc.record({
  alias: fc.mixedCase(fc.constantFrom("springfield", "shelbyville")),
  port: fc.option(fc.integer({ max: 65_535, min: 1 }).map((n) => String(n)), { nil: undefined }),
  suffix: fc.domain()
}).map(({ alias, port, suffix }) => ({
  alias,
  host: port === undefined ? `${alias}.${suffix}` : `${alias}.${suffix}:${port}`
}))

describe("tenantAliasFromHost", () => {
  it.prop([hostArb])("should read tenant alias from host header", ({ alias, host }) => {
    const result = tenantAliasFromHost(host)
    expect(result).toStrictEqual(Result.succeed(alias.toLowerCase()))
  })
})
