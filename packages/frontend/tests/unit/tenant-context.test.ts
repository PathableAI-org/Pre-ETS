import { describe, expect, it } from "vitest"

import type { HostBinder } from "../../src/tenant/resolve.ts"

import { bindHost } from "../../src/tenant/host.ts"
import { readBoundTenant, resolveTenant } from "../../src/tenant/resolve.ts"
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

describe("tenant resolution", () => {
  it("binds once and reuses the established slug for later reads", async () => {
    const source = createStaticTenantSource([springfield, shelbyville])
    expect(source.ok).toBe(true)
    if (!source.ok) {
      return
    }

    let binds = 0
    const countingBind: HostBinder = (host, suffix) => {
      binds += 1
      return bindHost(host, suffix)
    }

    const resolved = await resolveTenant({
      bindHost: countingBind,
      host: "springfield.pathable.com",
      hostSuffix: "pathable.com",
      mode: "host",
      source: source.value
    })

    expect(resolved).toEqual({
      ok: true,
      value: {
        config: springfield.config,
        origin: "host-associated",
        slug: "springfield"
      }
    })
    expect(binds).toBe(1)

    const reread = await readBoundTenant({
      origin: "host-associated",
      slug: "springfield",
      source: source.value
    })
    expect(reread).toEqual(resolved)
    expect(binds).toBe(1)
  })

  it("keeps the slug when the configuration source is replaced", async () => {
    const original = createStaticTenantSource([springfield])
    const replacement = createStaticTenantSource([
      { config: { displayName: "Springfield Training" }, slug: "springfield" }
    ])
    expect(original.ok && replacement.ok).toBe(true)
    if (!original.ok || !replacement.ok) {
      return
    }

    const first = await resolveTenant({
      host: "springfield.pathable.com",
      hostSuffix: "pathable.com",
      mode: "host",
      source: original.value
    })
    const second = await readBoundTenant({
      origin: "host-associated",
      slug: "springfield",
      source: replacement.value
    })

    expect(first).toMatchObject({ ok: true, value: { slug: "springfield" } })
    expect(second).toEqual({
      ok: true,
      value: {
        config: { displayName: "Springfield Training" },
        origin: "host-associated",
        slug: "springfield"
      }
    })
  })

  it("does not use a mismatched or unavailable source as another tenant", async () => {
    const mismatched = await resolveTenant({
      host: "springfield.pathable.com",
      hostSuffix: "pathable.com",
      mode: "host",
      source: createMismatchedTenantSource(shelbyville)
    })
    expect(mismatched).toEqual({ ok: false, reason: "invalid-config" })

    const unavailable = await resolveTenant({
      host: "springfield.pathable.com",
      hostSuffix: "pathable.com",
      mode: "host",
      source: createUnavailableTenantSource()
    })
    expect(unavailable).toEqual({ ok: false, reason: "config-unavailable" })
  })

  it("uses the supplied static record without host binding", async () => {
    const source = createStaticTenantSource([springfield])
    expect(source.ok).toBe(true)
    if (!source.ok) {
      return
    }

    let binds = 0
    const resolved = await resolveTenant({
      bindHost: () => {
        binds += 1
        return { ok: false, reason: "invalid-host" }
      },
      host: "localhost:3000",
      hostSuffix: "localhost",
      localRecord: springfield,
      mode: "static",
      source: source.value
    })

    expect(binds).toBe(0)
    expect(resolved).toEqual({
      ok: true,
      value: {
        config: springfield.config,
        origin: "local-static",
        slug: "springfield"
      }
    })
  })
})
