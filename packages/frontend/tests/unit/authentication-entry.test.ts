import { describe, expect, it } from "vitest"

import AppLayout from "../../src/app/(app)/layout.tsx"
import HomePage from "../../src/app/(app)/page.tsx"
import { RedirectError } from "./next-navigation-stub.ts"

describe("application entry", () => {
  it("renders layout children without tenant work and redirects home before protected content", async () => {
    expect(await AppLayout({ children: "child rendering is independently gated" })).toBe(
      "child rendering is independently gated"
    )
    let caught: unknown
    try {
      HomePage()
    } catch (error) {
      caught = error
    }
    expect(caught).toEqual(new RedirectError("/auth/login"))
  })
})
