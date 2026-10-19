import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, FileSystem, Path, References, Result, Schema } from "effect"
import { createHash } from "node:crypto"
import { vi } from "vitest"

import { AuthenticationService, AuthenticationUnavailable } from "../../src/lib/authentication.ts"
import { TenantConfigService } from "../../src/lib/tenant.ts"

const label = Schema.String.pipe(Schema.check(Schema.isPattern(/^[a-z]{1,12}$/)))

const withWorld = <A, E>(
  program: Effect.Effect<A, E, AuthenticationService>,
  options: {
    readonly alpha?: string
    readonly beta?: string
    readonly origins?: string
    readonly settings?: Readonly<Record<string, unknown>>
    readonly staticMode?: boolean
  } = {}
) => {
  const alpha = options.alpha ?? "alpha"
  const beta = options.beta ?? "beta"
  const files = new Map([
    [
      `/tenants/${alpha}.json`,
      JSON.stringify({
        displayName: "Alpha",
        oidc: { clientAuth: "public", clientId: `${alpha}-client`, issuer: `https://${alpha}.id.test` }
      })
    ],
    [
      `/tenants/${beta}.json`,
      JSON.stringify({
        displayName: "Beta",
        oidc: {
          clientAuth: "confidential",
          clientId: `${beta}-client`,
          clientSecretRef: "unused-secret-reference",
          connection: "opaque-unused-connection",
          issuer: `https://${beta}.id.test`
        }
      })
    ]
  ])
  return program.pipe(
    Effect.provide(AuthenticationService.layer),
    Effect.provide(TenantConfigService.layer({
      env: "test",
      tenant: options.staticMode ?
        { configDir: "/tenants", resolution: "static", staticAlias: alpha } :
        { baseHostname: "example.test", configDir: "/tenants", resolution: "host" }
    })),
    Effect.provide(FileSystem.layerNoop({
      readDirectory: () => Effect.succeed([]),
      readFileString: (path) => Effect.succeed(files.get(path) ?? "invalid tenant document")
    })),
    Effect.provide(Path.layer),
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({
        OIDC_CALLBACK_ORIGINS_JSON: options.origins ?? JSON.stringify({
          [alpha]: `https://${alpha}.app.test`,
          [beta]: `https://${beta}.app.test`
        }),
        ...options.settings
      })
    ),
    Effect.provideService(References.MinimumLogLevel, "Error")
  )
}

const withControlledProvider = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  Effect.scoped(Effect.gen(function*() {
    const fetchSpy = yield* Effect.acquireRelease(
      Effect.sync(() =>
        vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
          const discovery = new URL(input instanceof Request ? input.url : input)
          const issuer = discovery.origin
          return Promise.resolve(Response.json({
            authorization_endpoint: `${issuer}/authorize`,
            issuer,
            jwks_uri: `${issuer}/jwks`,
            token_endpoint: `${issuer}/token`
          }))
        })
      ),
      (spy) =>
        Effect.sync(() => {
          spy.mockRestore()
        })
    )
    let sequence = 0
    const randomSpy = yield* Effect.acquireRelease(
      Effect.sync(() =>
        vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => {
          sequence += 1
          if (array !== null) new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(sequence)
          return array
        })
      ),
      (spy) =>
        Effect.sync(() => {
          spy.mockRestore()
        })
    )
    const result = yield* program
    expect(fetchSpy).toHaveBeenCalled()
    expect(randomSpy).toHaveBeenCalled()
    return result
  }))

const prepare = Effect.fnUntraced(function*(host: string) {
  const service = yield* AuthenticationService
  return new URL(yield* service.prepare({ host }))
})

