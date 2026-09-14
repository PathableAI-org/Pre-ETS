import { describe, expect, it } from "vitest"

import { encodeTenantHandoff, stripInboundTenantHeaders } from "../../src/tenant/handoff.ts"
import {
  ACCESS_DENIED,
  CACHE_CONTROL,
  CONFIG_TEMPORARILY_UNAVAILABLE,
  CONFIG_UNAVAILABLE,
  LOCAL_CONFIG_ERROR,
  mapTenantFailureToResponse
} from "../../src/tenant/response.ts"

describe("tenant response adapter", () => {
  it("maps host failures to 403 without a redirect payload", () => {
    expect(mapTenantFailureToResponse("invalid-host", { mode: "host", runtime: "production" })).toEqual({
      body: ACCESS_DENIED,
      headers: {
        "Cache-Control": CACHE_CONTROL,
        "Content-Type": "text/plain; charset=utf-8"
      },
      status: 403
    })
  })

  it("maps configuration failures to the specified status and safe text", () => {
    expect(mapTenantFailureToResponse("invalid-config", { mode: "host", runtime: "production" }).status).toBe(500)
    expect(mapTenantFailureToResponse("invalid-config", { mode: "host", runtime: "production" }).body).toBe(
      CONFIG_UNAVAILABLE
    )
    expect(mapTenantFailureToResponse("config-unavailable", { mode: "host", runtime: "production" })).toMatchObject({
      body: CONFIG_TEMPORARILY_UNAVAILABLE,
      status: 503
    })
    expect(mapTenantFailureToResponse("invalid-config", { mode: "static", runtime: "development" }).body).toBe(
      LOCAL_CONFIG_ERROR
    )
  })

  it("overwrites inbound tenant headers before encoding handoff", () => {
    const inbound = new Headers({
      host: "springfield.pathable.com",
      "x-preets-tenant-origin": "local-static",
      "x-preets-tenant-slug": "shelbyville"
    })
    const encoded = encodeTenantHandoff(stripInboundTenantHeaders(inbound), {
      origin: "host-associated",
      slug: "springfield"
    })

    expect(encoded.get("x-preets-tenant-slug")).toBe("springfield")
    expect(encoded.get("x-preets-tenant-origin")).toBe("host-associated")
    expect(encoded.get("host")).toBe("springfield.pathable.com")
  })
})
