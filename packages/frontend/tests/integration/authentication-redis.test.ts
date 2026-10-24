import { NodeRedis } from "@effect/platform-node"
import { ConfigProvider, Effect, FileSystem, Layer, ManagedRuntime, Path, Result } from "effect"
import { generateKeyPairSync, randomUUID, sign } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { AuthenticationDenied, AuthenticationService, CallbackExpectedFailure } from "../../src/lib/authentication.ts"
import { TenantConfigService } from "../../src/lib/tenant.ts"

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
const transactionPrefix = `test:authentication:${randomUUID()}:`
const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 })
const publicJwk = {
  ...keyPair.publicKey.export({ format: "jwk" }),
  alg: "RS256",
  kid: "redis-integration-key",
  use: "sig"
}

const encoded = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url")
const idToken = (nonce: string): string => {
  const input = `${encoded({ alg: "RS256", kid: "redis-integration-key", typ: "JWT" })}.${
    encoded({
      aud: "alpha-client",
      auth_time: 1_700_000_000,
      exp: Math.floor(Date.now() / 1_000) + 300,
      iat: Math.floor(Date.now() / 1_000),
      iss: "https://provider.test",
      nonce,
      sub: "subject-redis"
    })
  }`
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), keyPair.privateKey).toString("base64url")}`
}

let nonce = ""
const providerTransport: typeof globalThis.fetch = (input) => {
  const url = new URL(input instanceof Request ? input.url : input.toString())
  switch (url.pathname) {
    case "/.well-known/openid-configuration":
      return Promise.resolve(Response.json({
        authorization_endpoint: "https://provider.test/authorize",
        id_token_signing_alg_values_supported: ["RS256"],
        issuer: "https://provider.test",
        jwks_uri: "https://provider.test/jwks",
        token_endpoint: "https://provider.test/token"
      }))
    case "/jwks":
      return Promise.resolve(Response.json({ keys: [publicJwk] }))
    case "/token":
      return Promise.resolve(Response.json({
        access_token: "controlled-access-token",
        id_token: idToken(nonce),
        token_type: "Bearer"
      }))
    default:
      return Promise.reject(new Error(`Unexpected provider URL: ${url.href}`))
  }
}

const redisLayer = () =>
  NodeRedis.layer({
    disableOfflineQueue: true,
    pingInterval: 1_000,
    socket: { socketTimeout: 5_000 },
    url: redisUrl
  })

const authenticationLayer = (options: { readonly prefix?: string; readonly ttl?: string } = {}) =>
  AuthenticationService.layer.pipe(
    Layer.provide(redisLayer()),
    Layer.provide(TenantConfigService.layer({
      env: "test",
      tenant: { baseHostname: "example.test", configDir: "/tenants", resolution: "host" }
    })),
    Layer.provide(FileSystem.layerNoop({
      readDirectory: () => Effect.succeed([]),
      readFileString: () =>
        Effect.succeed(JSON.stringify({
          displayName: "Alpha",
          oidc: { clientAuth: "public", clientId: "alpha-client", issuer: "https://provider.test" }
        }))
    })),
    Layer.provide(Path.layer),
    Layer.provide(Layer.succeed(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({
        OIDC_ALLOW_INSECURE_LOOPBACK: "false",
        OIDC_CALLBACK_ORIGINS_JSON: JSON.stringify({ alpha: "https://alpha.example.test" }),
        OIDC_CLIENT_SECRETS_JSON: "{}",
        OIDC_TX_KEY_PREFIX: options.prefix ?? transactionPrefix,
        OIDC_TX_TTL_SECONDS: options.ttl ?? "30"
      })
    ))
  )

const prepare = (runtime: ManagedRuntime.ManagedRuntime<AuthenticationService, unknown>) =>
  runtime.runPromise(Effect.gen(function*() {
    const authentication = yield* AuthenticationService
    return yield* authentication.prepare({ host: "alpha.example.test" })
  }))

const complete = (
  runtime: ManagedRuntime.ManagedRuntime<AuthenticationService, unknown>,
  prepared: Awaited<ReturnType<typeof prepare>>,
  state: string,
  host = "alpha.example.test"
) =>
  runtime.runPromise(
    Effect.gen(function*() {
      const authentication = yield* AuthenticationService
      return yield* authentication.complete({
        correlation: prepared.correlation,
        host,
        query: [["code", "controlled-code"], ["state", state]]
      })
    }).pipe(Effect.result)
  )

describe("AuthenticationService with independently scoped NodeRedis clients", () => {
  const instanceA = ManagedRuntime.make(authenticationLayer())
  const instanceB = ManagedRuntime.make(authenticationLayer())

  beforeAll(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(providerTransport)
  })
  afterAll(async () => {
    vi.restoreAllMocks()
    await Promise.all([instanceA.dispose(), instanceB.dispose()])
  })

  it("creates on A, consumes on B, and denies replay", async () => {
    const prepared = await prepare(instanceA)
    const destination = new URL(prepared.destination)
    nonce = destination.searchParams.get("nonce") ?? ""
    const state = destination.searchParams.get("state") ?? ""

    const first = await complete(instanceB, prepared, state)
    expect(Result.isSuccess(first)).toBe(true)
    if (Result.isSuccess(first)) expect(first.success.subject).toBe("subject-redis")

    const replay = await complete(instanceA, prepared, state)
    expect(Result.isFailure(replay)).toBe(true)
    if (Result.isFailure(replay)) {
      expect(replay.failure).toBeInstanceOf(CallbackExpectedFailure)
      expect(replay.failure.correlationDisposition).toBe("preserve")
      expect(replay.failure.reason).toBeInstanceOf(AuthenticationDenied)
    }
  })

  it("has exactly one winner when independently composed instances race", async () => {
    const prepared = await prepare(instanceA)
    const destination = new URL(prepared.destination)
    nonce = destination.searchParams.get("nonce") ?? ""
    const state = destination.searchParams.get("state") ?? ""
    const results = await Promise.all([
      complete(instanceA, prepared, state),
      complete(instanceB, prepared, state)
    ])
    expect(results.filter(Result.isSuccess)).toHaveLength(1)
    expect(results.filter(Result.isFailure)).toHaveLength(1)
  })

  it("does not consume the valid address for a wrong state", async () => {
    const prepared = await prepare(instanceA)
    const destination = new URL(prepared.destination)
    nonce = destination.searchParams.get("nonce") ?? ""
    const state = destination.searchParams.get("state") ?? ""
    const mismatch = await complete(instanceB, prepared, "wrong-state")
    expect(Result.isFailure(mismatch)).toBe(true)
    if (Result.isFailure(mismatch)) expect(mismatch.failure.correlationDisposition).toBe("preserve")
    expect(Result.isSuccess(await complete(instanceB, prepared, state))).toBe(true)
  })

  it("does not consume the valid address for a different tenant", async () => {
    const prepared = await prepare(instanceA)
    const destination = new URL(prepared.destination)
    nonce = destination.searchParams.get("nonce") ?? ""
    const state = destination.searchParams.get("state") ?? ""
    const mismatch = await complete(instanceB, prepared, state, "beta.example.test")
    expect(Result.isFailure(mismatch)).toBe(true)
    if (Result.isFailure(mismatch)) expect(mismatch.failure.correlationDisposition).toBe("preserve")
    expect(Result.isSuccess(await complete(instanceB, prepared, state))).toBe(true)
  })

  it("denies after Redis server-clock expiry", async () => {
    const prefix = `test:authentication:${randomUUID()}:`
    const expiringA = ManagedRuntime.make(authenticationLayer({
      prefix,
      ttl: "1"
    }))
    const expiringB = ManagedRuntime.make(authenticationLayer({
      prefix,
      ttl: "1"
    }))
    try {
      const prepared = await prepare(expiringA)
      const destination = new URL(prepared.destination)
      nonce = destination.searchParams.get("nonce") ?? ""
      const state = destination.searchParams.get("state") ?? ""
      await delay(1_100)
      const expired = await complete(expiringB, prepared, state)
      expect(Result.isFailure(expired)).toBe(true)
      if (Result.isFailure(expired)) expect(expired.failure.correlationDisposition).toBe("preserve")
    } finally {
      await Promise.all([expiringA.dispose(), expiringB.dispose()])
    }
  })
})
