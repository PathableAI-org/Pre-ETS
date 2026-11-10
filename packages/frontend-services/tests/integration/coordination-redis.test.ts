import { NodeRedis } from "@effect/platform-node"
import { Effect, Layer, ManagedRuntime, Result, Schema } from "effect"
import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { setTimeout as sleep } from "node:timers/promises"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  authorizeSessionAction,
  createLogoutHandler,
  createProtectionProxy,
  createSessionActivityHandler,
  createSessionStatusHandler
} from "../../src/next.ts"
import { SessionService } from "../../src/session.ts"
import { TenantAlias, type TenantConfig, TenantConfigService } from "../../src/tenant.ts"
import { SessionRedis, sessionWorld } from "../helpers/session.ts"

const runtime = vi.hoisted(() => ({ runPromise: vi.fn() }))
vi.mock("../../src/runtime.ts", () => ({ Runtime: runtime }))

const springfield = Schema.decodeSync(TenantAlias)("springfield")
const tenantConfig: TenantConfig = {
  displayName: "Springfield",
  idleTimeoutMinutes: 30,
  oidc: { clientAuth: "public", clientId: "springfield-web", issuer: "https://provider.test" },
  warningLeadMinutes: 5
}
const springfieldTenant = Layer.succeed(TenantConfigService, {
  getAlias: () => Result.succeed(springfield),
  getConfigFromAlias: () => Effect.succeed(tenantConfig),
  getConfigFromHost: () => Effect.die("getConfigFromHost must remain unused")
})

const protect = createProtectionProxy({
  forbiddenDocument: () => Promise.resolve(new NextResponse(null, { status: 403 })),
  tenantFailure: (status) => Promise.resolve(new NextResponse(null, { status }))
})
const activity = createSessionActivityHandler()
const status = createSessionStatusHandler()
const logout = createLogoutHandler()

interface Snapshot {
  readonly coordinationTag: string
  readonly idleDeadlineEpochMilliseconds: number
  readonly observedAtEpochMilliseconds: number
  readonly revision: number
}

const ORIGIN = "http://springfield.localhost"

const statusRequest = (reference: string) =>
  new NextRequest(`${ORIGIN}/session/status`, {
    headers: { cookie: `pathable-session=${reference}`, host: "springfield.localhost", "sec-fetch-site": "same-origin" }
  })

const post = (path: string, reference: string, body: unknown) =>
  new NextRequest(`${ORIGIN}${path}`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      cookie: `pathable-session=${reference}`,
      host: "springfield.localhost",
      "sec-fetch-site": "same-origin"
    },
    method: "POST"
  })

type World = ManagedRuntime.ManagedRuntime<SessionRedis | SessionService | TenantConfigService, unknown>

const withWorld = async (scenario: (world: World) => Promise<void>) => {
  const world: World = ManagedRuntime.make(Layer.mergeAll(sessionWorld, springfieldTenant))
  runtime.runPromise.mockImplementation((program: Effect.Effect<unknown, unknown, SessionService>) =>
    world.runPromise(program)
  )
  try {
    await scenario(world)
  } finally {
    await world.dispose()
  }
}

const establish = (world: World) =>
  world.runPromise(
    SessionService.use((sessions) =>
      sessions.establish({
        identity: { issuer: "https://provider.test/", subject: "subject-coordination" },
        policy: { idleTimeoutMinutes: 30, warningLeadMinutes: 5 },
        tenantAlias: springfield
      })
    )
  )

const storedDeadlines = (world: World) =>
  world.runPromise(
    SessionRedis.use((redis) =>
      redis.records.pipe(
        Effect.map((records) =>
          [...records.values()].map((record) =>
            (JSON.parse(record.payload) as { readonly idleDeadlineEpochMilliseconds: number })
              .idleDeadlineEpochMilliseconds
          )
        )
      )
    )
  )

