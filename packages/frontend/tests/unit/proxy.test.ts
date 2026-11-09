import type * as FrontendServices from "@pathableai/pre-ets-frontend-services"
import type { ProtectionResponses } from "@pathableai/pre-ets-frontend-services"

import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server"
import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"

import { tenantFailureResponse } from "../../src/features/access-responses.ts"

const gate = vi.hoisted(() => ({ responses: undefined as ProtectionResponses | undefined }))

vi.mock("@pathableai/pre-ets-frontend-services", async (importOriginal) => ({
  ...await importOriginal<typeof FrontendServices>(),
  createProtectionProxy: (responses: ProtectionResponses) => {
    gate.responses = responses
    return () => Promise.reject(new Error("the gate itself is not under test here"))
  }
}))

const { config } = await import("../../src/proxy.ts")

const MATCHER = "/((?!_next/static/|_next/webpack-hmr|__nextjs).*)"

/**
 * Next's own matcher pipeline, so the examples exercise how Next applies the config. The installed 16.4.5 exports
 * `unstable_doesMiddlewareMatch`; its bundled proxy guide names `unstable_doesProxyMatch`. Revisit on Next upgrades.
 */
const matches = (pathname: string) =>
  unstable_doesMiddlewareMatch({ config, url: `https://springfield.example.test${pathname}` })

describe("proxy [PREETS-SESSION-001]", () => {
  it("matches every application path and excludes only build assets and development tooling", () => {
    expect(config.matcher).toEqual([MATCHER])
  })

  it.each([
    "/",
    "/an-absent-path",
    "/favicon.ico",
    "/_next/image",
    "/_test/x",
    "/auth/login",
    "/access-denied"
  ])("routes %s through the gate", (pathname) => {
    expect(matches(pathname)).toBe(true)
  })

  it.each(["/_next/static/x", "/_next/static/chunks/app.js", "/_next/webpack-hmr", "/__nextjs_original-stack-frame"])(
    "leaves %s unmatched",
    (pathname) => {
      expect(matches(pathname)).toBe(false)
    }
  )

  it("supplies the existing tenant-failure presentation", () => {
    expect(gate.responses?.tenantFailure).toBe(tenantFailureResponse)
  })

  it("rewrites a forbidden document to the protected access-denied page on the request's origin", async () => {
    const forbiddenDocument = gate.responses?.forbiddenDocument
    if (forbiddenDocument === undefined) throw new Error("proxy did not create the gate")

    const response = await forbiddenDocument(new NextRequest("https://springfield.example.test/some/page?x=1"))

    expect(response.headers.get("x-middleware-rewrite")).toBe("https://springfield.example.test/access-denied")
    expect(response.headers.get("location")).toBeNull()
  })
})
