import { NodeServices } from "@effect/platform-node"
import { fc, it } from "@fast-check/vitest"
import { Effect, Layer, References } from "effect"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, vi } from "vitest"

import AppLayout from "../../src/app/(app)/layout.tsx"
import HomePage from "../../src/app/(app)/page.tsx"
import LoginPage from "../../src/app/auth/login/page.tsx"
import { AuthenticationService } from "../../src/lib/authentication.ts"
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

describe("login destination adapter", () => {
  it.prop([fc.domain(), fc.domain(), fc.string().map(encodeURIComponent)])(
    "delegates the prepared destination without deriving authority from forwarded headers or return data",
    async (host, provider, query) => {
      const destination = `https://${provider}/authorize?state=${query}`
      const prepare = vi.fn(({ host: selectedHost }: { readonly host: string }) => {
        expect(selectedHost).toBe(host)
        return Effect.succeed(destination)
      })
      runtime.runPromise.mockImplementation((program: Effect.Effect<unknown, unknown, AuthenticationService>) =>
        Effect.runPromise(program.pipe(Effect.provideService(AuthenticationService, { prepare })))
      )
      setRequestHost(host)
      requestHeaders.set("x-forwarded-host", "attacker.invalid")
      requestHeaders.set("forwarded", "host=attacker.invalid;proto=http")
      requestHeaders.set("next-url", `/auth/login?returnTo=${query}`)

      await expect(LoginPage()).rejects.toEqual(new RedirectError(destination))
    }
  )
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
