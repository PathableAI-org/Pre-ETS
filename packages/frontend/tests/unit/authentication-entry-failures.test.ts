import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"

import LoginPage from "../../src/app/auth/login/page.tsx"
import { AuthenticationService, AuthenticationUnavailable } from "../../src/lib/authentication.ts"
import { HttpError } from "../../src/lib/error.ts"
import { requestHeaders, setRequestHost } from "./next-headers-stub.ts"
import { NotFoundError, RedirectError } from "./next-navigation-stub.ts"

const runtime = vi.hoisted(() => ({ runPromise: vi.fn() }))
vi.mock("../../src/lib/runtime", () => ({ Runtime: runtime }))

const usePreparation = (outcome: Effect.Effect<string, AuthenticationUnavailable | HttpError>) => {
  runtime.runPromise.mockImplementation((program: Effect.Effect<unknown, unknown, AuthenticationService>) =>
    Effect.runPromise(program.pipe(Effect.provideService(AuthenticationService, { prepare: () => outcome })))
  )
}

afterEach(() => {
  requestHeaders.clear()
  vi.resetAllMocks()
})

describe("login expected-failure mapping", () => {
  it("maps tenant 404 to the ordinary missing-page interrupt", async () => {
    setRequestHost("unknown.example.test")
    usePreparation(Effect.fail(
      new HttpError({
        cause: new Error("selected fixture unavailable"),
        message: "Selected tenant cannot be read",
        status: 404
      })
    ))
    await expect(LoginPage()).rejects.toEqual(new NotFoundError())
  })

  it("preserves tenant 500 without substituting a provider or sign-in failure", async () => {
    const failure = new HttpError({
      cause: new Error("fixture directory unavailable"),
      message: "Tenant directory cannot be read",
      status: 500
    })
    setRequestHost("springfield.example.test")
    usePreparation(Effect.fail(failure))
    await expect(LoginPage()).rejects.toBe(failure)
  })

  it("navigates to safe public sign-in failure without reflecting hostile request values", async () => {
    setRequestHost("attacker.invalid/?returnTo=https://attacker.invalid")
    requestHeaders.set("forwarded", "host=attacker.invalid;proto=http")
    requestHeaders.set("x-forwarded-host", "attacker.invalid")
    requestHeaders.set("next-url", "/auth/login?returnTo=https://attacker.invalid&error=unsafe")
    usePreparation(Effect.fail(new AuthenticationUnavailable()))
    await expect(LoginPage()).rejects.toEqual(new RedirectError("/login-unavailable"))
  })

  it.each([new RedirectError("/framework-navigation"), new NotFoundError()])(
    "preserves a framework navigation interrupt from the runtime bridge: %s",
    async (interrupt) => {
      setRequestHost("springfield.example.test")
      runtime.runPromise.mockRejectedValueOnce(interrupt)
      await expect(LoginPage()).rejects.toBe(interrupt)
    }
  )
})
