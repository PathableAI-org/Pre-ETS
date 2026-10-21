import { describe, expect, it } from "@effect/vitest"
import { Cause, ConfigProvider, Effect, Exit, Fiber, FileSystem, Path, References, Result, Schema } from "effect"
import { TestClock } from "effect/testing"
import { vi } from "vitest"

import { AuthenticationService, AuthenticationUnavailable } from "../../src/lib/authentication.ts"
import { HttpError } from "../../src/lib/error.ts"
import { TenantConfigService } from "../../src/lib/tenant.ts"

const withScenario = <A, E, R>(program: Effect.Effect<A, E, AuthenticationService | R>, options: {
  readonly allowHttp?: boolean
  readonly callback?: string
  readonly fileEffect?: Effect.Effect<string>
  readonly issuer?: string
  readonly missingMap?: boolean
} = {}) =>
  program.pipe(
    Effect.provide(AuthenticationService.layer),
    Effect.provide(TenantConfigService.layer({
      env: "test",
      tenant: { baseHostname: "example.test", configDir: "/tenants", resolution: "host" }
    })),
    Effect.provide(FileSystem.layerNoop({
      readDirectory: () => Effect.succeed([]),
      readFileString: () =>
        options.fileEffect ?? Effect.succeed(JSON.stringify({
          displayName: "Alpha",
          oidc: {
            clientAuth: "public",
            clientId: "alpha-client",
            issuer: options.issuer ?? "https://provider.test"
          }
        }))
    })),
    Effect.provide(Path.layer),
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({
        OIDC_ALLOW_INSECURE_LOOPBACK: String(options.allowHttp ?? false),
        OIDC_CALLBACK_ORIGINS_JSON: JSON.stringify(
          options.missingMap ? {} : {
            alpha: options.callback ?? "https://application.test"
          }
        )
      })
    ),
    Effect.provideService(References.MinimumLogLevel, "Error")
  )

const attempt = Effect.fnUntraced(function*(host?: string) {
  const authentication = yield* AuthenticationService
  return yield* authentication.prepare({ host: host ?? "alpha.example.test" })
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

const metadata = (issuer = "https://provider.test", authorization = `${issuer}/authorize`) =>
  Response.json({
    authorization_endpoint: authorization,
    issuer,
    jwks_uri: `${issuer}/jwks`,
    token_endpoint: `${issuer}/token`
  })

const expectUnavailable = (result: Result.Result<unknown, unknown>) => {
  expect(Result.isFailure(result)).toBe(true)
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(AuthenticationUnavailable)
    expect(result.failure).not.toBeInstanceOf(HttpError)
  }
}

const externalHost = Schema.String.pipe(Schema.check(Schema.isPattern(/^[a-z]{1,14}\.example\.test$/)))

const pendingScenario = (
  check: (
    fiber: Fiber.Fiber<string, AuthenticationUnavailable | HttpError>,
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
        const fiber = yield* Effect.forkChild(attempt())
        yield* Effect.promise(() => started)
        yield* check(fiber, () => aborted)
      }))
    )
  })

