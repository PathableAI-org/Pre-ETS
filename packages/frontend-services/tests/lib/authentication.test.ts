import { describe, expect, it } from "@effect/vitest"
import { Cause, Effect, Exit, Fiber, FileSystem, Layer, Path, References, Result, Schema } from "effect"
import { TestClock } from "effect/testing"
import { generateKeyPairSync, type KeyObject, sign } from "node:crypto"
import { ClientClosedError, ClientOfflineError } from "redis"
import { vi } from "vitest"

import {
  AuthenticationDenied,
  AuthenticationNotFresh,
  AuthenticationService,
  AuthenticationUnavailable,
  CallbackExpectedFailure
} from "../../src/authentication.ts"
import { TenantConfigService } from "../../src/tenant.ts"
import { authenticationSettings, makeMemoryRedis } from "../helpers/authentication.ts"

/** Optional tenant fields beyond the OIDC client; JSON omits an undefined value, so absent settings stay absent. */
interface TenantSettings {
  readonly connection?: string | undefined
  readonly displayName?: string | undefined
  readonly idleTimeoutMinutes?: number | undefined
  readonly warningLeadMinutes?: number | undefined
}

interface WorldOptions {
  readonly callback?: string | undefined
  readonly clientAuth?: "confidential" | "public" | undefined
  readonly clientSecrets?: Readonly<Record<string, string>> | undefined
  readonly issuer?: string | undefined
  readonly issuers?: readonly string[] | undefined
  readonly redis?: ReturnType<typeof makeMemoryRedis> | undefined
  readonly secretRef?: string | undefined
  readonly tenantSettings?: TenantSettings | undefined
}

const tenantFile = (options: WorldOptions, issuer: string) =>
  JSON.stringify({
    displayName: options.tenantSettings?.displayName ?? "Alpha",
    idleTimeoutMinutes: options.tenantSettings?.idleTimeoutMinutes,
    oidc: options.clientAuth === "confidential" ?
      {
        clientAuth: "confidential",
        clientId: "alpha-client",
        clientSecretRef: options.secretRef ?? "alpha-secret",
        connection: options.tenantSettings?.connection,
        issuer
      } :
      {
        clientAuth: "public",
        clientId: "alpha-client",
        connection: options.tenantSettings?.connection,
        issuer
      },
    warningLeadMinutes: options.tenantSettings?.warningLeadMinutes
  })

const withWorld = <A, E, R>(program: Effect.Effect<A, E, AuthenticationService | R>, options: WorldOptions = {}) => {
  const redis = options.redis ?? makeMemoryRedis()
  let tenantReads = 0
  return program.pipe(
    Effect.provide(
      AuthenticationService.layer(authenticationSettings({
        callback: options.callback,
        clientSecrets: options.clientSecrets
      })).pipe(
        Layer.provide(redis.layer),
        Layer.provide(
          TenantConfigService.layer({ baseHostname: "example.test", configDir: "/tenants", resolution: "host" })
        ),
        Layer.provide(FileSystem.layerNoop({
          readDirectory: () => Effect.succeed([]),
          readFileString: () => {
            const issuer = options.issuers?.[tenantReads] ?? options.issuer ?? "https://provider.test"
            tenantReads += 1
            return Effect.succeed(tenantFile(options, issuer))
          }
        })),
        Layer.provide(Path.layer)
      )
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
    // JSON omits an undefined value, so absent methods stay absent from the document.
    token_endpoint_auth_methods_supported: methods
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
    // The test clock starts at the epoch, so an authentication at time zero is fresh for an attempt made then.
    auth_time: 0,
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

const completionTransport =
  (
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
  clientSecrets: { "alpha-secret": confidentialSecret }
}

const confidentialProvider =
  (
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
  reason: typeof AuthenticationDenied | typeof AuthenticationNotFresh | typeof AuthenticationUnavailable
) => {
  expect(Result.isFailure(result)).toBe(true)
  if (!Result.isFailure(result)) return
  expect(result.failure).toBeInstanceOf(CallbackExpectedFailure)
  if (Schema.is(CallbackExpectedFailure)(result.failure)) {
    expect(result.failure.correlationDisposition).toBe(disposition)
    expect(result.failure.reason).toBeInstanceOf(reason)
  }
}

const prepare = (host = "alpha.example.test") =>
  Effect.gen(function*() {
    const authentication = yield* AuthenticationService
    return yield* authentication.prepare({ host })
  })

describe("AuthenticationService preparation [PREETS-SESSION-002, PREETS-SESSION-013, PREETS-SECURITY-001]", () => {
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

  it.effect("retries a correlation collision with a fresh attempt", () => {
    const redis = makeMemoryRedis()
    redis.collideNextCreates(1)
    return withFetch(
      () => Promise.resolve(metadata()),
      withWorld(
        Effect.gen(function*() {
          const prepared = yield* prepare()
          expect(redis.commands.filter((command) => command === "SET")).toHaveLength(2)
          expect(redis.entries.size).toBe(1)
          expect(prepared.correlation).toMatch(/^[A-Za-z0-9_-]{43}$/)
        }),
        { redis }
      )
    )
  })

  it.effect("returns unavailability after three correlation collisions", () => {
    const redis = makeMemoryRedis()
    redis.collideNextCreates(3)
    return withFetch(
      () => Promise.resolve(metadata()),
      withWorld(
        Effect.gen(function*() {
          const result = yield* prepare().pipe(Effect.result)
          expect(Result.isFailure(result)).toBe(true)
          if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(AuthenticationUnavailable)
          expect(redis.commands.filter((command) => command === "SET")).toHaveLength(3)
          expect(redis.entries.size).toBe(0)
        }),
        { redis }
      )
    )
  })

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
          expect(result.failure).toMatchObject({ _tag: "TenantNotFound" })
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
          clientSecrets: { "alpha-secret": "controlled-secret" }
        }
      )
    ))
})

