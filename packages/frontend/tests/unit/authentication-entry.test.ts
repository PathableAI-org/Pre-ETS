import { hasSession } from "@pathableai/pre-ets-frontend-services"
import { beforeEach, describe, expect, it, vi } from "vitest"

import AppLayout from "../../src/app/(app)/layout.tsx"
import HomePage from "../../src/app/(app)/page.tsx"
import { RedirectError } from "./next-navigation-stub.ts"

vi.mock("@pathableai/pre-ets-frontend-services", () => ({
  hasSession: vi.fn()
}))

describe("application entry", () => {
  beforeEach(() => {
    vi.mocked(hasSession).mockResolvedValue(false)
  })

  it("renders layout children without tenant work and redirects home when no session is present", async () => {
    expect(await AppLayout({ children: "child rendering is independently gated" })).toBe(
      "child rendering is independently gated"
    )
    await expect(HomePage()).rejects.toEqual(new RedirectError("/auth/login"))
  })
})
