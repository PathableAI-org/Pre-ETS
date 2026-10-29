import { NodeServices } from "@effect/platform-node"
import { Effect, Layer, Schema } from "effect"
import { NextRequest, NextResponse } from "next/server"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createCallbackHandler } from "../../src/auth/callback.ts"
import { callbackFreshnessPolicy } from "../../src/auth/freshness.ts"
import { createLoginHandler } from "../../src/auth/login.ts"
import {
  AuthenticationDenied,
  AuthenticationService,
  AuthenticationUnavailable,
  CallbackExpectedFailure
} from "../../src/authentication.ts"
import { HttpError } from "../../src/error.ts"
import { SessionService, SessionServiceUnavailable } from "../../src/session.ts"
import { TenantAlias, TenantConfigService } from "../../src/tenant.ts"

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
    new NextResponse("authentication-return\nReturn to the application entry", {
      headers: {
        "cache-control": "private, no-store",
        "content-type": "text/html; charset=utf-8"
      },
      status: 200
    })
  )

const login = createLoginHandler(tenantFailure)
const callback = createCallbackHandler({ authenticationReturn, tenantFailure })

const useService = (service: AuthenticationService["Service"]) => {
  runtime.runPromise.mockImplementation((program: Effect.Effect<unknown, never, AuthenticationService>) =>
    Effect.runPromise(program.pipe(Effect.provideService(AuthenticationService, service)))
  )
}

const request = (path: string, cookie?: string) =>
  new NextRequest(new URL(path, "https://alpha.example.test"), {
    headers: {
      ...(cookie === undefined ? {} : { cookie }),
      host: "alpha.example.test",
      "x-forwarded-host": "attacker.invalid"
    }
  })

afterEach(() => vi.resetAllMocks())

describe("login expected-failure mapping", () => {
  it.each([404, 500] as const)("preserves tenant HTTP %s without a correlation cookie", async (status) => {
    useService({
      complete: () => Effect.die("complete must remain unused"),
      prepare: () =>
        Effect.fail(
          new HttpError({
            cause: new Error("controlled tenant failure"),
            message: "Selected tenant unavailable",
            status
          })
        )
    })

    const response = await login(request("/auth/login"))
    expect(response.status).toBe(status)
    expect(response.headers.get("set-cookie")).toBeNull()
    expect(response.headers.get("cache-control")).toBe("private, no-store")
  })

  it("returns the safe sign-in failure redirect without reflecting request data", async () => {
    useService({
      complete: () => Effect.die("complete must remain unused"),
      prepare: () => Effect.fail(new AuthenticationUnavailable({}))
    })
    const response = await login(request("/auth/login?returnTo=https://attacker.invalid&error=unsafe"))
    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("/login-unavailable")
    expect(response.headers.get("set-cookie")).toBeNull()
    expect([...response.headers.values()].join(" ")).not.toContain("attacker.invalid")
  })
})

describe("callback expected-failure mapping", () => {
  it("clears correlation after a consumed provider denial without re-emitting input", async () => {
    useService({
      complete: () =>
        Effect.fail(
          new CallbackExpectedFailure({
            correlationDisposition: "clear",
            reason: new AuthenticationDenied({})
          })
        ),
      prepare: () => Effect.die("prepare must remain unused")
    })
    const response = await callback(request(
      "/auth/callback?error=access_denied&error_description=private-provider-value&state=private-state",
      `oidc-correlation=${"D".repeat(43)}`
    ))
    const output = `${await response.text()} ${[...response.headers.values()].join(" ")}`
    expect(response.status).toBe(200)
    expect(output).toContain("authentication-return")
    expect(output).not.toContain("access_denied")
    expect(output).not.toContain("private-provider-value")
    expect(output).not.toContain("private-state")
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0")
    expect(response.headers.get("location")).toBeNull()
  })

  it.each([404, 500] as const)("preserves callback tenant HTTP %s and correlation", async (status) => {
    useService({
      complete: () =>
        Effect.fail(
          new CallbackExpectedFailure({
            correlationDisposition: "preserve",
            reason: new HttpError({
              cause: new Error("controlled tenant failure"),
              message: "Selected tenant unavailable",
              status
            })
          })
        ),
      prepare: () => Effect.die("prepare must remain unused")
    })
    const response = await callback(request(
      "/auth/callback?code=private&state=state",
      `oidc-correlation=${"E".repeat(43)}`
    ))
    expect(response.status).toBe(status)
    expect(response.headers.get("set-cookie")).toBeNull()
  })
})

