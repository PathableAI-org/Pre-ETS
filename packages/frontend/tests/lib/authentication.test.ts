import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, FileSystem, Path, References, Result, Schema } from "effect"
import { TestClock } from "effect/testing"
import { generateKeyPairSync, type KeyObject, sign } from "node:crypto"
import { vi } from "vitest"

import {
  AuthenticationDenied,
  AuthenticationService,
  AuthenticationUnavailable,
  CallbackExpectedFailure,
  makeAuthenticationTestHarness
} from "../../src/lib/authentication.ts"
import { HttpError } from "../../src/lib/error.ts"
import { TenantConfigService } from "../../src/lib/tenant.ts"
import { makeMemoryRedis } from "../helpers/authentication.ts"

interface WorldOptions {
  readonly callback?: string
  readonly clientAuth?: "confidential" | "public"
  readonly credentialMap?: string
  readonly issuer?: string
  readonly secretRef?: string
  readonly ttl?: string
}

const tenantFile = (options: WorldOptions) =>
  JSON.stringify({
    displayName: "Alpha",
    oidc: options.clientAuth === "confidential" ?
      {
        clientAuth: "confidential",
        clientId: "alpha-client",
        clientSecretRef: options.secretRef ?? "alpha-secret",
        issuer: options.issuer ?? "https://provider.test"
      } :
      {
        clientAuth: "public",
        clientId: "alpha-client",
        issuer: options.issuer ?? "https://provider.test"
      }
  })

const withWorld = <A, E, R>(program: Effect.Effect<A, E, AuthenticationService | R>, options: WorldOptions = {}) => {
  const redis = makeMemoryRedis()
  return program.pipe(
    Effect.provide(makeAuthenticationTestHarness({ redis: redis.layer }).layer),
    Effect.provide(TenantConfigService.layer({
      env: "test",
      tenant: { baseHostname: "example.test", configDir: "/tenants", resolution: "host" }
    })),
    Effect.provide(FileSystem.layerNoop({
      readDirectory: () => Effect.succeed([]),
      readFileString: () => Effect.succeed(tenantFile(options))
    })),
    Effect.provide(Path.layer),
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({
        OIDC_ALLOW_INSECURE_LOOPBACK: "false",
        OIDC_CALLBACK_ORIGINS_JSON: JSON.stringify({
          alpha: options.callback ?? "https://alpha.example.test"
        }),
        OIDC_CLIENT_SECRETS_JSON: options.credentialMap ?? "{}",
        OIDC_TX_KEY_PREFIX: "test:authentication",
        ...(options.ttl === undefined ? {} : { OIDC_TX_TTL_SECONDS: options.ttl })
      })
    ),
    Effect.provideService(References.MinimumLogLevel, "Error")
  )
}

const metadata = (issuer = "https://provider.test") =>
  Response.json({
    authorization_endpoint: `${issuer}/authorize`,
    id_token_signing_alg_values_supported: ["RS256"],
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

const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 })
const publicJwk = {
  ...keyPair.publicKey.export({ format: "jwk" }),
  alg: "RS256",
  kid: "test-signing-key",
  use: "sig"
}

const encoded = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url")