describe("AuthenticationService denial and cancellation", () => {
  it.effect("resolves tenant failures distinctly before provider preparation", () =>
    withFetch(
      () => {
        throw new Error("Provider must remain unused")
      },
      Effect.gen(function*() {
        const result = yield* withScenario(attempt("unbound.test")).pipe(Effect.result)
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toBeInstanceOf(HttpError)
          expect(result.failure).toMatchObject({ status: 404 })
        }
      })
    ))

  it.effect("missing callback alias denies preparation without contacting a provider", () => {
    let fetches = 0
    return withFetch(
      () => {
        fetches += 1
        return Promise.resolve(metadata())
      },
      Effect.gen(function*() {
        expectUnavailable(yield* withScenario(attempt(), { missingMap: true }).pipe(Effect.result))
        expect(fetches).toBe(0)
      })
    )
  })

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
      Effect.gen(function*() {
        expectUnavailable(yield* withScenario(attempt()).pipe(Effect.result))
      })
    ))

  it.effect("rejects the client's direct metadata shortcut before any fetch", () => {
    let fetches = 0
    return withFetch(
      () => {
        fetches += 1
        return Promise.resolve(metadata())
      },
      Effect.gen(function*() {
        expectUnavailable(
          yield* withScenario(attempt(), {
            issuer: "https://provider.test/.well-known/openid-configuration"
          }).pipe(Effect.result)
        )
        expect(fetches).toBe(0)
      })
    )
  })

  it.effect("retains manual discovery redirects and never fetches their destination", () => {
    const requests: string[] = []
    const redirects: (RequestRedirect | undefined)[] = []
    const signals: (AbortSignal | null | undefined)[] = []
    return withFetch(
      (input, init) => {
        requests.push(input instanceof Request ? input.url : input.toString())
        redirects.push(init?.redirect)
        signals.push(init?.signal)
        return Promise.resolve(
          new Response(null, { headers: { location: "http://forbidden.test/discovery" }, status: 302 })
        )
      },
      Effect.gen(function*() {
        expectUnavailable(yield* withScenario(attempt()).pipe(Effect.result))
        expect(requests).toEqual(["https://provider.test/.well-known/openid-configuration"])
        expect(redirects).toEqual(["manual"])
        expect(signals[0]).toBeInstanceOf(AbortSignal)
      })
    )
  })

  it.effect.prop("forbids external HTTP issuer even when loopback HTTP is enabled", [externalHost], ([host]) => {
    let fetches = 0
    return withFetch(
      () => {
        fetches += 1
        return Promise.resolve(metadata(`http://${host}`))
      },
      Effect.gen(function*() {
        expectUnavailable(
          yield* withScenario(attempt(), { allowHttp: true, issuer: `http://${host}` }).pipe(Effect.result)
        )
        expect(fetches).toBe(0)
      })
    )
  })

  it.effect.prop(
    "validates discovered authorization URLs independently of a permitted HTTPS issuer",
    [externalHost],
    ([host]) =>
      withFetch(
        () => Promise.resolve(metadata(undefined, `http://${host}/authorize`)),
        Effect.gen(function*() {
          expectUnavailable(yield* withScenario(attempt(), { allowHttp: true }).pipe(Effect.result))
        })
      )
  )

  it.effect.prop(
    "rejects external HTTP callback origins at Layer build even with local HTTP enabled",
    [externalHost],
    ([host]) =>
      Effect.gen(function*() {
        const result = yield* withScenario(Effect.asVoid(AuthenticationService), {
          allowHttp: true,
          callback: `http://${host}`
        }).pipe(Effect.result)
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) expect(result.failure._tag).toBe("ConfigError")
      })
  )

  it.effect.each(["localhost.example.test", "0.0.0.0", "[::]", "192.168.1.1"])(
    "rejects HTTP issuer on non-loopback %s",
    (host) => {
      const issuer = `http://${host}`
      let fetches = 0
      return withFetch(
        () => {
          fetches += 1
          return Promise.resolve(metadata(issuer))
        },
        Effect.gen(function*() {
          expectUnavailable(yield* withScenario(attempt(), { allowHttp: true, issuer }).pipe(Effect.result))
          expect(fetches).toBe(0)
        })
      )
    }
  )

  it.effect.each(["localhost", "tenant.localhost", "127.0.0.1", "127.42.1.9", "[::1]"])(
    "permits explicit loopback HTTP at issuer, discovery, authorization and callback for %s",
    (host) => {
      const issuer = `http://${host}:8080`
      return withFetch(
        (input) => {
          expect(input instanceof Request ? input.url : input.toString()).toBe(
            `${issuer}/.well-known/openid-configuration`
          )
          return Promise.resolve(metadata(issuer))
        },
        Effect.gen(function*() {
          const destination = new URL(
            yield* withScenario(attempt(), {
              allowHttp: true,
              callback: `http://${host}:3000`,
              issuer
            })
          )
          expect(destination.origin).toBe(issuer)
          expect(destination.searchParams.get("redirect_uri")).toBe(`http://${host}:3000/auth/callback`)
        })
      )
    }
  )

  it.effect.prop("permits the explicitly enabled IPv4 loopback address domain", [
    Schema.Int.pipe(Schema.check(Schema.isBetween({ maximum: 255, minimum: 0 }))),
    Schema.Int.pipe(Schema.check(Schema.isBetween({ maximum: 255, minimum: 0 }))),
    Schema.Int.pipe(Schema.check(Schema.isBetween({ maximum: 255, minimum: 0 })))
  ], ([a, b, c]) => {
    const issuer = `http://127.${String(a)}.${String(b)}.${String(c)}:8080`
    return withFetch(
      () => Promise.resolve(metadata(issuer)),
      Effect.gen(function*() {
        const destination = new URL(
          yield* withScenario(attempt(), {
            allowHttp: true,
            callback: issuer,
            issuer
          })
        )
        expect(destination.origin).toBe(issuer)
        expect(destination.searchParams.get("redirect_uri")).toBe(`${issuer}/auth/callback`)
      })
    )
  })

  it.effect("defaults to HTTPS even for loopback providers", () => {
    const issuer = "http://localhost:8080"
    let fetches = 0
    return withFetch(
      () => {
        fetches += 1
        return Promise.resolve(metadata(issuer))
      },
      Effect.gen(function*() {
        expectUnavailable(yield* withScenario(attempt(), { issuer }).pipe(Effect.result))
        expect(fetches).toBe(0)
      })
    )
  })

  it.effect("cancels pending transport at five seconds and returns safe unavailability", () =>
    pendingScenario((fiber, aborted) =>
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
    pendingScenario((fiber, aborted) =>
      Effect.gen(function*() {
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) expect(Cause.hasInterrupts(exit.cause)).toBe(true)
        expect(aborted()).toBe(true)
      })
    ))

  it.effect("does not convert defects in a dependency to preparation failure", () =>
    Effect.gen(function*() {
      const exit = yield* withScenario(attempt(), { fileEffect: Effect.die("controlled defect") }).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Cause.hasDies(exit.cause)).toBe(true)
    }))
})
