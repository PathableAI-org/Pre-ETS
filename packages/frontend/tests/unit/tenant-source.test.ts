import { describe, expect, it } from "vitest"

import { parseTenantRecord } from "../../src/tenant/model.ts"
import {
  createMismatchedTenantSource,
  createStaticTenantSource,
  createUnavailableTenantSource
} from "../../src/tenant/source.ts"

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
    expect(source.ok).toBe(true)
    if (!source.ok) {
      return
    }

    const missing = await source.value.readTenantRecord("springfield")
    expect(missing).toEqual({ ok: false, reason: "unknown-tenant" })
  })

  it("rejects duplicate slugs and allows duplicate display names", () => {
    expect(createStaticTenantSource([springfield, springfield]).ok).toBe(false)
    expect(
      createStaticTenantSource([
        springfield,
        { config: { displayName: "Springfield Demo" }, slug: "shelbyville" }
      ]).ok
    ).toBe(true)
  })

  it("returns the matching record and rejects a lookup mismatch", async () => {
    const source = createStaticTenantSource([springfield, shelbyville])
    expect(source.ok).toBe(true)
    if (!source.ok) {
      return
    }

    await expect(source.value.readTenantRecord("springfield")).resolves.toEqual({
      ok: true,
      value: springfield
    })

    const mismatched = createMismatchedTenantSource(shelbyville)
    await expect(mismatched.readTenantRecord("springfield")).resolves.toEqual({
      ok: true,
      value: shelbyville
    })
  })

  it("reports an unavailable source", async () => {
    await expect(createUnavailableTenantSource().readTenantRecord("springfield")).resolves.toEqual({
      ok: false,
      reason: "config-unavailable"
    })
  })

  it("rejects missing, numeric, empty, whitespace, and unknown configuration fields", () => {
    expect(parseTenantRecord({ config: {}, slug: "springfield" }).ok).toBe(false)
    expect(parseTenantRecord({ config: { displayName: 42 }, slug: "springfield" }).ok).toBe(false)
    expect(parseTenantRecord({ config: { displayName: "" }, slug: "springfield" }).ok).toBe(false)
    expect(parseTenantRecord({ config: { displayName: "   " }, slug: "springfield" }).ok).toBe(false)
    expect(
      parseTenantRecord({
        config: { displayName: "Springfield Demo", extra: true },
        slug: "springfield"
      }).ok
    ).toBe(false)
    expect(parseTenantRecord({ config: { displayName: "Nope" }, slug: "www" }).ok).toBe(false)
  })
})
