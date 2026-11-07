import { NodeRedis } from "@effect/platform-node"
import { ConfigProvider, Effect, Layer, ManagedRuntime, Result, Schema } from "effect"
import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { promisify } from "node:util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  type EstablishedSession,
  type NoUsableSession,
  SessionService,
  SessionServiceUnavailable,
  type UsableSession
} from "../../src/session.ts"
import { TenantAlias } from "../../src/tenant.ts"

const execFileAsync = promisify(execFile)
const alias = Schema.decodeSync(TenantAlias)("outage")
const policy = { idleTimeoutMinutes: 30, warningLeadMinutes: 5 }
const noUsableSession: NoUsableSession = { _tag: "NoUsableSession" }

interface OutageStore {
  readonly composeFile: string
  readonly directory: string
  readonly projectName: string
  readonly redisUrl: string
}

type SessionRuntime = ManagedRuntime.ManagedRuntime<SessionService, unknown>

let outageStore: OutageStore | undefined

const compose = async (store: OutageStore, ...args: readonly string[]): Promise<string> => {
  const result = await execFileAsync("docker", [
    "compose",
    "--project-name",
    store.projectName,
    "--file",
    store.composeFile,
    ...args
  ])
  return result.stdout
}

const freeLoopbackPort = async (): Promise<number> => {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (address === null || typeof address === "string") {
    server.close()
    throw new Error("Failed to reserve an outage-test loopback port")
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve()
      else reject(error)
    })
  })
  return address.port
}

const composeDefinition = (port: number): string => `services:
  redis:
    image: redis:8.10.3
    ports:
      - "127.0.0.1:${String(port)}:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 250ms
      timeout: 1s
      retries: 40
      start_period: 1s
`

const createOutageStore = async (): Promise<OutageStore> => {
  const port = await freeLoopbackPort()
  const directory = await mkdtemp(join(tmpdir(), "preets-session-outage-"))
  const composeFile = join(directory, "compose.yml")
  await writeFile(composeFile, composeDefinition(port), "utf8")
  const projectName = `preets-session-outage-${String(process.pid)}-${randomUUID().slice(0, 8)}`
  const store = { composeFile, directory, projectName, redisUrl: `redis://127.0.0.1:${String(port)}` }
  try {
    await compose(store, "up", "-d", "--wait", "redis")
    return store
  } catch (error) {
    try {
      await destroyOutageStore(store)
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Outage-store setup and cleanup both failed",
        { cause: cleanupError }
      )
    }
    throw error
  }
}

const destroyOutageStore = async (store: OutageStore): Promise<void> => {
  try {
    await compose(store, "down", "--volumes", "--remove-orphans")
  } finally {
    await rm(store.directory, { force: true, recursive: true })
  }
}

const stopStore = (store: OutageStore): Promise<string> => compose(store, "stop", "--timeout", "1", "redis")

const startStore = (store: OutageStore): Promise<string> => compose(store, "start", "--wait", "redis")

const pauseStore = async (store: OutageStore): Promise<void> => {
  const response = await compose(store, "exec", "-T", "redis", "redis-cli", "CLIENT", "PAUSE", "30000", "ALL")
  expect(response.trim()).toBe("OK")
}

const redisLayer = (url: string) =>
  NodeRedis.layer({
    disableOfflineQueue: true,
    pingInterval: 1_000,
    socket: {
      reconnectStrategy: () => false,
      socketTimeout: 5_000
    },
    url
  })

const sessionLayer = (url: string, prefix: string) =>
  SessionService.layer.pipe(
    Layer.provide(redisLayer(url)),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ SESSION_KEY_PREFIX: prefix })))
  )

const makeRuntime = (store: OutageStore, prefix: string): SessionRuntime =>
  ManagedRuntime.make(sessionLayer(store.redisUrl, prefix))

const establish = (runtime: SessionRuntime, label: string): Promise<EstablishedSession> =>
  runtime.runPromise(Effect.gen(function*() {
    const service = yield* SessionService
    return yield* service.establish({
      identity: { issuer: "https://provider.test/", subject: `outage-${label}` },
      policy,
      tenantAlias: alias
    })
  }))

const read = (runtime: SessionRuntime, reference: string): Promise<NoUsableSession | UsableSession> =>
  runtime.runPromise(Effect.gen(function*() {
    const service = yield* SessionService
    return yield* service.read({ reference })
  }))

const invalidate = (runtime: SessionRuntime, reference: string): Promise<NoUsableSession> =>
  runtime.runPromise(Effect.gen(function*() {
    const service = yield* SessionService
    return yield* service.invalidate({ reference })
  }))

const readResult = (runtime: SessionRuntime, reference: string) =>
  runtime.runPromise(Effect.gen(function*() {
    const service = yield* SessionService
    return yield* service.read({ reference }).pipe(Effect.result)
  }))

const refreshResult = (runtime: SessionRuntime, reference: string) =>
  runtime.runPromise(Effect.gen(function*() {
    const service = yield* SessionService
    return yield* service.refreshForTenant({
      activity: "continue-session",
      policy,
      reference,
      tenantAlias: alias
    }).pipe(Effect.result)
  }))

