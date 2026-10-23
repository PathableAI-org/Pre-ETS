import { NodeServices } from "@effect/platform-node"
import { fc, it } from "@fast-check/vitest"
import { Effect, Layer, References } from "effect"
import { NextRequest } from "next/server"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, vi } from "vitest"

import AppLayout from "../../src/app/(app)/layout.tsx"
import HomePage from "../../src/app/(app)/page.tsx"
import { GET as callback } from "../../src/app/auth/callback/route.ts"
import { GET as login } from "../../src/app/auth/login/route.ts"
import { AuthenticationDenied, AuthenticationService, CallbackExpectedFailure } from "../../src/lib/authentication.ts"
import { SessionService } from "../../src/lib/session.ts"
import { TenantConfigService } from "../../src/lib/tenant.ts"
import { requestHeaders, setRequestHost } from "./next-headers-stub.ts"
import { RedirectError } from "./next-navigation-stub.ts"

const runtime = vi.hoisted(() => ({ runPromise: vi.fn() }))
vi.mock("../../src/lib/runtime", () => ({ Runtime: runtime }))

afterEach(() => {
  requestHeaders.clear()
  vi.clearAllMocks()
})

const routeRuntime = (service: AuthenticationService["Service"]) => {
  runtime.runPromise.mockImplementation((program: Effect.Effect<unknown, never, AuthenticationService>) =>
    Effect.runPromise(program.pipe(Effect.provideService(AuthenticationService, service)))
  )
}

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

  it("maps a trusted handoff to an empty 204 and clears only correlation", async () => {
    const complete = vi.fn((_input: {
      readonly correlation?: string
      readonly host: string
      readonly query: readonly (readonly [string, string])[]
    }) =>
      Effect.succeed({
        authenticatedAt: 1_700_000_000,
        issuer: "https://provider.test/",
        subject: "subject-1",
        tenantAlias: "alpha"
      })
    )
    routeRuntime({ complete, prepare: () => Effect.die("prepare must remain unused") })
    const correlation = "B".repeat(43)
    const request = new NextRequest("https://alpha.example.test/auth/callback?code=secret-code&state=state-1", {
      headers: {
        cookie: `oidc-correlation=${correlation}`,
        host: "alpha.example.test"
      }
    })

    const response = await callback(request)

    expect(response.status).toBe(204)
    expect(await response.text()).toBe("")
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    const cookie = response.headers.get("set-cookie") ?? ""
    expect(cookie).toContain("oidc-correlation=")
    expect(cookie).toContain("Max-Age=0")
    expect(cookie).not.toContain("session=")
    expect([...response.headers.values()].join(" ")).not.toContain("secret-code")
    expect(complete).toHaveBeenCalledTimes(1)
    expect(complete.mock.calls[0]?.[0]).toEqual({
      correlation,
      host: "alpha.example.test",
      query: [["code", "secret-code"], ["state", "state-1"]]
    })
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
    expect(await response.text()).toContain("Authentication return")
    expect(response.headers.get("set-cookie")).toBeNull()
    expect(response.headers.get("location")).toBeNull()
  })

  it("preserves correlation for a premature callback and clears it after the valid return", async () => {
    const complete = vi.fn()
      .mockReturnValueOnce(
        Effect.fail(
          new CallbackExpectedFailure({
            correlationDisposition: "preserve",
            reason: new AuthenticationDenied({})
          })
        )
      )
      .mockReturnValueOnce(
        Effect.succeed({
          authenticatedAt: 1_700_000_000,
          issuer: "https://provider.test/",
          subject: "subject-1",
          tenantAlias: "alpha"
        })
      )
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
    expect(valid.status).toBe(204)
    expect(valid.headers.get("set-cookie")).toContain("Max-Age=0")
    expect(complete).toHaveBeenCalledTimes(2)
  })
})

describe("application entry with the real absent-session capability", () => {
  it.prop([
    fc.oneof(fc.domain(), fc.constantFrom("springfield.example.test", "", "forged.invalid:3000")),
    fc.option(fc.string().map(encodeURIComponent), { nil: undefined }),
    fc.constantFrom("host", "static"),
    fc.constantFrom("valid", "malformed", "missing-file", "missing-directory")
  ], { numRuns: 40 })("denies root rendering before tenant-dependent work, including its layout", async (
    host,
    cookie,
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
      ).pipe(Layer.provide(NodeServices.layer))
      runtime.runPromise.mockImplementation((
        program: Effect.Effect<unknown, unknown, SessionService | TenantConfigService>
      ) =>
        Effect.runPromise(program.pipe(
          Effect.provide(services),
          Effect.provideService(References.MinimumLogLevel, "Error")
        ))
      )
      setRequestHost(host)
      if (cookie !== undefined) requestHeaders.set("cookie", `session=${cookie}; oidc-correlation=forged`)

      expect(await AppLayout({ children: "child rendering is independently gated" })).toBe(
        "child rendering is independently gated"
      )
      await expect(HomePage()).rejects.toEqual(new RedirectError("/auth/login"))
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })
})
