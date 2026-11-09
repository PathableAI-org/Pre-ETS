import { NodeServices } from "@effect/platform-node"
import { fc, it } from "@fast-check/vitest"
import { Effect, Layer, Schema } from "effect"
import { NextRequest, NextResponse } from "next/server"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, vi } from "vitest"

import { AuthenticationDenied, AuthenticationService, CallbackExpectedFailure } from "../../src/authentication.ts"
import { createCallbackHandler } from "../../src/next.ts"
import { CallbackFreshness } from "../../src/next.ts"
import { createLoginHandler } from "../../src/next.ts"
import { SessionService } from "../../src/session.ts"
import { TenantAlias, TenantConfigService } from "../../src/tenant.ts"
import { sessionWorld } from "../helpers/session.ts"

const runtime = vi.hoisted(() => ({ runPromise: vi.fn() }))
vi.mock("../../src/runtime.ts", () => ({ Runtime: runtime }))

const tenantFailure = (status: 404 | 500) =>
  Promise.resolve(
    new NextResponse(status === 404 ? "missing-tenant" : null, {
      headers: {
        "cache-control": "private, no-store",
        ...(status === 404 ? { "content-type": "text/html; charset=utf-8" } : {})
      },
      status
    })
  )

const authenticationReturn = () =>
  Promise.resolve(
    new NextResponse("authentication-return", {
      headers: {
        "cache-control": "private, no-store",
        "content-type": "text/html; charset=utf-8"
      },
      status: 200
    })
  )

const login = createLoginHandler(tenantFailure)
const callback = createCallbackHandler({ authenticationReturn, tenantFailure })

const alias = Schema.decodeSync(TenantAlias)("alpha")

afterEach(() => {
  vi.clearAllMocks()
})

const routeSessionLayer = Layer.succeed(SessionService, {
  establish: (): never => {
    throw new Error("establish must remain unused without a confirmed result")
  },
  invalidate: (): never => {
    throw new Error("invalidate must remain unused by authentication entry")
  },
  read: (): never => {
    throw new Error("read must remain unused by authentication entry")
  },
  readForTenant: (): never => {
    throw new Error("readForTenant must remain unused by authentication entry")
  },
  refreshForTenant: (): never => {
    throw new Error("refreshForTenant must remain unused by authentication entry")
  }
})

const routeTenantLayer = Layer.succeed(TenantConfigService, {
  getAlias: (): never => {
    throw new Error("getAlias must remain unused for an unconfirmed result")
  },
  getConfigFromAlias: (): never => {
    throw new Error("getConfigFromAlias must remain unused for an unconfirmed result")
  },
  getConfigFromHost: (): never => {
    throw new Error("getConfigFromHost must remain unused for an unconfirmed result")
  }
})

const trustedIdentity = {
  authenticatedAt: 1_700_000_000,
  issuer: "https://provider.test/",
  subject: "subject-1",
  tenantAlias: alias
}

const routeRuntime = (
  service: AuthenticationService["Service"],
  provided: {
    readonly confirmed?: boolean
    readonly session: Layer.Layer<SessionService, unknown>
    readonly tenant: Layer.Layer<TenantConfigService, unknown>
  } = { session: routeSessionLayer, tenant: routeTenantLayer }
) => {
  runtime.runPromise.mockImplementation((program: Effect.Effect<unknown, never, AuthenticationService>) =>
    Effect.runPromise(
      program.pipe(
        Effect.provideService(AuthenticationService, service),
        // Without `confirmed`, the production default (fail closed) applies.
        provided.confirmed === true
          ? Effect.provideService(CallbackFreshness, { confirmed: () => true })
          : (effect) => effect,
        Effect.provide(Layer.mergeAll(provided.session, provided.tenant))
      )
    )
  )
}

const cookiesNamed = (response: Response, name: string) =>
  response.headers.getSetCookie().filter((cookie) => cookie.startsWith(`${name}=`))

const expectHostOnlyCookie = (cookie: string, path: string, secure: boolean) => {
  expect(cookie).toContain("HttpOnly")
  expect(cookie).toContain("SameSite=lax")
  expect(cookie).toContain(`Path=${path}`)
  expect(cookie).not.toContain("Domain=")
  if (secure) expect(cookie).toContain("Secure")
  else expect(cookie).not.toContain("Secure")
}

