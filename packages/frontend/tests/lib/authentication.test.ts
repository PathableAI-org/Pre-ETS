import { describe, expect, it } from "@effect/vitest"
import { Cause, ConfigProvider, Effect, Exit, Fiber, FileSystem, Path, References, Result, Schema } from "effect"
import { TestClock } from "effect/testing"
import { generateKeyPairSync, type KeyObject, sign } from "node:crypto"
import { ClientClosedError, ClientOfflineError } from "redis"
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
  readonly issuers?: readonly string[]
  readonly redis?: ReturnType<typeof makeMemoryRedis>
  readonly secretRef?: string
  readonly ttl?: string
}

const tenantFile = (options: WorldOptions, issuer: string) =>
  JSON.stringify({
    displayName: "Alpha",
    oidc: options.clientAuth === "confidential" ?
      {
        clientAuth: "confidential",
        clientId: "alpha-client",
        clientSecretRef: options.secretRef ?? "alpha-secret",
        issuer
      } :
      {
        clientAuth: "public",
        clientId: "alpha-client",
        issuer
      }
  })

const withWorld = <A, E, R>(program: Effect.Effect<A, E, AuthenticationService | R>, options: WorldOptions = {}) => {
  const redis = options.redis ?? makeMemoryRedis()
  let tenantReads = 0
  return program.pipe(
    Effect.provide(makeAuthenticationTestHarness({ redis: redis.layer }).layer),
    Effect.provide(TenantConfigService.layer({
      env: "test",
      tenant: { baseHostname: "example.test", configDir: "/tenants", resolution: "host" }
    })),
    Effect.provide(FileSystem.layerNoop({
      readDirectory: () => Effect.succeed([]),
      readFileString: () => {
        const issuer = options.issuers?.[tenantReads] ?? options.issuer ?? "https://provider.test"
        tenantReads += 1
        return Effect.succeed(tenantFile(options, issuer))
      }
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

const metadata = (issuer = "https://provider.test", methods?: readonly string[]) =>
  Response.json({
    authorization_endpoint: `${issuer}/authorize`,
    id_token_signing_alg_values_supported: ["RS256"],
    issuer,
    jwks_uri: `${issuer}/jwks`,
    token_endpoint: `${issuer}/token`,
    ...(methods === undefined ? {} : { token_endpoint_auth_methods_supported: methods })
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

const requestUrl = (input: RequestInfo | URL): URL =>
  new URL(typeof input === "string" || input instanceof URL ? input : input.url)

const bodyText = (body: BodyInit | null | undefined): string => {
  if (typeof body === "string") return body
  if (body instanceof URLSearchParams) return body.toString()
  return ""
}

const authorizationText = (headers: HeadersInit | undefined): string => new Headers(headers).get("authorization") ?? ""

const confidentialSecret = "controlled-secret"

const confidentialOptions = {
  clientAuth: "confidential" as const,
  credentialMap: JSON.stringify({ "alpha-secret": confidentialSecret })
}

const confidentialProvider = (
  methods: readonly string[] | undefined,
  readNonce: () => string,
  onToken?: (request: { authorization: string; body: string }) => void,
  observed?: string[]
): typeof fetch =>
async (input, init) => {
  const url = requestUrl(input)
  observed?.push(url.href, bodyText(init?.body), authorizationText(init?.headers))
  if (url.pathname === "/token") {
    onToken?.({ authorization: authorizationText(init?.headers), body: bodyText(init?.body) })
  }
  if (url.pathname === "/.well-known/openid-configuration") return metadata("https://provider.test", methods)
  return completionTransport(readNonce)(input)
}

const expectConfidentialWire = (
  request: undefined | { authorization: string; body: string },
  wire: string,
  secret: string
) => {
  if (request === undefined) throw new Error("Missing token request")
  if (wire !== "basic") {
    expect(request.authorization).toBe("")
    expect(request.body).toContain(`client_secret=${secret}`)
    return
  }
  const decoded = Buffer.from(request.authorization.slice("Basic ".length), "base64").toString()
  const separator = decoded.indexOf(":")
  expect(decodeURIComponent(decoded.slice(0, separator))).toBe("alpha-client")
  expect(decodeURIComponent(decoded.slice(separator + 1))).toBe(secret)
  expect(request.body).not.toContain(secret)
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

  it.effect("accepts the explicit HTTPS default port and rejects the HTTP default port", () =>
    withFetch(
      () => Promise.resolve(metadata()),
      withWorld(Effect.gen(function*() {
        const explicitHttps = yield* prepare("alpha.example.test:443").pipe(Effect.result)
        expect(Result.isSuccess(explicitHttps)).toBe(true)
        const httpPort = yield* prepare("alpha.example.test:80").pipe(Effect.result)
        expect(Result.isFailure(httpPort)).toBe(true)
        if (Result.isFailure(httpPort)) expect(httpPort.failure).toBeInstanceOf(AuthenticationUnavailable)
      }))
    ))

  it.effect("matches HTTPS port 80 only when the callback origin uses that port", () =>
    withFetch(
      () => Promise.resolve(metadata()),
      withWorld(
        Effect.gen(function*() {
          const matched = yield* prepare("alpha.example.test:80").pipe(Effect.result)
          expect(Result.isSuccess(matched)).toBe(true)
          const omitted = yield* prepare("alpha.example.test").pipe(Effect.result)
          expect(Result.isFailure(omitted)).toBe(true)
          const httpsDefault = yield* prepare("alpha.example.test:443").pipe(Effect.result)
          expect(Result.isFailure(httpsDefault)).toBe(true)
        }),
        { callback: "https://alpha.example.test:80" }
      )
    ))

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

  it.effect.each([
    { label: "omitted supported methods", methods: undefined, wire: "basic" },
    { label: "advertised basic", methods: ["client_secret_basic"], wire: "basic" },
    { label: "advertised post", methods: ["client_secret_post"], wire: "post" },
    { label: "server-preferred post", methods: ["client_secret_post", "client_secret_basic"], wire: "post" }
  ])("exchanges a confidential code using $label", ({ methods, wire }) => {
    let nonce = ""
    const tokenRequests: { authorization: string; body: string }[] = []
    return withFetch(
      confidentialProvider(methods, () => nonce, (request) => {
        tokenRequests.push(request)
      }),
      withWorld(
        Effect.gen(function*() {
          const authentication = yield* AuthenticationService
          const prepared = yield* authentication.prepare({ host: "alpha.example.test" })
          expect(JSON.stringify(prepared)).not.toContain(confidentialSecret)
          const destination = new URL(prepared.destination)
          nonce = destination.searchParams.get("nonce") ?? ""
          const state = destination.searchParams.get("state") ?? ""
          const identity = yield* authentication.complete({
            correlation: prepared.correlation,
            host: "alpha.example.test",
            query: [["code", "controlled-code"], ["state", state]]
          })
          expect(identity.subject).toBe("subject-1")
          expect(JSON.stringify(identity)).not.toContain(confidentialSecret)
          expectConfidentialWire(tokenRequests[0], wire, confidentialSecret)
        }),
        confidentialOptions
      )
    )
  })

  it.effect("does not send a confidential secret when the provider supports neither secret method", () => {
    let nonce = ""
    const observed: string[] = []
    return withFetch(
      confidentialProvider(["private_key_jwt"], () => nonce, undefined, observed),
      withWorld(
        Effect.gen(function*() {
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
          expect(observed.join("\n")).not.toContain(confidentialSecret)
        }),
        confidentialOptions
      )
    )
  })
})

const hangingCompletion = (
  check: (
    fiber: Fiber.Fiber<unknown, CallbackExpectedFailure>,
    aborted: () => boolean
  ) => Effect.Effect<void>
) => {
  let hang = false
  let markStarted: () => void = () => undefined
  const started = new Promise<void>((resolve) => {
    markStarted = resolve
  })
  let aborted = false
  return withFetch(
    (_input, init) => {
      if (!hang) return Promise.resolve(metadata())
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true
          reject(new Error("controlled transport aborted"))
        }, { once: true })
        markStarted()
      })
    },
    withWorld(Effect.gen(function*() {
      const authentication = yield* AuthenticationService
      const prepared = yield* authentication.prepare({ host: "alpha.example.test" })
      const state = new URL(prepared.destination).searchParams.get("state") ?? ""
      hang = true
      const fiber = yield* Effect.forkChild(authentication.complete({
        correlation: prepared.correlation,
        host: "alpha.example.test",
        query: [["code", "controlled-code"], ["state", state]]
      }))
      yield* Effect.promise(() => started)
      yield* check(fiber, () => aborted)
    }))
  )
}

describe("AuthenticationService callback recovery", () => {
  it.effect("accepts an explicit HTTPS default port on completion and rejects port 80", () => {
    let nonce = ""
    return withFetch(
      completionTransport(() => nonce),
      withWorld(Effect.gen(function*() {
        const authentication = yield* AuthenticationService
        const prepared = yield* authentication.prepare({ host: "alpha.example.test:443" })
        const destination = new URL(prepared.destination)
        nonce = destination.searchParams.get("nonce") ?? ""
        const state = destination.searchParams.get("state") ?? ""
        expectCallbackFailure(
          yield* authentication.complete({
            correlation: prepared.correlation,
            host: "alpha.example.test:80",
            query: [["code", "premature"], ["state", state]]
          }).pipe(Effect.result),
          "preserve",
          AuthenticationDenied
        )
        const identity = yield* authentication.complete({
          correlation: prepared.correlation,
          host: "alpha.example.test:443",
          query: [["code", "controlled-code"], ["state", state]]
        })
        expect(identity.subject).toBe("subject-1")
      }))
    )
  })

  it.effect.each([
    { cause: () => new ClientOfflineError(), label: "offline" },
    { cause: () => new ClientClosedError(), label: "closed" }
  ])("preserves the attempt when Redis is $label before GETDEL", ({ cause }) => {
    const redis = makeMemoryRedis()
    let nonce = ""
    return withFetch(
      completionTransport(() => nonce),
      withWorld(
        Effect.gen(function*() {
          const authentication = yield* AuthenticationService
          const prepared = yield* authentication.prepare({ host: "alpha.example.test" })
          const destination = new URL(prepared.destination)
          nonce = destination.searchParams.get("nonce") ?? ""
          const state = destination.searchParams.get("state") ?? ""
          const input = {
            correlation: prepared.correlation,
            host: "alpha.example.test",
            query: [["code", "controlled-code"], ["state", state]] as const
          }
          redis.failNextConsume(cause())
          expectCallbackFailure(
            yield* authentication.complete(input).pipe(Effect.result),
            "preserve",
            AuthenticationUnavailable
          )
          const identity = yield* authentication.complete(input)
          expect(identity.subject).toBe("subject-1")
        }),
        { redis }
      )
    )
  })

  it.effect("clears correlation when a reread issuer is no longer permitted", () =>
    withFetch(
      () => Promise.resolve(metadata()),
      withWorld(
        Effect.gen(function*() {
          const authentication = yield* AuthenticationService
          const prepared = yield* authentication.prepare({ host: "alpha.example.test" })
          const state = new URL(prepared.destination).searchParams.get("state") ?? ""
          const input = {
            correlation: prepared.correlation,
            host: "alpha.example.test",
            query: [["code", "controlled-code"], ["state", state]] as const
          }
          expectCallbackFailure(
            yield* authentication.complete(input).pipe(Effect.result),
            "clear",
            AuthenticationUnavailable
          )
          expectCallbackFailure(
            yield* authentication.complete(input).pipe(Effect.result),
            "preserve",
            AuthenticationDenied
          )
        }),
        {
          issuers: [
            "https://provider.test",
            "http://changed.example",
            "https://provider.test"
          ]
        }
      )
    ))

  it.effect("cancels completion transport at five seconds and returns safe unavailability", () =>
    hangingCompletion((fiber, aborted) =>
      Effect.gen(function*() {
        yield* TestClock.adjust(4_999)
        expect(fiber.pollUnsafe()).toBeUndefined()
        expect(aborted()).toBe(false)
        yield* TestClock.adjust(1)
        const result = yield* Fiber.join(fiber).pipe(Effect.result)
        expectCallbackFailure(result, "clear", AuthenticationUnavailable)
        expect(aborted()).toBe(true)
      })
    ))

  it.effect("caller interruption cancels completion transport and remains interruption", () =>
    hangingCompletion((fiber, aborted) =>
      Effect.gen(function*() {
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) expect(Cause.hasInterrupts(exit.cause)).toBe(true)
        expect(aborted()).toBe(true)
      })
    ))
})