const idToken = (
  nonce: string,
  claims: Readonly<Record<string, unknown>> = {},
  signingKey: KeyObject = keyPair.privateKey
): string => {
  const header = encoded({ alg: "RS256", kid: "test-signing-key", typ: "JWT" })
  const payload = encoded({
    aud: "alpha-client",
    auth_time: 1_700_000_000,
    exp: Math.floor(Date.now() / 1_000) + 300,
    iat: Math.floor(Date.now() / 1_000),
    iss: "https://provider.test",
    nonce,
    sub: "subject-1",
    ...claims
  })
  const input = `${header}.${payload}`
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), signingKey).toString("base64url")}`
}

const invalidSigningKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey

const completionTransport = (
  readNonce: () => string,
  claims: Readonly<Record<string, unknown>> = {},
  signingKey?: KeyObject
) =>
(input: globalThis.Request | string | URL): Promise<Response> => {
  const url = new URL(input instanceof Request ? input.url : input.toString())
  switch (url.pathname) {
    case "/.well-known/openid-configuration":
      return Promise.resolve(metadata())
    case "/jwks":
      return Promise.resolve(Response.json({ keys: [publicJwk] }))
    case "/token":
      return Promise.resolve(Response.json({
        access_token: "controlled-access-token",
        id_token: idToken(readNonce(), claims, signingKey),
        token_type: "Bearer"
      }))
    default:
      return Promise.reject(new Error(`Unexpected provider URL: ${url.href}`))
  }
}

const expectCallbackFailure = (
  result: Result.Result<unknown, unknown>,
  disposition: "clear" | "preserve",
  reason: typeof AuthenticationDenied | typeof AuthenticationUnavailable
) => {
  expect(Result.isFailure(result)).toBe(true)
  if (!Result.isFailure(result)) return
  expect(result.failure).toBeInstanceOf(CallbackExpectedFailure)
  if (result.failure instanceof CallbackExpectedFailure) {
    expect(result.failure.correlationDisposition).toBe(disposition)
    expect(result.failure.reason).toBeInstanceOf(reason)
  }
}

const prepare = (host = "alpha.example.test") =>
  Effect.gen(function*() {
    const authentication = yield* AuthenticationService
    return yield* authentication.prepare({ host })
  })

describe("AuthenticationService preparation", () => {
  it.effect("persists before returning only the public preparation fields", () =>
    withFetch(
      () => Promise.resolve(metadata()),
      withWorld(Effect.gen(function*() {
        const prepared = yield* prepare()
        expect(Object.keys(prepared).sort()).toEqual(["correlation", "destination", "expiresAt"])
        expect(prepared.correlation).toMatch(/^[A-Za-z0-9_-]{43}$/)
        expect(prepared.expiresAt).toBe(600_000)

        const destination = new URL(prepared.destination)
        expect(destination.origin).toBe("https://provider.test")
        expect(destination.searchParams.get("client_id")).toBe("alpha-client")
        expect(destination.searchParams.get("redirect_uri")).toBe("https://alpha.example.test/auth/callback")
        expect(destination.searchParams.get("response_type")).toBe("code")
        expect(destination.searchParams.get("scope")).toBe("openid")
        expect(destination.searchParams.get("code_challenge_method")).toBe("S256")
        expect(destination.searchParams.get("max_age")).toBe("0")
        expect(destination.searchParams.get("state")).not.toBe(prepared.correlation)
      }))
    ))

  it.effect.prop("generates opaque 32-byte unpadded base64url correlations", [Schema.Int], () =>
    withFetch(
      () => Promise.resolve(metadata()),
      withWorld(Effect.gen(function*() {
        const first = yield* prepare()
        const second = yield* prepare()
        expect(Buffer.from(first.correlation, "base64url")).toHaveLength(32)
        expect(Buffer.from(second.correlation, "base64url")).toHaveLength(32)
        expect(first.correlation).not.toBe(second.correlation)
      }))
    ))

  it.effect("rejects an initiation authority mismatch before provider delegation", () => {
    let fetches = 0
    return withFetch(
      () => {
        fetches += 1
        return Promise.resolve(metadata())
      },
      withWorld(Effect.gen(function*() {
        const result = yield* prepare("alpha.example.test:444").pipe(Effect.result)
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(AuthenticationUnavailable)
        expect(fetches).toBe(0)
      }))
    )
  })

  it.effect("keeps tenant selection failures distinct", () =>
    withFetch(
      () => Promise.reject(new Error("provider must not be reached")),
      withWorld(Effect.gen(function*() {
        const result = yield* prepare("unbound.test").pipe(Effect.result)
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toBeInstanceOf(HttpError)
          expect(result.failure).toMatchObject({ status: 404 })
        }
      }))
    ))

  it.effect("allows a public client without a credential map", () =>
    withFetch(
      () => Promise.resolve(metadata()),
      withWorld(Effect.asVoid(prepare()))
    ))

  it.effect("fails only the confidential request when its selected secret is absent", () =>
    withFetch(
      () => Promise.resolve(metadata()),
      withWorld(
        Effect.gen(function*() {
          const result = yield* prepare().pipe(Effect.result)
          expect(Result.isFailure(result)).toBe(true)
          if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(AuthenticationUnavailable)
        }),
        { clientAuth: "confidential" }
      )
    ))

  it.effect("uses a resolved confidential credential without exposing it", () =>
    withFetch(
      () => Promise.resolve(metadata()),
      withWorld(
        Effect.gen(function*() {
          const prepared = yield* prepare()
          expect(JSON.stringify(prepared)).not.toContain("controlled-secret")
          expect(prepared.destination).not.toContain("controlled-secret")
        }),
        {
          clientAuth: "confidential",
          credentialMap: JSON.stringify({ "alpha-secret": "controlled-secret" })
        }
      )
    ))
})

describe("AuthenticationService completion", () => {
  it.effect("returns the provider-neutral trusted identity once", () => {
    let nonce = ""
    return withFetch(
      completionTransport(() => nonce),
      withWorld(Effect.gen(function*() {
        const authentication = yield* AuthenticationService
        const prepared = yield* authentication.prepare({ host: "alpha.example.test" })
        const destination = new URL(prepared.destination)
        nonce = destination.searchParams.get("nonce") ?? ""
        const state = destination.searchParams.get("state") ?? ""

        const identity = yield* authentication.complete({
          correlation: prepared.correlation,
          host: "alpha.example.test",
          query: [["code", "controlled-code"], ["state", state]]
        })
        expect(identity).toEqual({
          authenticatedAt: 1_700_000_000,
          issuer: "https://provider.test/",
          subject: "subject-1",
          tenantAlias: "alpha"
        })

        expectCallbackFailure(
          yield* authentication.complete({
            correlation: prepared.correlation,
            host: "alpha.example.test",
            query: [["code", "controlled-code"], ["state", state]]
          }).pipe(Effect.result),
          "preserve",
          AuthenticationDenied
        )
        expectCallbackFailure(
          yield* authentication.complete({
            correlation: prepared.correlation,
            host: "alpha.example.test",
            query: [["code", "mixed"], ["error", "access_denied"], ["state", state]]
          }).pipe(Effect.result),
          "preserve",
          AuthenticationDenied
        )
      }))
    )
  })

  it.effect("preserves the valid attempt after wrong state and malformed callback input", () => {
    let nonce = ""
    return withFetch(
      completionTransport(() => nonce),
      withWorld(Effect.gen(function*() {
        const authentication = yield* AuthenticationService
        const prepared = yield* authentication.prepare({ host: "alpha.example.test" })
        const destination = new URL(prepared.destination)
        nonce = destination.searchParams.get("nonce") ?? ""
        const state = destination.searchParams.get("state") ?? ""

        const prematureCallbacks = [
          {
            correlation: prepared.correlation,
            host: "alpha.example.test",
            query: [["code", "premature"], ["state", "wrong-state"]]
          },
          {
            correlation: prepared.correlation,
            host: "alpha.example.test",
            query: [["code", "duplicate"], ["state", state], ["state", state]]
          },
          {
            correlation: "invalid-correlation",
            host: "alpha.example.test",
            query: [["code", "premature"], ["state", state]]
          },
          {
            correlation: prepared.correlation,
            host: "alpha.example.test:444",
            query: [["code", "premature"], ["state", state]]
          },
          {
            correlation: prepared.correlation,
            host: "beta.example.test",
            query: [["code", "premature"], ["state", state]]
          },
          {
            correlation: prepared.correlation,
            host: "alpha.example.test",
            query: [["code", "premature"]]
          }
        ] as const
        for (const input of prematureCallbacks) {
          expectCallbackFailure(
            yield* authentication.complete(input).pipe(Effect.result),
            "preserve",
            AuthenticationDenied
          )
        }

        const identity = yield* authentication.complete({
          correlation: prepared.correlation,
          host: "alpha.example.test",
          query: [["code", "controlled-code"], ["state", state]]
        })
        expect(identity.subject).toBe("subject-1")
      }))
    )
  })

  it.effect("burns a matched provider denial and clears correlation", () =>
    withFetch(
      () => Promise.resolve(metadata()),
      withWorld(Effect.gen(function*() {
        const authentication = yield* AuthenticationService
        const prepared = yield* authentication.prepare({ host: "alpha.example.test" })
        const state = new URL(prepared.destination).searchParams.get("state") ?? ""
        expectCallbackFailure(
          yield* authentication.complete({
            correlation: prepared.correlation,
            host: "alpha.example.test",
            query: [["error", "access_denied"], ["state", state]]
          }).pipe(Effect.result),
          "clear",
          AuthenticationDenied
        )
        expectCallbackFailure(
          yield* authentication.complete({
            correlation: prepared.correlation,
            host: "alpha.example.test",
            query: [["code", "later"], ["state", state]]
          }).pipe(Effect.result),
          "preserve",
          AuthenticationDenied
        )
      }))
    ))

  it.effect("consumes and denies an explicitly expired attempt", () =>
    withFetch(
      () => Promise.resolve(metadata()),
      withWorld(Effect.gen(function*() {
        const authentication = yield* AuthenticationService
        const prepared = yield* authentication.prepare({ host: "alpha.example.test" })
        const state = new URL(prepared.destination).searchParams.get("state") ?? ""
        yield* TestClock.adjust("601 seconds")
        expectCallbackFailure(
          yield* authentication.complete({
            correlation: prepared.correlation,
            host: "alpha.example.test",
            query: [["code", "late"], ["state", state]]
          }).pipe(Effect.result),
          "clear",
          AuthenticationDenied
        )
      }))
    ))

  it.effect("burns the attempt when code exchange fails", () => {
    return withFetch(
      (input) => {
        const url = new URL(input instanceof Request ? input.url : input.toString())
        return Promise.resolve(url.pathname === "/token" ? new Response("upstream", { status: 503 }) : metadata())
      },
      withWorld(Effect.gen(function*() {
        const authentication = yield* AuthenticationService
        const prepared = yield* authentication.prepare({ host: "alpha.example.test" })
        const destination = new URL(prepared.destination)
        const state = destination.searchParams.get("state") ?? ""
        expectCallbackFailure(
          yield* authentication.complete({
            correlation: prepared.correlation,
            host: "alpha.example.test",
            query: [["code", "rejected-code"], ["state", state]]
          }).pipe(Effect.result),
          "clear",
          AuthenticationUnavailable
        )
      }))
    )
  })

  it.effect.each([
    { claims: { auth_time: undefined }, label: "missing auth_time" },
    { claims: { auth_time: "not-an-integer" }, label: "non-integer auth_time" },
    { claims: { sub: "" }, label: "empty subject" },
    { claims: { nonce: "wrong-nonce" }, label: "nonce mismatch" },
    { claims: { aud: "other-client" }, label: "audience mismatch" },
    { claims: { iss: "https://other.test/" }, label: "issuer mismatch" },
    { claims: {}, invalidSignature: true, label: "invalid signature" }
  ])("denies $label after consumption", ({ claims, invalidSignature }) => {
    let nonce = ""
    return withFetch(
      completionTransport(() => nonce, claims, invalidSignature ? invalidSigningKey : undefined),
      withWorld(Effect.gen(function*() {
        const authentication = yield* AuthenticationService
        const prepared = yield* authentication.prepare({ host: "alpha.example.test" })
        const destination = new URL(prepared.destination)
        nonce = destination.searchParams.get("nonce") ?? ""
        const state = destination.searchParams.get("state") ?? ""
        expectCallbackFailure(
          yield* authentication.complete({
            correlation: prepared.correlation,
            host: "alpha.example.test",
            query: [["code", "controlled-code"], ["state", state]]
          }).pipe(Effect.result),
          "clear",
          AuthenticationUnavailable
        )
      }))
    )
  })
})
