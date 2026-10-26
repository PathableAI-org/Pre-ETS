import { readSessionRequest, type TenantAlias } from "@pathableai/pre-ets-frontend-services"
import { describe, expect, it, vi } from "vitest"

import AppLayout from "../../src/app/(app)/layout.tsx"
import HomePage from "../../src/app/(app)/page.tsx"
import { RedirectError } from "./next-navigation-stub.ts"

vi.mock("@pathableai/pre-ets-frontend-services", () => ({
  readSessionRequest: vi.fn(),
  SESSION_COOKIE: "pathable-session"
}))

describe("application entry", () => {
  it("renders layout children without tenant work and redirects home before protected content", async () => {
    vi.mocked(readSessionRequest).mockResolvedValue({
      session: { _tag: "NoUsableSession" },
      tenantAlias: "springfield" as TenantAlias
    })
    expect(await AppLayout({ children: "child rendering is independently gated" })).toBe(
      "child rendering is independently gated"
    )
    await expect(HomePage()).rejects.toEqual(new RedirectError("/auth/login"))
  })
})
