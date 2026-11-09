import { fc, it } from "@fast-check/vitest"
import { Effect, Layer, Result, Schema } from "effect"
import { NextRequest, NextResponse } from "next/server"
import { afterEach, beforeEach, describe, expect, vi } from "vitest"

import { createProtectionProxy, type ProtectionResponses } from "../../src/next.ts"
import {
  type NoUsableSession,
  type ReadSessionForTenantInput,
  type RefreshSessionForTenantInput,
  SessionService,
  SessionServiceUnavailable,
  SessionTenantMismatch,
  type UsableSession
} from "../../src/session.ts"
import {
  effectiveSessionPolicy,
  TenantAlias,
  type TenantConfig,
  TenantConfigService,
  type TenantFailure,
  TenantNotFound,
  TenantReadError
} from "../../src/tenant.ts"

const runtime = vi.hoisted(() => ({ runPromise: vi.fn() }))
vi.mock("../../src/runtime.ts", () => ({ Runtime: runtime }))

const NOW = 1_800_000_000_000
const alias = Schema.decodeSync(TenantAlias)("springfield")
const tenantConfig: TenantConfig = {
  displayName: "Springfield",
  idleTimeoutMinutes: 20,
  oidc: { clientAuth: "public", clientId: "springfield-web", issuer: "https://provider.test" },
  warningLeadMinutes: 4
}
const reference = "R".repeat(43)
const usableSession: UsableSession = {
  _tag: "UsableSession",
  identity: { issuer: "https://provider.test/", subject: "subject-1" },
  idleDeadlineEpochMilliseconds: NOW + 1_234_567,
  tenantAlias: alias,
  warningLeadMinutes: 4
}
const noUsableSession: NoUsableSession = { _tag: "NoUsableSession" }

interface Recorded {
  readonly reads: ReadSessionForTenantInput[]
  readonly refreshes: RefreshSessionForTenantInput[]
  readonly tenantCalls: string[]
}

type SessionOutcome = Effect.Effect<
  NoUsableSession | UsableSession,
  SessionServiceUnavailable | SessionTenantMismatch
>

let recorded: Recorded = { reads: [], refreshes: [], tenantCalls: [] }

const sessionDouble = (outcome: () => SessionOutcome): SessionService["Service"] => ({
  establish: () => Effect.die("establish must remain unused: the gate never creates a session"),
  invalidate: () => Effect.die("invalidate must remain unused"),
  read: () => Effect.die("read must remain unused"),
  readForTenant: (input) => {
    recorded.reads.push(input)
    return outcome()
  },
  refreshForTenant: (input) => {
    recorded.refreshes.push(input)
    return outcome()
  }
})

const tenantDouble = (
  aliasOutcome: Result.Result<TenantAlias, TenantFailure> = Result.succeed(alias),
  configOutcome: Effect.Effect<TenantConfig, TenantFailure> = Effect.succeed(tenantConfig)
): TenantConfigService["Service"] => ({
  getAlias: (host) => {
    recorded.tenantCalls.push(`alias:${host}`)
    return aliasOutcome
  },
  getConfigFromAlias: (selected) => {
    recorded.tenantCalls.push(`config:${selected}`)
    return configOutcome
  },
  getConfigFromHost: () => Effect.die("getConfigFromHost must remain unused")
})

const install = (
  session: SessionService["Service"],
  tenant: TenantConfigService["Service"] = tenantDouble()
) => {
  recorded = { reads: [], refreshes: [], tenantCalls: [] }
  runtime.runPromise.mockImplementation((
    program: Effect.Effect<unknown, unknown, SessionService | TenantConfigService>
  ) =>
    Effect.runPromise(program.pipe(
      Effect.provide(Layer.mergeAll(
        Layer.succeed(SessionService, session),
        Layer.succeed(TenantConfigService, tenant)
      ))
    ))
  )
}

const forbiddenBody = "forbidden-document"
const tenantFailureBody = "missing-tenant"

const responses: ProtectionResponses = {
  forbiddenDocument: (request) =>
    Promise.resolve(
      new NextResponse(forbiddenBody, {
        headers: { "x-forbidden-for": request.nextUrl.pathname },
        status: 403
      })
    ),
  tenantFailure: (status) => Promise.resolve(new NextResponse(status === 404 ? tenantFailureBody : null, { status }))
}

const protect = createProtectionProxy(responses)

const ORIGIN = "https://springfield.example.test"

type Metadata = Readonly<Record<string, string>>
const navigation: Metadata = { "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" }
const rscFetch: Metadata = { "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" }
const sameOriginFetch: Metadata = { "sec-fetch-dest": "empty", "sec-fetch-mode": "same-origin" }
const imageLoad: Metadata = { "sec-fetch-dest": "image", "sec-fetch-mode": "no-cors" }

