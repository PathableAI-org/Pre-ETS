import { describe, expect, it } from "vitest"

import { bindHost } from "../../src/lib/tenant/host.ts"
import { INVALID_MODE_DIAGNOSTIC, selectTenantMode } from "../../src/lib/tenant/types.ts"

describe("host binding", () => {
  it("accepts production tenant hosts and ignores a valid port", () => {
    expect(bindHost("springfield.pathable.com", "pathable.com")).toBe("springfield")
    expect(bindHost("Shelbyville.Pathable.COM:443", "pathable.com")).toBe("shelbyville")
  })

  it("accepts local tenant hosts across ports", () => {
    expect(bindHost("springfield.localhost:3000", "localhost")).toBe("springfield")
    expect(bindHost("springfield.localhost:3100", "localhost")).toBe("springfield")
  })

  it("rejects apex, reserved, extra-label, unknown-suffix, and unusable hosts", () => {
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
      expect(bindHost(host, "pathable.com") ?? bindHost(host, "localhost"), String(host)).toBeUndefined()
    }
  })
})

describe("mode selection", () => {
  it("selects host when the mode is omitted", () => {
    expect(selectTenantMode(undefined)).toEqual({ mode: "host" })
    expect(selectTenantMode("")).toEqual({ mode: "host" })
  })

  it("keeps static outside production and ignores it in production", () => {
    expect(selectTenantMode("static")).toEqual({ mode: "static" })
    expect(selectTenantMode("static", true)).toEqual({ mode: "host" })
  })

  it("retains host association for unsupported values", () => {
    expect(selectTenantMode("automatic")).toEqual({
      diagnostic: INVALID_MODE_DIAGNOSTIC,
      mode: "host"
    })
    expect(selectTenantMode("automatic", true)).toEqual({ mode: "host" })
  })
})
