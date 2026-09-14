import { describe, expect, it } from "vitest"

import {
  createMismatchedTenantSource,
  createStaticTenantSource,
  createThrowingTenantSource
} from "../../src/lib/tenant/source.ts"
import { CONFIG_UNAVAILABLE, parseTenantRecord } from "../../src/lib/tenant/types.ts"

const springfield = {
  config: { displayName: "Springfield Demo" },
  slug: "springfield"
}

const shelbyville = {
  config: { displayName: "Shelbyville Demo" },
  slug: "shelbyville"
}

describe("static tenant source", () => {
  it("accepts an empty known set", async () => {
    const source = createStaticTenantSource([])
    await expect(source.readTenantRecord("springfield")).resolves.toBeUndefined()
  })

  it("rejects duplicate slugs and allows duplicate display names", () => {
    expect(() => createStaticTenantSource([springfield, springfield])).toThrow(CONFIG_UNAVAILABLE)
    expect(() =>
      createStaticTenantSource([
        springfield,
        { config: { displayName: "Springfield Demo" }, slug: "shelbyville" }
      ])
    ).not.toThrow()
  })

  it("returns the matching record and rejects a lookup mismatch", async () => {
    const source = createStaticTenantSource([springfield, shelbyville])
    await expect(source.readTenantRecord("springfield")).resolves.toEqual(springfield)

    const mismatched = createMismatchedTenantSource(shelbyville)
    await expect(mismatched.readTenantRecord("springfield")).resolves.toEqual(shelbyville)
  })

  it("throws when the source cannot complete a read", async () => {
    await expect(createThrowingTenantSource().readTenantRecord("springfield")).rejects.toThrow(
      CONFIG_UNAVAILABLE
    )
  })

  it("rejects missing, numeric, empty, whitespace, and unknown configuration fields", () => {
    expect(parseTenantRecord({ config: {}, slug: "springfield" })).toBeUndefined()
    expect(parseTenantRecord({ config: { displayName: 42 }, slug: "springfield" })).toBeUndefined()
    expect(parseTenantRecord({ config: { displayName: "" }, slug: "springfield" })).toBeUndefined()
    expect(parseTenantRecord({ config: { displayName: "   " }, slug: "springfield" })).toBeUndefined()
    expect(
      parseTenantRecord({
        config: { displayName: "Springfield Demo", extra: true },
        slug: "springfield"
      })
    ).toBeUndefined()
    expect(parseTenantRecord({ config: { displayName: "Nope" }, slug: "www" })).toBeUndefined()
  })
})