const navigationHeaders = { host: "alpha.example.test", "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" }

const tenantDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), "preets-login-tenant-"))
  await writeFile(
    join(directory, "alpha.json"),
    JSON.stringify({
      displayName: "Alpha",
      idleTimeoutMinutes: 30,
      oidc: { clientAuth: "public", clientId: "alpha-web", issuer: "https://provider.test" },
      warningLeadMinutes: 5
    })
  )
  return directory
}

const hostTenants = (directory: string) =>
  TenantConfigService.layer({ baseHostname: "example.test", configDir: directory, resolution: "host" })
    .pipe(Layer.provide(NodeServices.layer))

const nonNavigationLogin = (host: string, mode: string) =>
  new NextRequest(`https://${host}/auth/login`, {
    headers: {
      cookie: `oidc-correlation=${"D".repeat(43)}`,
      host,
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": mode
    }
  })

const maxAge = (cookie: string) => Number(/Max-Age=(\d+)/.exec(cookie)?.[1])

describe("authentication Route Handlers [PREETS-SESSION-003, PREETS-SESSION-013]", () => {
  it.prop([fc.domain(), fc.domain(), fc.string().map(encodeURIComponent)])(
    "sets the persisted correlation cookie only with the prepared 307",
    async (host, provider, state) => {
      const destination = `https://${provider}/authorize?state=${state}&redirect_uri=${
        encodeURIComponent(`https://${host}/auth/callback`)
      }`
      const expiresAt = Date.now() + 600_000
      const prepare = vi.fn(({ host: selectedHost }: { readonly host: string }) => {
        expect(selectedHost).toBe(host)
        return Effect.succeed({ correlation: "A".repeat(43), destination, expiresAt })
      })
      routeRuntime({
        complete: () => Effect.die("complete must remain unused"),
        prepare
      })

      const response = await login(
        new NextRequest(`https://${host}/auth/login?returnTo=hostile`, {
          headers: {
            forwarded: "host=attacker.invalid;proto=http",
            host,
            "x-forwarded-host": "attacker.invalid"
          }
        })
      )

      expect(response.status).toBe(307)
      expect(response.headers.get("location")).toBe(destination)
      expect(response.headers.get("cache-control")).toBe("private, no-store")
      const cookie = response.headers.get("set-cookie") ?? ""
      expect(cookie).toContain(`oidc-correlation=${"A".repeat(43)}`)
      expect(cookie).toContain("HttpOnly")
      expect(cookie).toContain("SameSite=lax")
      expect(cookie).toContain("Path=/auth/callback")
      expect(cookie).toContain("Secure")
      expect(cookie).toMatch(/Max-Age=(?:599|600)/)
      expect(cookie).not.toContain("Domain=")
      expect(cookie).not.toContain("hostile")
    }
  )

  it.each(["cors", "no-cors", "same-origin"])(
    "refuses a %s login request on a resolved tenant with 401 and prepares nothing",
    async (mode) => {
      const directory = await tenantDirectory()
      try {
        const prepare = vi.fn(() => Effect.die("prepare must remain unused for a non-navigation"))
        routeRuntime(
          { complete: () => Effect.die("complete must remain unused"), prepare },
          { session: routeSessionLayer, tenant: hostTenants(directory) }
        )

        const response = await login(nonNavigationLogin("alpha.example.test", mode))

        expect(response.status).toBe(401)
        expect(response.headers.get("cache-control")).toBe("private, no-store")
        expect(response.headers.get("location")).toBeNull()
        expect(response.headers.getSetCookie()).toEqual([])
        expect(await response.text()).toBe("")
        expect(prepare).not.toHaveBeenCalled()
      } finally {
        await rm(directory, { force: true, recursive: true })
      }
    }
  )

  it("keeps tenant failures ahead of refusing a non-navigation login request, preparing nothing", async () => {
    const directory = await tenantDirectory()
    try {
      const prepare = vi.fn(() => Effect.die("prepare must remain unused for a non-navigation"))
      const service = { complete: () => Effect.die("complete must remain unused"), prepare }
      const missingStatic = TenantConfigService.layer({
        configDir: directory,
        resolution: "static",
        staticAlias: "beta"
      })
        .pipe(Layer.provide(NodeServices.layer))

      for (
        const [tenant, host, status] of [
          [hostTenants(directory), "capital-city.example.test", 404],
          [missingStatic, "alpha.example.test", 500]
        ] as const
      ) {
        routeRuntime(service, { session: routeSessionLayer, tenant })

        const response = await login(nonNavigationLogin(host, "cors"))

        expect(response.status).toBe(status)
        expect(response.headers.get("location")).toBeNull()
        expect(response.headers.getSetCookie()).toEqual([])
      }
      expect(prepare).not.toHaveBeenCalled()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it("answers login and callback before runtime startup with a private, empty 503", async () => {
    runtime.runPromise.mockImplementation(() =>
      Promise.reject(Object.assign(new Error("startup not ready"), { _tag: "StartupNotReady" }))
    )

    for (const handler of [login, callback]) {
      const response = await handler(
        new NextRequest("https://alpha.example.test/auth/login", { headers: navigationHeaders })
      )
      expect(response.status).toBe(503)
      expect(response.headers.get("cache-control")).toBe("private, no-store")
      expect(response.headers.getSetCookie()).toEqual([])
      expect(await response.text()).toBe("")
    }
  })

  it("prepares login for an explicit navigation", async () => {
    const destination =
      "https://provider.test/authorize?state=s&redirect_uri=https%3A%2F%2Falpha.example.test%2Fauth%2Fcallback"
    const prepare = vi.fn(() =>
      Effect.succeed({ correlation: "A".repeat(43), destination, expiresAt: Date.now() + 600_000 })
    )
    routeRuntime({ complete: () => Effect.die("complete must remain unused"), prepare })

    const response = await login(
      new NextRequest("https://alpha.example.test/auth/login", {
        headers: { host: "alpha.example.test", "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" }
      })
    )

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(destination)
    expect(cookiesNamed(response, "oidc-correlation")).toHaveLength(1)
    expect(prepare).toHaveBeenCalledTimes(1)
  })

  it("treats a trusted handoff without freshness confirmation as the safe return, clearing correlation without a session cookie", async () => {
    const complete = vi.fn((_input: {
      readonly correlation?: string | undefined
      readonly host: string
      readonly query: readonly (readonly [string, string])[]
    }) => Effect.succeed(trustedIdentity))
    routeRuntime({ complete, prepare: () => Effect.die("prepare must remain unused") })
    const correlation = "B".repeat(43)
    const request = new NextRequest("https://alpha.example.test/auth/callback?code=secret-code&state=state-1", {
      headers: {
        cookie: `oidc-correlation=${correlation}`,
        host: "alpha.example.test"
      }
    })

    const response = await callback(request)

    expect(response.status).toBe(200)
    expect(await response.text()).toContain("authentication-return")
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    const cookie = response.headers.get("set-cookie") ?? ""
    expect(cookie).toContain("oidc-correlation=")
    expect(cookie).toContain("Max-Age=0")
    expect(cookie).not.toContain("pathable-session")
    expect([...response.headers.values()].join(" ")).not.toContain("secret-code")
    expect(complete).toHaveBeenCalledTimes(1)
    expect(complete.mock.calls[0]?.[0]).toEqual({
      correlation,
      host: "alpha.example.test",
      query: [["code", "secret-code"], ["state", "state-1"]]
    })
  })

  it("navigates to the application entry with one host-only session cookie after a freshness-confirmed establishment", async () => {
    const directory = await mkdtemp(join(tmpdir(), "preets-session-callback-"))
    try {
      await writeFile(
        join(directory, "alpha.json"),
        JSON.stringify({
          displayName: "Alpha",
          idleTimeoutMinutes: 30,
          oidc: { clientAuth: "public", clientId: "alpha-web", issuer: "https://provider.test" },
          warningLeadMinutes: 5
        })
      )
      const tenant = TenantConfigService.layer({ configDir: directory, resolution: "static", staticAlias: "alpha" })
        .pipe(Layer.provide(NodeServices.layer))
      routeRuntime(
        { complete: () => Effect.succeed(trustedIdentity), prepare: () => Effect.die("prepare must remain unused") },
        { confirmed: true, session: sessionWorld, tenant }
      )
      const correlation = `oidc-correlation=${"B".repeat(43)}`
      const secureRequest = new NextRequest("https://alpha.example.test/auth/callback?code=secret-code&state=state-1", {
        headers: { cookie: correlation, host: "alpha.example.test" }
      })
      const secure = await callback(secureRequest)
      expect(secure.status).toBe(303)
      expect(secure.headers.get("location")).toBe("/")
      expect(await secure.text()).toBe("")
      expect(secure.headers.get("cache-control")).toBe("private, no-store")
      const secureSession = cookiesNamed(secure, "pathable-session")
      const secureCorrelation = cookiesNamed(secure, "oidc-correlation")
      expect(secureSession).toHaveLength(1)
      expect(secureCorrelation).toHaveLength(1)
      expectHostOnlyCookie(secureSession[0] ?? "", "/", true)
      expectHostOnlyCookie(secureCorrelation[0] ?? "", "/auth/callback", true)
      expect(maxAge(secureCorrelation[0] ?? "")).toBe(0)
      // A browser-session cookie: establishment is its only writer, so its lifetime cannot track renewals (D15).
      expect(secureSession[0]).not.toMatch(/Max-Age=|Expires=/i)
      expect(secure.headers.get("set-cookie")).not.toContain("secret-code")

      const loopback = await callback(
        new NextRequest("http://alpha.localhost/auth/callback?code=secret-code&state=state-1", {
          headers: { cookie: correlation, host: "alpha.localhost" }
        })
      )
      const loopbackSession = cookiesNamed(loopback, "pathable-session")
      expect(loopback.status).toBe(303)
      expect(loopback.headers.get("location")).toBe("/")
      expect(loopbackSession).toHaveLength(1)
      expectHostOnlyCookie(loopbackSession[0] ?? "", "/", false)
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it("preserves correlation on pre-consumption denial", async () => {
    routeRuntime({
      complete: () =>
        Effect.fail(
          new CallbackExpectedFailure({
            correlationDisposition: "preserve",
            reason: new AuthenticationDenied({})
          })
        ),
      prepare: () => Effect.die("prepare must remain unused")
    })
    const response = await callback(
      new NextRequest(
        "https://alpha.example.test/auth/callback?state=wrong&code=untrusted",
        { headers: { cookie: `oidc-correlation=${"C".repeat(43)}`, host: "alpha.example.test" } }
      )
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toContain("authentication-return")
    expect(response.headers.get("set-cookie")).toBeNull()
    expect(response.headers.get("location")).toBeNull()
  })

  it("preserves correlation for a premature callback and clears it after the unconfirmed return", async () => {
    const complete = vi.fn()
      .mockReturnValueOnce(
        Effect.fail(
          new CallbackExpectedFailure({
            correlationDisposition: "preserve",
            reason: new AuthenticationDenied({})
          })
        )
      )
      .mockReturnValueOnce(Effect.succeed(trustedIdentity))
    routeRuntime({ complete, prepare: () => Effect.die("prepare must remain unused") })
    const cookie = `oidc-correlation=${"C".repeat(43)}`

    const premature = await callback(
      new NextRequest("https://alpha.example.test/auth/callback?code=premature&state=wrong", {
        headers: { cookie, host: "alpha.example.test" }
      })
    )
    expect(premature.status).toBe(200)
    expect(premature.headers.get("set-cookie")).toBeNull()
    expect(premature.headers.get("location")).toBeNull()

    const valid = await callback(
      new NextRequest("https://alpha.example.test/auth/callback?code=valid&state=expected", {
        headers: { cookie, host: "alpha.example.test" }
      })
    )
    expect(valid.status).toBe(200)
    expect(valid.headers.get("set-cookie")).toContain("Max-Age=0")
    expect(valid.headers.get("set-cookie")).not.toContain("pathable-session")
    expect(complete).toHaveBeenCalledTimes(2)
  })
})