describe("callback session-establishment failure mapping", () => {
  const alias = Schema.decodeSync(TenantAlias)("alpha")
  const identity = {
    authenticatedAt: 1_700_000_000,
    issuer: "https://provider.test/",
    subject: "subject-1",
    tenantAlias: alias
  }

  const tenantLayer = (configDir: string) =>
    TenantConfigService.layer({
      env: "test",
      tenant: { configDir, resolution: "static", staticAlias: "alpha" }
    }).pipe(Layer.provide(NodeServices.layer))

  const runConfirmed = (
    layers: {
      readonly session: Layer.Layer<SessionService, unknown>
      readonly tenant: Layer.Layer<TenantConfigService, unknown>
    }
  ) => {
    runtime.runPromise.mockImplementation((program: Effect.Effect<unknown, never, AuthenticationService>) =>
      Effect.runPromise(program.pipe(
        Effect.provideService(AuthenticationService, {
          complete: () => Effect.succeed(identity),
          prepare: () => Effect.die("prepare must remain unused")
        }),
        Effect.provide(layers.session),
        Effect.provide(layers.tenant)
      ))
    )
  }

  const expectSafeReturn = async (response: Response, absent: string) => {
    const body = await response.text()
    const cookies = response.headers.getSetCookie().join(" ")
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(body).toContain("authentication-return")
    expect(body).toContain("Return to the application entry")
    expect(body).not.toContain(absent)
    expect(cookies).toContain("oidc-correlation=")
    expect(cookies).toContain("Max-Age=0")
    expect(cookies).not.toContain("pathable-session")
  }

  it("returns the safe page when tenant lookup fails after a confirmed trusted result", async () => {
    const confirmed = vi.spyOn(callbackFreshnessPolicy, "confirmed").mockReturnValue(true)
    const missingDirectory = join(tmpdir(), "preets-missing-tenant-config")
    const establish = vi.fn(() => Effect.die("establish must remain unused"))
    try {
      runConfirmed({
        session: Layer.succeed(SessionService, {
          establish,
          read: () => Effect.die("read must remain unused"),
          readForTenant: () => Effect.succeed({ _tag: "NoUsableSession" }),
          refreshForTenant: () => Effect.die("refreshForTenant must remain unused")
        }),
        tenant: tenantLayer(missingDirectory)
      })
      const response = await callback(request(
        "/auth/callback?code=secret-code&state=state-1",
        `oidc-correlation=${"F".repeat(43)}`
      ))
      await expectSafeReturn(response, missingDirectory)
      expect(establish).not.toHaveBeenCalled()
    } finally {
      confirmed.mockRestore()
    }
  })

  it("returns the safe page when establishment fails after a confirmed trusted result", async () => {
    const directory = await mkdtemp(join(tmpdir(), "preets-session-failure-"))
    const confirmed = vi.spyOn(callbackFreshnessPolicy, "confirmed").mockReturnValue(true)
    const establish = vi.fn(() => Effect.fail(new SessionServiceUnavailable({})))
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
      runConfirmed({
        session: Layer.succeed(SessionService, {
          establish,
          read: () => Effect.die("read must remain unused"),
          readForTenant: () => Effect.succeed({ _tag: "NoUsableSession" }),
          refreshForTenant: () => Effect.die("refreshForTenant must remain unused")
        }),
        tenant: tenantLayer(directory)
      })
      const response = await callback(request(
        "/auth/callback?code=secret-code&state=state-1",
        `oidc-correlation=${"G".repeat(43)}`
      ))
      await expectSafeReturn(response, "SessionServiceUnavailable")
      expect(establish).toHaveBeenCalledTimes(1)
    } finally {
      confirmed.mockRestore()
      await rm(directory, { force: true, recursive: true })
    }
  })
})
