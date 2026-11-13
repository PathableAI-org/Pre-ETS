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
    "/auth/login"
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

  it("renders the forbidden document as a private 403 page in the proxy response, without a rewrite", async () => {
    const forbiddenDocument = gate.responses?.forbiddenDocument
    if (forbiddenDocument === undefined) throw new Error("proxy did not create the gate")

    const response = await forbiddenDocument(new NextRequest("https://springfield.example.test/some/page?x=1"))

    expect(response.status).toBe(403)
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8")
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("x-middleware-rewrite")).toBeNull()
    expect(response.headers.get("location")).toBeNull()
    const body = await response.text()
    expect(body).toMatch(/<h1[^>]*>Access denied<\/h1>/)
    expect(body).toMatch(/<a[^>]*href="\/"[^>]*>Go to the application entry<\/a>/)
    const head = /<head>(.*)<\/head>/s.exec(body)?.[1] ?? ""
    expect(head).toContain("<title>Access denied – Pre-ETS</title>")
    expect(head).toMatch(/<meta charSet="utf-8"\/>/)
    expect(head).toMatch(/<meta (?=[^>]*name="viewport")(?=[^>]*content="width=device-width, initial-scale=1")[^>]*>/)
  })
})

describe("proxy recovery document [PREETS-SESSION-007]", () => {
  const recover = async (cause: "expired" | "unknown") => {
    const recoveryDocument = gate.responses?.recoveryDocument
    if (recoveryDocument === undefined) throw new Error("proxy did not create the gate")
    const response = await recoveryDocument({ cause })
    return { body: await response.text(), response }
  }

  it.each(
    [
      {
        cause: "expired",
        explanation: "For your security, your session ended after a period of inactivity.",
        heading: "Your session expired"
      },
      { cause: "unknown", explanation: "To continue, log in again.", heading: "Your session is no longer available" }
    ] as const
  )("renders a self-contained private 401 document explaining the $cause cause", async (row) => {
    const { body, response } = await recover(row.cause)

    expect(response.status).toBe(401)
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8")
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.getSetCookie()).toEqual([])
    expect(body.match(/<h1[\s>]/g)).toHaveLength(1)
    expect(body).toMatch(new RegExp(`<h1[^>]*>${row.heading}</h1>`))
    expect(body).toContain(row.explanation)
    expect(body).toMatch(/<a[^>]*href="\/"[^>]*>Log in again<\/a>/)
    const head = /<head>(.*)<\/head>/s.exec(body)?.[1] ?? ""
    expect(head).toContain(`<title>${row.heading} – Pre-ETS</title>`)
    expect(head).toMatch(/<meta charSet="utf-8"\/>/)
    expect(head).not.toMatch(/<link[^>]*stylesheet/)
  })

  it("claims no cause when the cause is unknown, and names no tenant or session", async () => {
    const { body } = await recover("unknown")

    expect(body).not.toMatch(/expired|inactivity/i)
    expect(body).not.toMatch(/springfield|shelbyville|pathable-session|<form/i)
  })
})

describe("proxy action denial [PREETS-SESSION-007]", () => {
  it.each(
    [
      { body: "session-expired", cause: "expired" },
      { body: "session-unavailable", cause: "unknown" }
    ] as const
  )("answers a denied fetch action with the exact $cause token as plain text", async (row) => {
    const actionDenial = gate.responses?.actionDenial
    if (actionDenial === undefined) throw new Error("proxy did not create the gate")

    const response = await actionDenial({ cause: row.cause })

    expect(response.status).toBe(401)
    // Exactly `text/plain`: Next's client reads the body as the rejection message only for that content type.
    expect(response.headers.get("content-type")).toBe("text/plain")
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.getSetCookie()).toEqual([])
    expect(await response.text()).toBe(row.body)
  })
})
