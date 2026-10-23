import { Effect } from "effect"
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { GET as callback } from "../../src/app/auth/callback/route.ts"
import { GET as login } from "../../src/app/auth/login/route.ts"
import {
  AuthenticationDenied,
  AuthenticationService,
  AuthenticationUnavailable,
  CallbackExpectedFailure
} from "../../src/lib/authentication.ts"
import { HttpError } from "../../src/lib/error.ts"

const runtime = vi.hoisted(() => ({ runPromise: vi.fn() }))
vi.mock("../../src/lib/runtime", () => ({ Runtime: runtime }))

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
    expect(output).toContain("Sign-in could not continue")
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