const invalidateResult = (runtime: SessionRuntime, reference: string) =>
  runtime.runPromise(Effect.gen(function*() {
    const service = yield* SessionService
    return yield* service.invalidate({ reference }).pipe(Effect.result)
  }))

const expectUnavailable = (result: Result.Result<unknown, unknown>): void => {
  expect(Result.isFailure(result)).toBe(true)
  if (!Result.isFailure(result)) return
  const failure = result.failure
  expect(failure).toBeInstanceOf(SessionServiceUnavailable)
  if (!(failure instanceof SessionServiceUnavailable)) return
  expect(failure).toMatchObject({ _tag: SessionServiceUnavailable.tag })
  expect(Object.keys(failure)).toStrictEqual(["_tag"])
}

const expectUsable = (session: NoUsableSession | UsableSession): void => {
  expect(session._tag).toBe("UsableSession")
}

const expectPending = async (promise: Promise<unknown>): Promise<void> => {
  let settled = false
  void promise.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    }
  )
  await delay(250)
  expect(settled).toBe(false)
}

const withinFailureBound = async <A>(promise: Promise<A>): Promise<A> =>
  Promise.race([
    promise,
    delay(10_000).then(() => {
      throw new Error("Public session operation did not fail within 10 seconds of owned-store loss")
    })
  ])

const reEvaluateAndClean = async (
  store: OutageStore,
  prefix: string,
  references: readonly string[]
): Promise<void> => {
  const runtime = makeRuntime(store, prefix)
  try {
    for (const reference of references) {
      const outcome = await read(runtime, reference)
      if (outcome._tag === "UsableSession") {
        expect(await invalidate(runtime, reference)).toStrictEqual(noUsableSession)
      } else {
        expect(outcome).toStrictEqual(noUsableSession)
      }
    }
  } finally {
    await runtime.dispose()
  }
}

const disposeAll = async (runtimes: readonly SessionRuntime[]): Promise<void> => {
  await Promise.all(runtimes.map((runtime) => runtime.dispose()))
}

describe("SessionService dedicated Redis outage", () => {
  beforeAll(async () => {
    outageStore = await createOutageStore()
  }, 120_000)

  afterAll(async () => {
    if (outageStore !== undefined) await destroyOutageStore(outageStore)
  }, 120_000)

  it("fails read, refresh, and invalidation when the owned store is stopped before dispatch", async () => {
    const store = outageStore
    if (store === undefined) throw new Error("Dedicated outage store was not started")
    const prefix = `test:session:outage:${randomUUID()}:`
    const setup = makeRuntime(store, prefix)
    const clients = [makeRuntime(store, prefix), makeRuntime(store, prefix), makeRuntime(store, prefix)] as const
    const references: string[] = []
    let needsRestart = false
    try {
      const sessions = await Promise.all([
        establish(setup, "pre-dispatch-read"),
        establish(setup, "pre-dispatch-refresh"),
        establish(setup, "pre-dispatch-invalidate")
      ])
      references.push(...sessions.map((session) => session.reference))
      await Promise.all([
        read(clients[0], sessions[0].reference).then(expectUsable),
        read(clients[1], sessions[1].reference).then(expectUsable),
        read(clients[2], sessions[2].reference).then(expectUsable)
      ])

      needsRestart = true
      await stopStore(store)
      const results = await Promise.all([
        withinFailureBound(readResult(clients[0], sessions[0].reference)),
        withinFailureBound(refreshResult(clients[1], sessions[1].reference)),
        withinFailureBound(invalidateResult(clients[2], sessions[2].reference))
      ])
      results.forEach(expectUnavailable)
    } finally {
      await disposeAll([setup, ...clients])
      if (needsRestart) {
        await stopStore(store)
        await startStore(store)
      }
      await reEvaluateAndClean(store, prefix, references)
    }
  })

  it("fails bounded in-flight operations when the paused owned store stops", async () => {
    const store = outageStore
    if (store === undefined) throw new Error("Dedicated outage store was not started")
    const prefix = `test:session:outage:${randomUUID()}:`
    const setup = makeRuntime(store, prefix)
    const clients = [makeRuntime(store, prefix), makeRuntime(store, prefix), makeRuntime(store, prefix)] as const
    const references: string[] = []
    let needsRestart = false
    try {
      const sessions = await Promise.all([
        establish(setup, "mid-flight-read"),
        establish(setup, "mid-flight-refresh"),
        establish(setup, "mid-flight-invalidate")
      ])
      references.push(...sessions.map((session) => session.reference))
      await Promise.all([
        read(clients[0], sessions[0].reference).then(expectUsable),
        read(clients[1], sessions[1].reference).then(expectUsable),
        read(clients[2], sessions[2].reference).then(expectUsable)
      ])
      await pauseStore(store)
      needsRestart = true

      const operations = [
        readResult(clients[0], sessions[0].reference),
        refreshResult(clients[1], sessions[1].reference),
        invalidateResult(clients[2], sessions[2].reference)
      ] as const
      await Promise.all(operations.map(expectPending))

      await stopStore(store)
      const results = await Promise.all(operations.map(withinFailureBound))
      results.forEach(expectUnavailable)
    } finally {
      await disposeAll([setup, ...clients])
      if (needsRestart) {
        await stopStore(store)
        await startStore(store)
      }
      await reEvaluateAndClean(store, prefix, references)
    }
  })
})