const expectProtocol = (destination: URL, alias: string) => {
  expect(destination.origin).toBe(`https://${alias}.id.test`)
  expect(destination.pathname).toBe("/authorize")
  expect(destination.searchParams.get("client_id")).toBe(`${alias}-client`)
  expect(destination.searchParams.get("redirect_uri")).toBe(`https://${alias}.app.test/auth/callback`)
  expect(destination.searchParams.get("response_type")).toBe("code")
  expect(destination.searchParams.get("scope")).toBe("openid")
  expect(destination.searchParams.get("max_age")).toBe("0")
  expect(destination.searchParams.get("code_challenge_method")).toBe("S256")
  expect(destination.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(destination.searchParams.get("nonce")).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(destination.searchParams.has("code_verifier")).toBe(false)
  expect(destination.searchParams.has("connection")).toBe(false)
  expect(destination.searchParams.has("client_secret")).toBe(false)
}

describe("AuthenticationService preparation", () => {
  it.effect.prop("preserves independently selected A/B/A client, issuer and callback", [label, label], ([a, b]) => {
    const alpha = `alpha-${a}`
    const beta = `beta-${b}`
    return withControlledProvider(withWorld(
      Effect.gen(function*() {
        const destinations = yield* Effect.forEach([alpha, beta, alpha], (alias) => prepare(`${alias}.example.test`))
        destinations.forEach((destination, index) => {
          expectProtocol(destination, index === 1 ? beta : alpha)
          const firstRandomByte = 1 + index * 3
          const verifier = Buffer.alloc(32, firstRandomByte).toString("base64url")
          expect(destination.searchParams.get("code_challenge")).toBe(
            createHash("sha256").update(verifier).digest("base64url")
          )
          expect(destination.searchParams.get("nonce")).toBe(
            Buffer.alloc(32, firstRandomByte + 1).toString("base64url")
          )
          expect(destination.searchParams.get("state")).toBe(
            Buffer.alloc(32, firstRandomByte + 2).toString("base64url")
          )
        })
      }),
      { alpha, beta }
    ))
  })

  it.effect.prop(
    "keeps static callback authority independent of arbitrary Host",
    [Schema.String],
    ([host]) =>
      withControlledProvider(withWorld(
        Effect.gen(function*() {
          expectProtocol(yield* prepare(host), "alpha")
        }),
        { staticMode: true }
      ))
  )

  it.effect.prop("accepts configured HTTPS origins and preserves canonical callback ports", [
    label,
    Schema.Int.pipe(Schema.check(Schema.isBetween({ maximum: 65535, minimum: 1024 })))
  ], ([tenant, port]) =>
    withControlledProvider(withWorld(
      Effect.gen(function*() {
        const destination = yield* prepare(`${tenant}.example.test`)
        expect(destination.searchParams.get("redirect_uri")).toBe(
          `https://${tenant}.public.test:${String(port)}/auth/callback`
        )
      }),
      { alpha: tenant, origins: JSON.stringify({ [tenant]: `https://${tenant}.public.test:${String(port)}` }) }
    )))

  it.effect.each([
    { label: "malformed JSON", origins: "{" },
    { label: "array map", origins: "[]" },
    { label: "null map", origins: "null" },
    { label: "numeric origin", origins: "{\"alpha\":42}" },
    { label: "credentials", origins: "{\"alpha\":\"https://user:pass@app.test\"}" },
    { label: "non-root path", origins: "{\"alpha\":\"https://app.test/path\"}" },
    { label: "query", origins: "{\"alpha\":\"https://app.test?return=evil\"}" },
    { label: "fragment", origins: "{\"alpha\":\"https://app.test#fragment\"}" },
    { label: "empty query", origins: "{\"alpha\":\"https://app.test?\"}" },
    { label: "empty fragment", origins: "{\"alpha\":\"https://app.test#\"}" },
    { label: "external HTTP", origins: "{\"alpha\":\"http://app.test\"}" },
    { label: "invalid boolean", settings: { OIDC_ALLOW_INSECURE_LOOPBACK: "sometimes" } }
  ])("rejects explicit process settings at Layer construction: $label", (options) =>
    Effect.gen(function*() {
      const result = yield* withWorld(Effect.asVoid(AuthenticationService), options).pipe(Effect.result)
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) expect(result.failure._tag).toBe("ConfigError")
    }))

  it.effect("default empty callback map is request-time unavailability", () =>
    Effect.gen(function*() {
      const result = yield* withWorld(prepare("alpha.example.test"), {
        settings: { OIDC_CALLBACK_ORIGINS_JSON: undefined }
      }).pipe(Effect.result)
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(AuthenticationUnavailable)
    }))
})
