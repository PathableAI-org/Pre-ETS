import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, FileSystem, Path, References, Result } from "effect"
import { vi } from "vitest"

import {
  AuthenticationService,
  AuthenticationUnavailable,
  makeAuthenticationTestHarness
} from "../../src/lib/authentication.ts"
import { TenantConfigService } from "../../src/lib/tenant.ts"
import { makeMemoryRedis } from "../helpers/authentication.ts"

const withScenario = <A, E, R>(program: Effect.Effect<A, E, AuthenticationService | R>, options: {
  readonly callbackOrigins?: string
  readonly credentialMap?: string
  readonly issuer?: string
  readonly ttl?: string
} = {}) => {
  const redis = makeMemoryRedis()
  return program.pipe(
    Effect.provide(makeAuthenticationTestHarness({ redis: redis.layer }).layer),
    Effect.provide(TenantConfigService.layer({
      env: "test",
      tenant: { baseHostname: "example.test", configDir: "/tenants", resolution: "host" }
    })),
    Effect.provide(FileSystem.layerNoop({
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
    Effect.provide(Path.layer),
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({
        OIDC_ALLOW_INSECURE_LOOPBACK: "false",
        OIDC_CALLBACK_ORIGINS_JSON: options.callbackOrigins ?? JSON.stringify({
          alpha: "https://alpha.example.test"
        }),
        OIDC_CLIENT_SECRETS_JSON: options.credentialMap ?? "{}",
        OIDC_TX_KEY_PREFIX: "test:failures",
        ...(options.ttl === undefined ? {} : { OIDC_TX_TTL_SECONDS: options.ttl })
      })
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

describe("AuthenticationService safe failures", () => {
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

  it.effect.each(["0", "-1", "1.5", "word", "601", "999999999999999999999999"])(
    "rejects invalid transaction TTL %s without echoing it",
    (ttl) =>
      withScenario(Effect.asVoid(AuthenticationService), { ttl }).pipe(
        Effect.result,
        Effect.map((result) => {
          expect(Result.isFailure(result)).toBe(true)
          if (Result.isFailure(result)) expect(String(result.failure)).not.toContain(ttl)
        })
      )
  )

  it.effect.each(["1", "600"])(
    "accepts transaction TTL boundary %s",
    (ttl) => withScenario(Effect.asVoid(AuthenticationService), { ttl })
  )

  it.effect("rejects malformed credential JSON at layer acquisition without echoing it", () => {
    const raw = "{controlled-invalid-secret-map"
    return withScenario(Effect.asVoid(AuthenticationService), { credentialMap: raw }).pipe(
      Effect.result,
      Effect.map((result) => {
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) expect(String(result.failure)).not.toContain(raw)
      })
    )
  })

  it.effect("rejects malformed callback configuration at layer acquisition", () =>
    withScenario(Effect.asVoid(AuthenticationService), { callbackOrigins: "not-json" }).pipe(
      Effect.result,
      Effect.map((result) => {
        expect(Result.isFailure(result)).toBe(true)
      })
    ))
})