const request = (
  path: string,
  init: { readonly cookie?: string | undefined; readonly headers?: Metadata; readonly method?: string } = {}
) => {
  const headers = new Headers({ host: "springfield.example.test", ...init.headers })
  if (init.cookie !== undefined) headers.set("cookie", `pathable-session=${init.cookie}`)
  return new NextRequest(`${ORIGIN}${path}`, { headers, method: init.method ?? "GET" })
}

const passedThrough = (response: Response) => response.headers.get("x-middleware-next") === "1"

const expectEmptyDenial = async (response: Response, status: number) => {
  expect(response.status).toBe(status)
  expect(passedThrough(response)).toBe(false)
  expect(response.headers.get("cache-control")).toBe("private, no-store")
  expect(response.headers.get("location")).toBeNull()
  expect(response.headers.getSetCookie()).toEqual([])
  expect(await response.text()).toBe("")
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

const documentPaths = ["/auth/callback", "/auth/login", "/login-unavailable"] as const
const designatedPaths = [...documentPaths, "/_test"] as const

const separators = ["/", "\\", "."]
const count = (text: string, character: string) => text.split(character).length - 1

/** A segment is safe when decoding it introduces no separator that the raw spelling lacked. */
const decodesWithoutNewSeparator = (rawSegment: string) => {
  const decoded = decodeURIComponent(rawSegment)
  return separators.every((character) => count(decoded, character) === count(rawSegment, character))
}

/** Next decodes a Server Action from an action header or a form-encoded `POST` body. */
const invokesServerAction = (method: string, headers: Metadata) => {
  if (headers["next-action"] !== undefined) return true
  const contentType = headers["content-type"]
  return method === "POST" &&
    (contentType === "application/x-www-form-urlencoded" || contentType?.startsWith("multipart/form-data") === true)
}

/**
 * Independent statement of the closed designation, evaluated segment by segment on the pathname the gate receives.
 * No Server Action invocation is public. Otherwise `_test` as the first segment, followed only by segments that decode
 * without a new separator, is public for every method; an exact document path is public for `GET` and `HEAD`.
 */
const isDesignated = (method: string, pathname: string, headers: Metadata) => {
  if (invokesServerAction(method, headers)) return false
  const [root, first, ...rest] = pathname.split("/")
  if (root === "" && first === "_test" && rest.every(decodesWithoutNewSeparator)) return true
  return (method === "GET" || method === "HEAD") && (documentPaths as readonly string[]).includes(pathname)
}

const segment = fc.array(
  fc.constantFrom("a", "z", "_", "-", ".", "test", "_test", "auth", "login", "%2F", "%2f", "%5C", "%2e", "%5F", "%41"),
  { maxLength: 4, minLength: 0 }
).map((parts) => parts.join(""))

const pathname = fc.oneof(
  fc.constantFrom(...designatedPaths, "/auth/login/extra", "/_testing", "/", "/favicon.ico", "/_next/image"),
  fc.array(segment, { maxLength: 3, minLength: 1 }).map((segments) => `/_test/${segments.join("/")}`),
  fc.array(segment, { maxLength: 4, minLength: 0 }).map((segments) => `/${segments.join("/")}`)
)

const headerSubset = fc.record(
  {
    "content-type": fc.constantFrom(
      "multipart/form-data; boundary=----x",
      "application/x-www-form-urlencoded",
      "application/json",
      "text/plain;charset=UTF-8"
    ),
    "next-action": fc.constant("0123456789abcdef"),
    "sec-fetch-dest": fc.constantFrom("document", "empty", "image"),
    "sec-fetch-mode": fc.constantFrom("navigate", "cors", "no-cors", "same-origin")
  },
  { requiredKeys: [] }
)

describe("createProtectionProxy designation [PREETS-SESSION-001]", () => {
  it.prop([
    pathname,
    fc.constantFrom("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"),
    headerSubset
  ], { numRuns: 500 })(
    "passes a request without a usable session through iff it is designated and invokes no Server Action",
    async (path, method, headers) => {
      install(sessionDouble(() => Effect.succeed(noUsableSession)))
      const incoming = request(path, { cookie: reference, headers, method })

      const response = await protect(incoming)

      const designated = isDesignated(method, incoming.nextUrl.pathname, headers)
      expect(passedThrough(response)).toBe(designated)
      if (designated) {
        expect(recorded.reads).toEqual([])
        expect(recorded.refreshes).toEqual([])
        expect(recorded.tenantCalls).toEqual([])
      } else {
        expect([307, 401]).toContain(response.status)
      }
    }
  )

  it.each([...designatedPaths, "/_test/", "/_test/tenant-config", "/_test/onsite", "/_test/this-page-is-absent"])(
    "passes GET and HEAD %s without session state or header change",
    async (path) => {
      install(sessionDouble(() => Effect.die("a public request must not read session state")))
      for (const method of ["GET", "HEAD"]) {
        const response = await protect(request(path, { cookie: reference, headers: navigation, method }))

        expect(passedThrough(response)).toBe(true)
        expect(response.headers.get("cache-control")).toBeNull()
        expect(response.headers.getSetCookie()).toEqual([])
      }
      expect(recorded.tenantCalls).toEqual([])
      expect(runtime.runPromise).not.toHaveBeenCalled()
    }
  )

  it.each([
    "/_testing",
    "/_test%2Fx",
    "/%5Ftest/x",
    "/_test/..%2F",
    "/_test/%2e%2e/",
    "/_test/%5C",
    "/_test/a%2eb",
    "/_test/x/%2E%2Fy",
    "/_TEST/x",
    "/auth/login/extra",
    "/auth/login/",
    "/Auth/Login",
    "/auth/callback/x",
    "/login-unavailable/",
    "/login-unavailablex"
  ])("protects the near-miss %s", async (path) => {
    install(sessionDouble(() => Effect.succeed(noUsableSession)))

    await expectEmptyDenial(await protect(request(path)), 401)
    expect(recorded.reads).toHaveLength(1)
  })

  it.each(["PUT", "PATCH", "DELETE", "OPTIONS"])("passes %s under /_test without session state", async (method) => {
    install(sessionDouble(() => Effect.die("a public request must not read session state")))

    for (const path of ["/_test", "/_test/tenant-config", "/_test/this-page-is-absent"]) {
      expect(passedThrough(await protect(request(path, { cookie: reference, method })))).toBe(true)
    }
    expect(runtime.runPromise).not.toHaveBeenCalled()
  })

  it.each([undefined, "application/json", "text/plain;charset=UTF-8"])(
    "passes POST /_test/tenant-config with content type %s without session state",
    async (contentType) => {
      install(sessionDouble(() => Effect.die("a public request must not read session state")))
      const headers = contentType === undefined ? navigation : { ...navigation, "content-type": contentType }

      expect(passedThrough(await protect(request("/_test/tenant-config", { headers, method: "POST" })))).toBe(true)
      expect(runtime.runPromise).not.toHaveBeenCalled()
    }
  )

  it.each([
    { headers: { ...rscFetch, "next-action": "0123456789abcdef" }, method: "POST", name: "an action header" },
    { headers: { ...navigation, "next-action": "0123456789abcdef" }, method: "GET", name: "an action header on GET" },
    {
      headers: { ...navigation, "content-type": "multipart/form-data; boundary=----x" },
      method: "POST",
      name: "a multipart body"
    },
    {
      headers: { ...navigation, "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
      name: "a form-urlencoded body"
    }
  ])("protects a Server Action candidate under /_test: $name", async (row) => {
    install(sessionDouble(() => Effect.succeed(noUsableSession)))

    for (const path of ["/_test", "/_test/x"]) {
      await expectEmptyDenial(await protect(request(path, { headers: row.headers, method: row.method })), 401)
    }
  })

  it.each(documentPaths)("protects POST %s like any other non-GET request", async (path) => {
    install(sessionDouble(() => Effect.succeed(noUsableSession)))

    await expectEmptyDenial(await protect(request(path, { headers: navigation, method: "POST" })), 401)
  })
})

describe("createProtectionProxy outcomes [PREETS-SESSION-001, PREETS-SESSION-005]", () => {
  it("answers 503 for a protected request before the runtime has started, without passing it through", async () => {
    runtime.runPromise.mockImplementation(() =>
      Promise.reject(Object.assign(new Error("startup not ready"), { _tag: "StartupNotReady" }))
    )

    for (const headers of [navigation, rscFetch]) {
      await expectEmptyDenial(await protect(request("/", { cookie: reference, headers })), 503)
    }
  })

  it.each([
    { entry: "document", expected: 307, headers: navigation, method: "GET", path: "/" },
    { entry: "document (HEAD)", expected: 307, headers: navigation, method: "HEAD", path: "/" },
    {
      entry: "document (destination only)",
      expected: 307,
      headers: { "sec-fetch-dest": "document" },
      method: "GET",
      path: "/an-undesignated-path"
    },
    { entry: "RSC fetch", expected: 401, headers: rscFetch, method: "GET", path: "/" },
    { entry: "same-origin fetch", expected: 401, headers: sameOriginFetch, method: "GET", path: "/" },
    { entry: "favicon image", expected: 401, headers: imageLoad, method: "GET", path: "/favicon.ico" },
    {
      entry: "optimized image",
      expected: 401,
      headers: imageLoad,
      method: "GET",
      path: "/_next/image?url=%2Fx&w=16&q=75"
    },
    { entry: "absent metadata", expected: 401, headers: {}, method: "GET", path: "/" },
    {
      entry: "mode wins over destination",
      expected: 401,
      headers: { ...navigation, "sec-fetch-mode": "cors" },
      method: "GET",
      path: "/"
    },
    {
      entry: "action on a navigation",
      expected: 401,
      headers: { ...navigation, "next-action": "abc" },
      method: "GET",
      path: "/"
    },
    { entry: "POST navigation", expected: 401, headers: navigation, method: "POST", path: "/" }
  ])("without a usable session sends only a classified navigation to login: $entry", async (row) => {
    install(sessionDouble(() => Effect.succeed(noUsableSession)))
    const incoming = request(row.path, { cookie: reference, headers: row.headers, method: row.method })

    const response = await protect(incoming)

    if (row.expected === 307) {
      expect(response.status).toBe(307)
      expect(response.headers.get("location")).toBe(new URL("/auth/login", incoming.nextUrl).href)
      expect(response.headers.get("location")).toBe(`${ORIGIN}/auth/login`)
      expect(response.headers.get("cache-control")).toBe("private, no-store")
      expect(response.headers.getSetCookie()).toEqual([])
    } else {
      await expectEmptyDenial(response, 401)
    }
    expect(recorded.tenantCalls).toEqual(["alias:springfield.example.test", "config:springfield"])
  })

  it.each([
    {
      label: "host alias not found",
      status: 404,
      tenant: tenantDouble(Result.fail(new TenantNotFound({ cause: new Error("x"), message: "x" })))
    },
    {
      label: "static alias unreadable",
      status: 500,
      tenant: tenantDouble(Result.fail(new TenantReadError({ cause: new Error("x"), message: "x" })))
    },
    {
      label: "selected file missing in host mode",
      status: 404,
      tenant: tenantDouble(
        Result.succeed(alias),
        Effect.fail(new TenantNotFound({ cause: new Error("x"), message: "x" }))
      )
    },
    {
      label: "selected file missing in static mode",
      status: 500,
      tenant: tenantDouble(
        Result.succeed(alias),
        Effect.fail(new TenantReadError({ cause: new Error("x"), message: "x" }))
      )
    }
  ])("resolves the tenant first and keeps its failure: $label", async ({ status, tenant }) => {
    install(sessionDouble(() => Effect.die("a tenant failure must not read session state")), tenant)

    for (const headers of [navigation, rscFetch]) {
      for (const method of ["GET", "POST"]) {
        const response = await protect(request("/", { cookie: reference, headers, method }))
        expect(response.status).toBe(status)
        expect(response.headers.get("cache-control")).toBe("private, no-store")
        expect(response.headers.get("location")).toBeNull()
        expect(await response.text()).toBe(status === 404 ? tenantFailureBody : "")
      }
    }
    expect(recorded.reads).toEqual([])
    expect(recorded.refreshes).toEqual([])
  })

  it("answers 503 when session state cannot be determined, never login", async () => {
    install(sessionDouble(() => Effect.fail(new SessionServiceUnavailable({}))))

    for (const headers of [navigation, rscFetch, {}]) {
      await expectEmptyDenial(await protect(request("/", { cookie: reference, headers })), 503)
    }
  })

  it("forbids a tenant mismatch: the host forbidden document for a navigation, an empty 403 otherwise", async () => {
    install(sessionDouble(() => Effect.fail(new SessionTenantMismatch({}))))

    const document = await protect(request("/a/protected/page", { cookie: reference, headers: navigation }))
    expect(document.status).toBe(403)
    expect(document.headers.get("x-forbidden-for")).toBe("/a/protected/page")
    expect(document.headers.get("cache-control")).toBe("private, no-store")
    expect(document.headers.get("location")).toBeNull()
    expect(document.headers.getSetCookie()).toEqual([])
    expect(passedThrough(document)).toBe(false)
    expect(await document.text()).toBe(forbiddenBody)

    for (const headers of [rscFetch, imageLoad, {}]) {
      await expectEmptyDenial(await protect(request("/", { cookie: reference, headers })), 403)
    }
    await expectEmptyDenial(
      await protect(request("/", { cookie: reference, headers: { ...rscFetch, "next-action": "a" }, method: "POST" })),
      403
    )
  })

  it("passes a usable matching session through as private and not storable", async () => {
    install(sessionDouble(() => Effect.succeed(usableSession)))

    for (const headers of [navigation, rscFetch, imageLoad, {}]) {
      const response = await protect(request("/", { cookie: reference, headers }))
      expect(passedThrough(response)).toBe(true)
      expect(response.headers.get("cache-control")).toBe("private, no-store")
      expect(response.headers.get("location")).toBeNull()
    }
  })
})

describe("createProtectionProxy renewal [PREETS-SESSION-005]", () => {
  const sessionCookies = (response: Response) =>
    response.headers.getSetCookie().filter((cookie) => cookie.startsWith("pathable-session="))

  it("renews a document entry as a deliberate page request and re-issues the cookie for the remaining idle time", async () => {
    install(sessionDouble(() => Effect.succeed(usableSession)))

    const response = await protect(request("/", { cookie: reference, headers: navigation }))

    expect(recorded.reads).toEqual([])
    expect(recorded.refreshes).toEqual([{
      activity: "deliberate-page-request",
      policy: effectiveSessionPolicy(tenantConfig),
      reference,
      tenantAlias: alias
    }])
    const cookies = sessionCookies(response)
    expect(cookies).toHaveLength(1)
    expect(cookies[0]).toContain(`pathable-session=${reference}`)
    expect(cookies[0]).toContain("Max-Age=1234")
    expect(cookies[0]).toContain("HttpOnly")
    expect(cookies[0]).toContain("SameSite=lax")
    expect(cookies[0]).toContain("Path=/")
    expect(cookies[0]).toContain("Secure")
    expect(cookies[0]).not.toContain("Domain=")
    expect(passedThrough(response)).toBe(true)
  })

  it("renews a protected Server Action submission as a deliberate form submission", async () => {
    install(sessionDouble(() => Effect.succeed(usableSession)))

    const response = await protect(
      request("/", { cookie: reference, headers: { ...rscFetch, "next-action": "abc" }, method: "POST" })
    )

    expect(recorded.reads).toEqual([])
    expect(recorded.refreshes.map((input) => input.activity)).toEqual(["deliberate-form-submission"])
    expect(recorded.refreshes[0]?.policy).toEqual(effectiveSessionPolicy(tenantConfig))
    expect(sessionCookies(response)).toHaveLength(1)
  })

  it.each([
    { headers: rscFetch, label: "RSC fetch or prefetch", method: "GET" },
    { headers: imageLoad, label: "subresource", method: "GET" },
    { headers: {}, label: "absent metadata", method: "GET" },
    { headers: rscFetch, label: "POST without an action", method: "POST" },
    { headers: { ...navigation, "next-action": "abc" }, label: "GET carrying an action", method: "GET" }
  ])("only reads, never renews, for $label", async ({ headers, method }) => {
    install(sessionDouble(() => Effect.succeed(usableSession)))

    const response = await protect(request("/", { cookie: reference, headers, method }))

    expect(recorded.refreshes).toEqual([])
    expect(recorded.reads).toEqual([{ reference, tenantAlias: alias }])
    expect(sessionCookies(response)).toEqual([])
    expect(passedThrough(response)).toBe(true)
  })
})

describe("createProtectionProxy defects", () => {
  it("rejects rather than passing through when the forbidden document factory throws", async () => {
    install(sessionDouble(() => Effect.fail(new SessionTenantMismatch({}))))
    const failing = createProtectionProxy({
      ...responses,
      forbiddenDocument: () => Promise.reject(new Error("factory failed"))
    })

    await expect(failing(request("/", { cookie: reference, headers: navigation }))).rejects.toBeDefined()
  })

  it("rejects rather than passing through when the tenant failure factory throws", async () => {
    install(
      sessionDouble(() => Effect.succeed(usableSession)),
      tenantDouble(Result.fail(new TenantNotFound({ cause: new Error("x"), message: "x" })))
    )
    const failing = createProtectionProxy({
      ...responses,
      tenantFailure: () => {
        throw new Error("factory failed")
      }
    })

    await expect(failing(request("/", { headers: navigation }))).rejects.toBeDefined()
  })

  it("rejects rather than passing through when the session service defects", async () => {
    install(sessionDouble(() => Effect.die(new Error("unexpected"))))

    await expect(protect(request("/", { cookie: reference, headers: navigation }))).rejects.toBeDefined()
    await expect(protect(request("/", { cookie: reference, headers: rscFetch }))).rejects.toBeDefined()
  })
})
