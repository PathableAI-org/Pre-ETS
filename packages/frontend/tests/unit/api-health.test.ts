import { describe, expect, it } from "vitest"

import { GET as getHealthError } from "../../src/app/api/health/error/route.ts"
import { GET as getHealth } from "../../src/app/api/health/route.ts"

describe("demo health Route Handlers", () => {
  it("GET /api/health returns 200", async () => {
    const response = getHealth()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it("GET /api/health/error returns 500", async () => {
    const response = getHealthError()
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: "intentional",
      ok: false
    })
  })
})
