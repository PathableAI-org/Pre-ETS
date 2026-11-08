import { describe, expect, it } from "@effect/vitest"
import { Cause, Effect, Exit, Fiber, FileSystem, Layer, Path, References, Result } from "effect"
import { TestClock } from "effect/testing"
import { vi } from "vitest"

import type { TenantFailure } from "../../src/tenant.ts"

import { AuthenticationService, AuthenticationUnavailable } from "../../src/authentication.ts"
import { TenantConfigService } from "../../src/tenant.ts"
import { authenticationSettings, makeMemoryRedis } from "../helpers/authentication.ts"

const withScenario = <A, E, R>(program: Effect.Effect<A, E, AuthenticationService | R>, options: {
  readonly issuer?: string | undefined
} = {}) => {
  const redis = makeMemoryRedis()
  return program.pipe(
    Effect.provide(
      AuthenticationService.layer(authenticationSettings({ prefix: "test:failures" })).pipe(
        Layer.provide(redis.layer),
        Layer.provide(
          TenantConfigService.layer({ baseHostname: "example.test", configDir: "/tenants", resolution: "host" })
        ),
        Layer.provide(FileSystem.layerNoop({
          readDirectory: () => Effect.succeed([]),
          readFileString: () =>
            Effect.succeed(JSON.stringify({
              displayName: "Alpha",
              oidc: {
                clientAuth: "public",
                clientId: "alpha-client",
                issuer: options.issuer ?? "https://provider.test"
              }
            }))
        })),
        Layer.provide(Path.layer)
      )
    ),
    Effect.provideService(References.MinimumLogLevel, "Error")
  )
}

const attempt = Effect.gen(function*() {
  const authentication = yield* AuthenticationService
  return yield* authentication.prepare({ host: "alpha.example.test" })
})

const metadata = (issuer = "https://provider.test", authorization = `${issuer}/authorize`) =>
  Response.json({
    authorization_endpoint: authorization,
    issuer,
    jwks_uri: `${issuer}/jwks`,
    token_endpoint: `${issuer}/token`
  })

const withFetch = <A, E, R>(transport: typeof globalThis.fetch, program: Effect.Effect<A, E, R>) =>
  Effect.scoped(Effect.gen(function*() {
    yield* Effect.acquireRelease(
      Effect.sync(() => vi.spyOn(globalThis, "fetch").mockImplementation(transport)),
      (spy) =>
        Effect.sync(() => {
          spy.mockRestore()
        })
    )
    return yield* program
  }))

const expectUnavailable = (result: Result.Result<unknown, unknown>) => {
  expect(Result.isFailure(result)).toBe(true)
  if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(AuthenticationUnavailable)
}

const pendingPreparation = (
  check: (
    fiber: Fiber.Fiber<unknown, AuthenticationUnavailable | TenantFailure>,
    aborted: () => boolean
  ) => Effect.Effect<void>
) =>
  Effect.gen(function*() {
    let markStarted: () => void = () => undefined
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    let aborted = false
    yield* withFetch(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true
            reject(new Error("controlled transport aborted"))
          }, { once: true })
          markStarted()
        }),
      withScenario(Effect.gen(function*() {
        const fiber = yield* Effect.forkChild(attempt)
        yield* Effect.promise(() => started)
        yield* check(fiber, () => aborted)
      }))
    )
  })

describe("AuthenticationService safe failures [PREETS-SESSION-002]", () => {
  it.effect.each([
    { label: "mismatched discovered issuer", transport: () => Promise.resolve(metadata("https://other.test")) },
    { label: "unavailable discovery", transport: () => Promise.reject(new Error("controlled outage")) },
    { label: "non-success discovery", transport: () => Promise.resolve(new Response("upstream", { status: 503 })) },
    {
      label: "unsafe authorization endpoint",
      transport: () => Promise.resolve(metadata(undefined, "http://external.test/authorize"))
    }
  ])("returns safe unavailability for $label", ({ transport }) =>
    withFetch(
      transport,
      withScenario(Effect.gen(function*() {
        expectUnavailable(yield* attempt.pipe(Effect.result))
      }))
    ))

  it.effect("uses manual discovery redirects and never follows their destination", () => {
    const requests: string[] = []
    return withFetch(
      (input, init) => {
        requests.push(input instanceof Request ? input.url : input.toString())
        expect(init?.redirect).toBe("manual")
        return Promise.resolve(
          new Response(null, {
            headers: { location: "http://forbidden.test/discovery" },
            status: 302
          })
        )
      },
      withScenario(Effect.gen(function*() {
        expectUnavailable(yield* attempt.pipe(Effect.result))
        expect(requests).toEqual(["https://provider.test/.well-known/openid-configuration"])
      }))
    )
  })

  it.effect("cancels pending transport at five seconds and returns safe unavailability", () =>
    pendingPreparation((fiber, aborted) =>
      Effect.gen(function*() {
        yield* TestClock.adjust(4_999)
        expect(fiber.pollUnsafe()).toBeUndefined()
        expect(aborted()).toBe(false)
        yield* TestClock.adjust(1)
        expectUnavailable(yield* Fiber.join(fiber).pipe(Effect.result))
        expect(aborted()).toBe(true)
      })
    ))

  it.effect("caller interruption cancels transport and remains interruption", () =>
    pendingPreparation((fiber, aborted) =>
      Effect.gen(function*() {
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) expect(Cause.hasInterrupts(exit.cause)).toBe(true)
        expect(aborted()).toBe(true)
      })
    ))
})