const readSnapshot = async (reference: string) => {
  const response = await status(statusRequest(reference))
  expect(response.status).toBe(200)
  return (await response.json()) as Snapshot
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("coordination handlers over the real session store [PREETS-SESSION-009, PREETS-SESSION-010]", () => {
  it("renews on activity and answers with the stored renewed deadline", () =>
    withWorld(async (world) => {
      const established = await establish(world)
      const before = await readSnapshot(established.reference)
      await sleep(20)

      const response = await activity(
        post("/session/activity", established.reference, {
          activity: "text-entry",
          coordinationTag: before.coordinationTag
        })
      )

      expect(response.status).toBe(200)
      const renewed = (await response.json()) as Snapshot
      expect(renewed.idleDeadlineEpochMilliseconds).toBeGreaterThan(before.idleDeadlineEpochMilliseconds)
      expect(await storedDeadlines(world)).toEqual([renewed.idleDeadlineEpochMilliseconds])
      expect(renewed.revision).toBe(before.revision + 1)
      expect(response.headers.getSetCookie()).toEqual([])
    }))

  it("orders overlapping status and activity snapshots by record revision, not arrival", () =>
    withWorld(async (world) => {
      const established = await establish(world)
      const { coordinationTag } = await readSnapshot(established.reference)
      await sleep(20)

      const [statusResponse, activityResponse] = await Promise.all([
        status(statusRequest(established.reference)),
        activity(post("/session/activity", established.reference, { activity: "text-entry", coordinationTag }))
      ])

      const snapshots = [(await statusResponse.json()) as Snapshot, (await activityResponse.json()) as Snapshot]
      const latest = snapshots.reduce((held, next) => next.revision > held.revision ? next : held)
      expect(latest.revision).toBe(2)
      expect(await storedDeadlines(world)).toEqual([latest.idleDeadlineEpochMilliseconds])
    }))

  it("never renews at the gate on a coordination endpoint before the handler refuses", () =>
    withWorld(async (world) => {
      const established = await establish(world)
      const [stored] = await storedDeadlines(world)
      await sleep(20)
      const staleAction = new NextRequest(`${ORIGIN}/session/activity`, {
        body: JSON.stringify({ activity: "text-entry", coordinationTag: "stale-session-tag" }),
        headers: {
          "content-type": "application/json",
          cookie: `pathable-session=${established.reference}`,
          host: "springfield.localhost",
          "next-action": "0123456789abcdef",
          "sec-fetch-site": "same-origin"
        },
        method: "POST"
      })
      const navigation = new NextRequest(`${ORIGIN}/session/status`, {
        headers: {
          cookie: `pathable-session=${established.reference}`,
          host: "springfield.localhost",
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate"
        }
      })

      for (const [incoming, handler, expected] of [[staleAction, activity, 409], [navigation, status, 200]] as const) {
        const gate = await protect(incoming)
        expect(gate.headers.get("x-middleware-next")).toBe("1")
        expect(gate.headers.getSetCookie()).toEqual([])
        expect((await handler(incoming)).status).toBe(expected)
        expect(await storedDeadlines(world)).toEqual([stored])
      }
    }))

  it("authorizes a protected action only for the matching tag, renewing after the check", () =>
    withWorld(async (world) => {
      const established = await establish(world)
      const before = await readSnapshot(established.reference)
      await sleep(20)
      const authorize = (coordinationTag: string | undefined) =>
        authorizeSessionAction({ coordinationTag, host: "springfield.localhost", reference: established.reference })

      for (const stale of ["stale-session-tag", undefined]) {
        expect(await authorize(stale)).toStrictEqual({ _tag: "SessionChanged" })
        const unchanged = await readSnapshot(established.reference)
        expect(unchanged.revision).toBe(before.revision)
        expect(unchanged.idleDeadlineEpochMilliseconds).toBe(before.idleDeadlineEpochMilliseconds)
      }

      const authorized = await authorize(before.coordinationTag)
      expect(authorized._tag).toBe("Authorized")
      const after = await readSnapshot(established.reference)
      expect(after.revision).toBe(before.revision + 1)
      expect(after.idleDeadlineEpochMilliseconds).toBeGreaterThan(before.idleDeadlineEpochMilliseconds)
    }))

  it("never moves the stored deadline on status reads", () =>
    withWorld(async (world) => {
      const established = await establish(world)
      const [stored] = await storedDeadlines(world)

      const first = await readSnapshot(established.reference)
      await sleep(20)
      const second = await readSnapshot(established.reference)

      expect(first.idleDeadlineEpochMilliseconds).toBe(stored)
      expect(second.idleDeadlineEpochMilliseconds).toBe(stored)
      expect(await storedDeadlines(world)).toEqual([stored])
    }))

  it("does not revive a session through activity after logout", () =>
    withWorld(async (world) => {
      const established = await establish(world)
      const { coordinationTag } = await readSnapshot(established.reference)

      const ended = await logout(post("/auth/logout", established.reference, { coordinationTag }))

      expect(ended.status).toBe(204)
      expect(ended.headers.getSetCookie()).toEqual([])
      expect(await storedDeadlines(world)).toEqual([])
      const late = await activity(
        post("/session/activity", established.reference, { activity: "keyboard-interaction", coordinationTag })
      )
      expect(late.status).toBe(401)
      expect((await status(statusRequest(established.reference))).status).toBe(401)
      expect(await storedDeadlines(world)).toEqual([])
    }))

  it("does not revive an expired session through activity", () =>
    withWorld(async (world) => {
      const established = await establish(world)
      const { coordinationTag } = await readSnapshot(established.reference)
      await world.runPromise(
        SessionRedis.use((redis) =>
          redis.rewriteAll((payload) => JSON.stringify({ ...JSON.parse(payload), idleDeadlineEpochMilliseconds: 1 }))
        )
      )

      const late = await activity(
        post("/session/activity", established.reference, { activity: "text-entry", coordinationTag })
      )

      expect(late.status).toBe(401)
      expect(await storedDeadlines(world)).toEqual([])
    }))

  it("answers 503 with the cookie untouched when the store client is disconnected", async () => {
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
      const reference = "R".repeat(43)
      const tag = "unused-because-the-store-answers-first"

      for (
        const response of [
          await status(statusRequest(reference)),
          await logout(post("/auth/logout", reference, { coordinationTag: tag }))
        ]
      ) {
        expect(response.status).toBe(503)
        expect(response.headers.getSetCookie()).toEqual([])
      }
    } finally {
      await world.dispose()
    }
  })
})