describe("AuthenticationService completion [PREETS-SESSION-002]", () => {
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
          },
          ...([
            [["code", "premature"], ["error", "access_denied"], ["state", state]],
            [["code", "premature"], ["error_description", "denied"], ["state", state]],
            [["error_uri", "https://provider.test/e"], ["state", state]],
            [["code", " "], ["state", state]],
            [["code", "premature"], ["iss", "a"], ["iss", "a"], ["state", state]]
          ] as const).map((query) => ({
            correlation: prepared.correlation,
            host: "alpha.example.test",
            query
          }))
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
          query: [["code", "controlled-code"], ["session_state", "ignored"], ["session_state", ""], ["state", state]]
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

describe("AuthenticationService callback recovery [PREETS-SESSION-002]", () => {
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
          query: [["code", "controlled-code"], ["session_state", "ignored"], ["session_state", ""], ["state", state]]
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

describe("AuthenticationService provider discovery reuse", () => {
  /** Answers discovery for whichever issuer is asked and records each discovery request. */
  const countingDiscovery = (discovered: string[], failFirst = false): typeof fetch => (input) => {
    const url = requestUrl(input)
    if (url.pathname !== "/.well-known/openid-configuration") {
      return Promise.reject(new Error(`Unexpected provider URL: ${url.href}`))
    }
    discovered.push(url.origin)
    if (failFirst && discovered.length === 1) return Promise.resolve(new Response("upstream", { status: 503 }))
    return Promise.resolve(metadata(url.origin))
  }

  it.effect("discovers once across repeated preparations and again after five minutes", () => {
    const discovered: string[] = []
    return withFetch(
      countingDiscovery(discovered),
      withWorld(Effect.gen(function*() {
        yield* prepare()
        yield* prepare()
        yield* TestClock.adjust("4 minutes")
        yield* prepare()
        expect(discovered).toEqual(["https://provider.test"])

        yield* TestClock.adjust("1 minute")
        const prepared = yield* prepare()
        yield* prepare()
        expect(discovered).toEqual(["https://provider.test", "https://provider.test"])
        expect(new URL(prepared.destination).origin).toBe("https://provider.test")
      }))
    )
  })

  it.effect("uses the changed issuer's metadata on the next preparation", () => {
    const discovered: string[] = []
    return withFetch(
      countingDiscovery(discovered),
      withWorld(
        Effect.gen(function*() {
          const before = yield* prepare()
          const after = yield* prepare()
          expect(new URL(before.destination).origin).toBe("https://provider.test")
          expect(new URL(after.destination).origin).toBe("https://changed.test")
          expect(discovered).toEqual(["https://provider.test", "https://changed.test"])
        }),
        { issuers: ["https://provider.test", "https://changed.test"] }
      )
    )
  })

  it.effect("does not reuse a failed discovery", () => {
    const discovered: string[] = []
    return withFetch(
      countingDiscovery(discovered, true),
      withWorld(Effect.gen(function*() {
        const failed = yield* prepare().pipe(Effect.result)
        expect(Result.isFailure(failed) && failed.failure).toBeInstanceOf(AuthenticationUnavailable)
        const prepared = yield* prepare()
        expect(new URL(prepared.destination).origin).toBe("https://provider.test")
        expect(discovered).toEqual(["https://provider.test", "https://provider.test"])
      }))
    )
  })
})

/** An arbitrary, plausible epoch instant in milliseconds for the transaction start. */
const BASE_TIME = 1_700_000_000_000

interface FreshnessCase {
  /** `auth_time` in seconds, or undefined to omit the claim. */
  readonly authTime: number | undefined
  /** Milliseconds between `prepare` and the callback. */
  readonly delayMs: number
  readonly extraClaims?: Readonly<Record<string, unknown>> | undefined
  readonly startedAtMs: number
  readonly world?: undefined | WorldOptions
}

const freshnessClaims = (input: FreshnessCase): Readonly<Record<string, unknown>> => ({
  ...input.extraClaims,
  auth_time: input.authTime
})

/** Prepares at `startedAtMs`, returns at `startedAtMs + delayMs`, and completes with the controlled `auth_time`. */
const completeWithFreshness = (input: FreshnessCase) => {
  let nonce = ""
  return withFetch(
    completionTransport(() => nonce, freshnessClaims(input)),
    withWorld(
      Effect.gen(function*() {
        const authentication = yield* AuthenticationService
        yield* TestClock.setTime(input.startedAtMs)
        const prepared = yield* authentication.prepare({ host: "alpha.example.test" })
        const destination = new URL(prepared.destination)
        nonce = destination.searchParams.get("nonce") ?? ""
        const query: readonly (readonly [string, string])[] = [
          ["code", "controlled-code"],
          ["state", destination.searchParams.get("state") ?? ""]
        ]
        yield* TestClock.adjust(input.delayMs)
        const callback = { correlation: prepared.correlation, host: "alpha.example.test", query }
        const result = yield* authentication.complete(callback).pipe(Effect.result)
        const replay = yield* authentication.complete(callback).pipe(Effect.result)
        const retry = yield* authentication.prepare({ host: "alpha.example.test" }).pipe(Effect.result)
        return { replay, result, retry }
      }),
      input.world
    )
  )
}

const expectNotFresh = (
  outcome: Effect.Success<ReturnType<typeof completeWithFreshness>>,
  evidence: "missing" | "stale"
) => {
  expectCallbackFailure(outcome.result, "clear", AuthenticationNotFresh)
  if (Result.isFailure(outcome.result) && Schema.is(CallbackExpectedFailure)(outcome.result.failure)) {
    expect(outcome.result.failure.reason).toEqual(new AuthenticationNotFresh({ evidence }))
  }
  // The transaction was consumed: the same return is now an unknown attempt, and a new login can begin.
  expectCallbackFailure(outcome.replay, "preserve", AuthenticationDenied)
  expect(Result.isSuccess(outcome.retry)).toBe(true)
}

const TOLERANCE_MS = 30_000
const DELAY_MS = 120_000
const startSeconds = BASE_TIME / 1_000
const callbackSeconds = (BASE_TIME + DELAY_MS) / 1_000

describe("AuthenticationService freshness confirmation [PREETS-SESSION-013]", () => {
  it.effect.each([
    { authTime: startSeconds - TOLERANCE_MS / 1_000, label: "exactly at the transaction start minus the tolerance" },
    { authTime: startSeconds + 60, label: "between the transaction start and the callback" },
    { authTime: callbackSeconds + TOLERANCE_MS / 1_000, label: "exactly at the callback time plus the tolerance" }
  ])("confirms an authentication time $label", ({ authTime }) =>
    Effect.gen(function*() {
      const outcome = yield* completeWithFreshness({ authTime, delayMs: DELAY_MS, startedAtMs: BASE_TIME })
      expect(Result.isSuccess(outcome.result)).toBe(true)
      if (Result.isSuccess(outcome.result)) {
        expect(outcome.result.success).toEqual({
          issuer: "https://provider.test/",
          subject: "subject-1",
          tenantAlias: "alpha"
        })
      }
    }))

  it.effect.each([
    { authTime: startSeconds - TOLERANCE_MS / 1_000 - 1, label: "one second before the lower bound" },
    { authTime: callbackSeconds + TOLERANCE_MS / 1_000 + 1, label: "one second after the upper bound" },
    { authTime: callbackSeconds + 86_400, label: "a day in the future" },
    { authTime: startSeconds - 86_400, label: "a day before the transaction" }
  ])("denies $label as stale after consuming the transaction", ({ authTime }) =>
    Effect.gen(function*() {
      expectNotFresh(yield* completeWithFreshness({ authTime, delayMs: DELAY_MS, startedAtMs: BASE_TIME }), "stale")
    }))

  it.effect("denies a missing authentication time as missing evidence after consuming the transaction", () =>
    Effect.gen(function*() {
      expectNotFresh(
        yield* completeWithFreshness({ authTime: undefined, delayMs: DELAY_MS, startedAtMs: BASE_TIME }),
        "missing"
      )
    }))

  it.effect("does not measure the window from the callback time alone", () =>
    Effect.gen(function*() {
      // Within the attempt lifetime before the callback, so a window counted back from the callback would admit it,
      // but a minute before the transaction began.
      const outcome = yield* completeWithFreshness({
        authTime: startSeconds - 60,
        delayMs: 9 * 60_000,
        startedAtMs: BASE_TIME
      })
      expectNotFresh(outcome, "stale")
    }))

  const Start = Schema.Int.pipe(
    Schema.check(Schema.isBetween({ maximum: 2_000_000_000_000, minimum: 1_000_000_000_000 }))
  )
  // Below the ten-minute attempt lifetime, so the attempt is still recoverable at the callback.
  const Delay = Schema.Int.pipe(Schema.check(Schema.isBetween({ maximum: 590_000, minimum: 0 })))
  const Offset = Schema.Int.pipe(Schema.check(Schema.isBetween({ maximum: 700, minimum: -100 })))
  const Mechanism = Schema.Literals(["absent", "pwd", "otp", "hwk"])

  it.effect.prop(
    "confirms exactly the inclusive window, whatever authentication mechanism is reported",
    [Start, Delay, Offset, Mechanism],
    ([startedAtMs, delayMs, offsetSeconds, mechanism]) =>
      Effect.gen(function*() {
        const authTime = Math.floor(startedAtMs / 1_000) + offsetSeconds
        const extraClaims = mechanism === "absent" ? {} : { acr: `urn:test:${mechanism}`, amr: [mechanism] }
        const outcome = yield* completeWithFreshness({ authTime, delayMs, extraClaims, startedAtMs })
        const fresh = startedAtMs - TOLERANCE_MS <= authTime * 1_000 &&
          authTime * 1_000 <= startedAtMs + delayMs + TOLERANCE_MS
        if (fresh) expect(Result.isSuccess(outcome.result)).toBe(true)
        else expectNotFresh(outcome, "stale")
      }),
    { arbitrary: { runs: 60 } }
  )

  const ClientAuth = Schema.Literals(["confidential", "public"])
  const Timeout = Schema.UndefinedOr(Schema.Int.pipe(Schema.check(Schema.isBetween({ maximum: 30, minimum: 5 }))))
  const Lead = Schema.UndefinedOr(Schema.Int.pipe(Schema.check(Schema.isBetween({ maximum: 29, minimum: 0 }))))
  const Connection = Schema.UndefinedOr(Schema.String)

  it.effect.prop(
    "confirms exactly the inclusive window, whatever tenant settings and client authentication the tenant has",
    [Start, Delay, Offset, ClientAuth, Timeout, Lead, Connection, Schema.String],
    ([startedAtMs, delayMs, offsetSeconds, clientAuth, idleTimeoutMinutes, lead, connection, displayName]) =>
      Effect.gen(function*() {
        // A warning lead must be below the effective idle timeout, or the tenant file is rejected before login.
        const warningLeadMinutes = lead === undefined ? undefined : lead % (idleTimeoutMinutes ?? 30)
        const authTime = Math.floor(startedAtMs / 1_000) + offsetSeconds
        const outcome = yield* completeWithFreshness({
          authTime,
          delayMs,
          startedAtMs,
          world: {
            clientAuth,
            clientSecrets: confidentialOptions.clientSecrets,
            tenantSettings: {
              connection,
              displayName,
              idleTimeoutMinutes,
              warningLeadMinutes
            }
          }
        })
        const fresh = startedAtMs - TOLERANCE_MS <= authTime * 1_000 &&
          authTime * 1_000 <= startedAtMs + delayMs + TOLERANCE_MS
        if (fresh) expect(Result.isSuccess(outcome.result)).toBe(true)
        else expectNotFresh(outcome, "stale")
      }),
    { arbitrary: { runs: 60 } }
  )
})
