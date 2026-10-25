import { NextResponse } from "next/server"
import { describe, expect, it } from "vitest"

import { authenticationReturnBody, tenantFailureResponse } from "../../src/app/auth/presentation.tsx"

describe("authentication return presentation", () => {
  it("renders the safe return page without request data", async () => {
    const response = new NextResponse(await authenticationReturnBody(), {
      headers: { "content-type": "text/html; charset=utf-8" },
      status: 200
    })
    const body = await response.text()
    expect(body).toContain("Authentication return")
    expect(body).toContain("Sign-in could not continue")
    expect(body).toContain("Return to the application entry")
  })

  it("renders the missing-tenant page for HTTP 404 and an empty 500", async () => {
    const missing = await tenantFailureResponse(404)
    expect(missing.status).toBe(404)
    expect(missing.headers.get("cache-control")).toBe("private, no-store")
    expect(await missing.text()).toContain("This page could not be found.")

    const unavailable = await tenantFailureResponse(500)
    expect(unavailable.status).toBe(500)
    expect(unavailable.headers.get("cache-control")).toBe("private, no-store")
    expect(await unavailable.text()).toBe("")
  })
})
