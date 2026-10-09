import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"

import { config, proxy } from "../../src/proxy"

const matchedRoutes = ["/", "/auth/callback"] as const

describe("proxy", () => {
  it("matches the application entry and the authentication return", () => {
    expect(config.matcher).toEqual(matchedRoutes)
  })

  it.each(matchedRoutes)("forwards %s without a login redirect or session cookies", (pathname) => {
    const request = new NextRequest(new URL(pathname, "https://springfield.example.test"))
    const response = proxy(request)

    expect(response.headers.get("x-middleware-next")).toBe("1")
    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.getSetCookie()).toEqual([])
  })
})
