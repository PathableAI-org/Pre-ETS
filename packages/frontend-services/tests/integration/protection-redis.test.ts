import { NodeRedis } from "@effect/platform-node"
import { Effect, Layer, ManagedRuntime, Result, Schema } from "effect"
import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createProtectionProxy } from "../../src/next.ts"
import { SessionService } from "../../src/session.ts"
import { TenantAlias, type TenantConfig, TenantConfigService } from "../../src/tenant.ts"
import { SessionRedis, sessionWorld } from "../helpers/session.ts"

const runtime = vi.hoisted(() => ({ runPromise: vi.fn() }))
vi.mock("../../src/runtime.ts", () => ({ Runtime: runtime }))

const springfield = Schema.decodeSync(TenantAlias)("springfield")
const shelbyville = Schema.decodeSync(TenantAlias)("shelbyville")
const tenantConfig: TenantConfig = {
  displayName: "Springfield",
  oidc: { clientAuth: "public", clientId: "springfield-web", issuer: "https://provider.test" }
}
const policy = { idleTimeoutMinutes: 30, warningLeadMinutes: 5 }

/** Every request resolves to Springfield; the store under test is real. */
const springfieldTenant = Layer.succeed(TenantConfigService, {
  getAlias: () => Result.succeed(springfield),
  getConfigFromAlias: () => Effect.succeed(tenantConfig),
  getConfigFromHost: () => Effect.die("getConfigFromHost must remain unused")
})

const protect = createProtectionProxy({
  forbiddenDocument: () => Promise.resolve(new NextResponse("forbidden-document", { status: 403 })),
  tenantFailure: (status) => Promise.resolve(new NextResponse(null, { status }))
})

const navigation = { "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" }
const rscFetch = { "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" }

const request = (reference: string, headers: Readonly<Record<string, string>>) =>
  new NextRequest("http://springfield.localhost/", {
    headers: { ...headers, cookie: `pathable-session=${reference}`, host: "springfield.localhost" }
  })

type World = ManagedRuntime.ManagedRuntime<SessionRedis | SessionService | TenantConfigService, unknown>

/** A real SessionService on an owned Redis prefix; disposing the runtime removes only that prefix's keys. */
const useWorld = (world: World) => {
  runtime.runPromise.mockImplementation((program: Effect.Effect<unknown, unknown, SessionService>) =>
    world.runPromise(program)
  )
  return world
}

const establish = (world: World, tenantAlias: TenantAlias) =>
  world.runPromise(
    SessionService.use((sessions) =>
      sessions.establish({
        identity: { issuer: "https://provider.test/", subject: "subject-gate" },
        policy,
        tenantAlias
      })
    )
  )

const expectDenial = async (response: Response, status: number) => {
  expect(response.status).toBe(status)
  expect(response.headers.get("x-middleware-next")).toBeNull()
  expect(response.headers.get("cache-control")).toBe("private, no-store")
  expect(response.headers.getSetCookie()).toEqual([])
  expect(await response.text()).toBe("")
}

const expectLogin = (response: Response) => {
  expect(response.status).toBe(307)
  expect(response.headers.get("location")).toBe("http://springfield.localhost/auth/login")
  expect(response.headers.getSetCookie()).toEqual([])
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("createProtectionProxy over the real session store [PREETS-SESSION-001, PREETS-SESSION-005]", () => {
  const withWorld = async (scenario: (world: World) => Promise<void>) => {
    const world = useWorld(ManagedRuntime.make(Layer.mergeAll(sessionWorld, springfieldTenant)))
    try {
      await scenario(world)
    } finally {
      await world.dispose()
    }
  }

  it("admits and renews a live Springfield session without writing its cookie", () =>
    withWorld(async (world) => {
      const established = await establish(world, springfield)
      await new Promise((resolve) => setTimeout(resolve, 20))

      const response = await protect(request(established.reference, navigation))

      expect(response.headers.get("x-middleware-next")).toBe("1")
      expect(response.headers.getSetCookie()).toEqual([])
      const renewed = await world.runPromise(
        SessionService.use((sessions) => sessions.read({ reference: established.reference }))
      )
      expect(renewed._tag).toBe("UsableSession")
      if (renewed._tag === "UsableSession") {
        expect(renewed.idleDeadlineEpochMilliseconds).toBeGreaterThan(established.session.idleDeadlineEpochMilliseconds)
      }
    }))

  it("sends an expired session to login for a document and 401 otherwise", () =>
    withWorld(async (world) => {
      const established = await establish(world, springfield)
      await world.runPromise(
        SessionRedis.use((redis) =>
          redis.rewriteAll((payload) => JSON.stringify({ ...JSON.parse(payload), idleDeadlineEpochMilliseconds: 1 }))
        )
      )

      expectLogin(await protect(request(established.reference, navigation)))
      await expectDenial(await protect(request(established.reference, rscFetch)), 401)
    }))

  it("sends an invalidated session to login for a document and 401 otherwise", () =>
    withWorld(async (world) => {
      const established = await establish(world, springfield)
      await world.runPromise(
        SessionService.use((sessions) => sessions.invalidate({ reference: established.reference }))
      )

      expectLogin(await protect(request(established.reference, navigation)))
      await expectDenial(await protect(request(established.reference, rscFetch)), 401)
    }))

  it("forbids another tenant's session on Springfield", () =>
    withWorld(async (world) => {
      const established = await establish(world, shelbyville)

      const document = await protect(request(established.reference, navigation))
      expect(document.status).toBe(403)
      expect(await document.text()).toBe("forbidden-document")
      expect(document.headers.get("cache-control")).toBe("private, no-store")
      expect(document.headers.getSetCookie()).toEqual([])
      await expectDenial(await protect(request(established.reference, rscFetch)), 403)
    }))

  it("answers 503 with no login redirect and no cookie when the store client is disconnected", async () => {
    const redis = NodeRedis.layer({
      disableOfflineQueue: true,
      socket: { reconnectStrategy: () => false, socketTimeout: 1_000 },
      url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
    })
    const world = ManagedRuntime.make(
      SessionService.layer({ keyPrefix: `test:session:${randomUUID()}` }).pipe(
        Layer.provideMerge(redis),
        Layer.merge(springfieldTenant)
      )
    )
    runtime.runPromise.mockImplementation((program: Effect.Effect<unknown, unknown, SessionService>) =>
      world.runPromise(program)
    )
    try {
      await world.runPromise(NodeRedis.NodeRedis.use((node) =>
        Effect.sync(() => {
          node.client.destroy()
        })
      ))

      for (const headers of [navigation, rscFetch]) {
        await expectDenial(await protect(request("R".repeat(43), headers)), 503)
      }
    } finally {
      await world.dispose()
    }
  })
})
