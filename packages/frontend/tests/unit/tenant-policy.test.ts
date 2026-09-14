import { describe, expect, it } from "vitest"

import { bindHost } from "../../src/tenant/host.ts"
import { selectTenantMode } from "../../src/tenant/mode.ts"
import { INVALID_MODE_DIAGNOSTIC } from "../../src/tenant/model.ts"

describe("host binding", () => {
  it("accepts production tenant hosts and ignores a valid port", () => {
    expect(bindHost("springfield.pathable.com", "pathable.com")).toEqual({
      ok: true,
      value: "springfield"
    })
    expect(bindHost("Shelbyville.Pathable.COM:443", "pathable.com")).toEqual({
      ok: true,
      value: "shelbyville"
    })
  })

  it("accepts local tenant hosts across ports", () => {
    expect(bindHost("springfield.localhost:3000", "localhost")).toEqual({
      ok: true,
      value: "springfield"
    })
    expect(bindHost("springfield.localhost:3100", "localhost")).toEqual({
      ok: true,
      value: "springfield"
    })
  })

  it("rejects apex, reserved, extra-label, unknown-suffix, and deceptive hosts", () => {
    const rejected = [
      undefined,
      "",
      "pathable.com",
      "www.pathable.com",
      "a.b.pathable.com",
      "springfield.example.com",
      "springfield.pathable.com.evil.test",
      "localhost",
      "localhost:3000",
      "www.localhost:3000",
      "a.b.localhost:3000",
      "springfield.example:3000",
      "127.0.0.1",
      "springfield.pathable.com.",
      "springfield.pathable.com/path",
      "user@springfield.pathable.com",
      "springfield.pathable.com,shelbyville.pathable.com",
      "springfield.pathable.com:0",
      "springfield.pathable.com:65536"
    ]

    for (const host of rejected) {
      const production = bindHost(host, "pathable.com")
      const local = bindHost(host, "localhost")
      expect(production.ok || local.ok, String(host)).toBe(false)
    }
  })
})

describe("mode selection", () => {
  it("selects host when the mode is omitted", () => {
    expect(selectTenantMode(undefined, "development")).toEqual({ mode: "host" })
    expect(selectTenantMode("", "production")).toEqual({ mode: "host" })
  })

  it("keeps static in development and ignores it in production", () => {
    expect(selectTenantMode("static", "development")).toEqual({ mode: "static" })
    expect(selectTenantMode("static", "production")).toEqual({ mode: "host" })
  })

  it("retains host association for unsupported values", () => {
    expect(selectTenantMode("automatic", "development")).toEqual({
      diagnostic: INVALID_MODE_DIAGNOSTIC,
      mode: "host"
    })
  })
})
