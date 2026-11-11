import { readSessionRequest, type TenantAlias } from "@pathableai/pre-ets-frontend-services"
import { describe, expect, it, vi } from "vitest"

import AppLayout from "../../src/app/(app)/layout.tsx"
import HomePage from "../../src/app/(app)/page.tsx"
import { RedirectError } from "./next-navigation-stub.ts"

vi.mock("@pathableai/pre-ets-frontend-services", () => ({
  readBrowserTracing: vi.fn(() => Promise.resolve(undefined)),
  readSessionRequest: vi.fn(),
  SESSION_COOKIE: "pathable-session"
}))

describe("application entry [PREETS-SESSION-001, PREETS-SESSION-004]", () => {
  it("redirects the protected layout and home page to login before protected content", async () => {
    vi.mocked(readSessionRequest).mockResolvedValue({
      coordination: undefined,
      session: { _tag: "NoUsableSession" },
      tenantAlias: "springfield" as TenantAlias
    })
    await expect(AppLayout({ children: "protected content" })).rejects.toEqual(new RedirectError("/auth/login"))
    await expect(HomePage()).rejects.toEqual(new RedirectError("/auth/login"))
  })
})
