import { NodeServices } from "@effect/platform-node"
import { fc, it } from "@fast-check/vitest"
import { ConfigProvider, Effect, Layer, References, Schema } from "effect"
import { NextRequest, NextResponse } from "next/server"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, vi } from "vitest"

import { createCallbackHandler } from "../../src/auth/callback.ts"
import { callbackFreshnessPolicy } from "../../src/auth/freshness.ts"
import { createLoginHandler } from "../../src/auth/login.ts"
import { AuthenticationDenied, AuthenticationService, CallbackExpectedFailure } from "../../src/authentication.ts"
import { hasSession } from "../../src/entry.ts"
import { SessionService } from "../../src/session.ts"
import { TenantAlias, TenantConfigService } from "../../src/tenant.ts"
import { makeSessionMemoryRedis } from "../helpers/session.ts"

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

const redis = makeSessionMemoryRedis()

const routeSessionLayer = SessionService.layer.pipe(
  Layer.provide(redis.layer),
  Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ SESSION_KEY_PREFIX: "test:session" })))
)

const routeTenantLayer = Layer.succeed(TenantConfigService, {
  effectiveSessionPolicy: () => {
    throw new Error("effectiveSessionPolicy must remain unused for an unconfirmed result")
  },
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
    readonly session: Layer.Layer<SessionService, unknown>
    readonly tenant: Layer.Layer<TenantConfigService, unknown>
  } = { session: routeSessionLayer, tenant: routeTenantLayer }
) => {
  runtime.runPromise.mockImplementation((program: Effect.Effect<unknown, never, AuthenticationService>) =>
    Effect.runPromise(
      program.pipe(
        Effect.provideService(AuthenticationService, service),
        Effect.provide(provided.session),
        Effect.provide(provided.tenant)
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

const maxAge = (cookie: string) => Number(/Max-Age=(\d+)/.exec(cookie)?.[1])

describe("authentication Route Handlers", () => {
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

  it("treats a trusted handoff without freshness confirmation as the safe return, clearing correlation without a session cookie", async () => {
    const complete = vi.fn((_input: {
      readonly correlation?: string
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

  it("writes one host-only session cookie after a freshness-confirmed establishment", async () => {
    const directory = await mkdtemp(join(tmpdir(), "preets-session-callback-"))
    const confirmed = vi.spyOn(callbackFreshnessPolicy, "confirmed").mockReturnValue(true)
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
      const tenant = TenantConfigService.layer({
        env: "test",
        tenant: { configDir: directory, resolution: "static", staticAlias: "alpha" }
      }).pipe(Layer.provide(NodeServices.layer))
      const session = SessionService.layer.pipe(
        Layer.provide(redis.layer),
        Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ SESSION_KEY_PREFIX: "test:session" })))
      )
      routeRuntime(
        { complete: () => Effect.succeed(trustedIdentity), prepare: () => Effect.die("prepare must remain unused") },
        { session, tenant }
      )
      const correlation = `oidc-correlation=${"B".repeat(43)}`
      const secureRequest = new NextRequest("https://alpha.example.test/auth/callback?code=secret-code&state=state-1", {
        headers: { cookie: correlation, host: "alpha.example.test" }
      })
      const secure = await callback(secureRequest)
      expect(secure.status).toBe(204)
      expect(await secure.text()).toBe("")
      expect(secure.headers.get("cache-control")).toBe("private, no-store")
      const secureSession = cookiesNamed(secure, "pathable-session")
      const secureCorrelation = cookiesNamed(secure, "oidc-correlation")
      expect(secureSession).toHaveLength(1)
      expect(secureCorrelation).toHaveLength(1)
      expectHostOnlyCookie(secureSession[0] ?? "", "/", true)
      expectHostOnlyCookie(secureCorrelation[0] ?? "", "/auth/callback", true)
      expect(maxAge(secureCorrelation[0] ?? "")).toBe(0)
      const sessionLifetime = maxAge(secureSession[0] ?? "")
      expect(sessionLifetime).toBeGreaterThanOrEqual(1_790)
      expect(sessionLifetime).toBeLessThanOrEqual(1_800)
      expect(secure.headers.get("set-cookie")).not.toContain("secret-code")

      const loopback = await callback(
        new NextRequest("http://alpha.localhost/auth/callback?code=secret-code&state=state-1", {
          headers: { cookie: correlation, host: "alpha.localhost" }
        })
      )
      const loopbackSession = cookiesNamed(loopback, "pathable-session")
      expect(loopback.status).toBe(204)
      expect(loopbackSession).toHaveLength(1)
      expectHostOnlyCookie(loopbackSession[0] ?? "", "/", false)
    } finally {
      confirmed.mockRestore()
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

describe("application entry with the real absent-session capability", () => {
  it.prop([
    fc.constantFrom("host", "static"),
    fc.constantFrom("valid", "malformed", "missing-file", "missing-directory")
  ], { numRuns: 40 })("keeps the absent-session entry false before tenant-dependent work", async (
    resolution,
    world
  ) => {
    const directory = await mkdtemp(join(tmpdir(), "preets-entry-"))
    try {
      const configDir = join(directory, "tenants")
      if (world !== "missing-directory") await mkdir(configDir)
      if (world === "valid" || world === "malformed") {
        await writeFile(
          join(configDir, "springfield.json"),
          world === "malformed" ? "{" : JSON.stringify({
            displayName: "Entry scenario",
            oidc: { clientAuth: "public", clientId: "entry-web", issuer: "https://issuer.example.test" }
          })
        )
      }
      const tenant = resolution === "host" ?
        { baseHostname: "example.test", configDir, resolution: "host" as const } :
        { configDir, resolution: "static" as const, staticAlias: "springfield" }
      const services = Layer.mergeAll(
        SessionService.layer,
        TenantConfigService.layer({ env: "test", tenant })
      ).pipe(
        Layer.provide(redis.layer),
        Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ SESSION_KEY_PREFIX: "test:session" }))),
        Layer.provide(NodeServices.layer)
      )
      runtime.runPromise.mockImplementation((
        program: Effect.Effect<unknown, unknown, SessionService | TenantConfigService>
      ) =>
        Effect.runPromise(program.pipe(
          Effect.provide(services),
          Effect.provideService(References.MinimumLogLevel, "Error")
        ))
      )
      expect(await hasSession()).toBe(false)
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })
})
