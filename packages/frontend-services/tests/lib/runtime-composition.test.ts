import { NodeServices } from "@effect/platform-node"
import { assert, it } from "@effect/vitest"
import { Cause, Config, ConfigProvider, Effect, Exit, Layer, Option } from "effect"
import * as Redis from "effect/persistence/Redis"
import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, vi } from "vitest"

import { AuthenticationProcessConfig } from "../../src/authentication.ts"
import { toNext } from "../../src/next.ts"
import { ObservabilityInitializationError } from "../../src/observability.ts"
import { applicationLayer, loadProcessStartup, Runtime, StartupNotReady } from "../../src/runtime.ts"
import { SessionService } from "../../src/session.ts"

const restoreEnv = (previous: NodeJS.ProcessEnv) => {
  for (const key of Object.keys(process.env)) {
    if (!Object.hasOwn(previous, key)) Reflect.deleteProperty(process.env, key)
  }
  Object.assign(process.env, previous)
}

const withEnv = <A, E, R>(
  update: (env: NodeJS.ProcessEnv) => void,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> => {
  const previous = { ...process.env }
  update(process.env)
  return effect.pipe(Effect.ensuring(Effect.sync(() => {
    restoreEnv(previous)
  })))
}

const recordingInfrastructure = () => {
  let acquired = false
  const redisLayer = Layer.effect(
    Redis.Redis,
    Effect.gen(function*() {
      acquired = true
      return yield* Redis.make({
        send: () => Effect.die("startup composition must not send Redis commands"),
        subscribe: () => Effect.succeed(Effect.never)
      })
    })
  )
  return {
    acquired: () => acquired,
    layer: Layer.mergeAll(redisLayer, NodeServices.layer)
  }
}

const failure = (exit: Exit.Exit<unknown, unknown>): unknown => {
  if (!Exit.isFailure(exit)) return undefined
  const error = Cause.findErrorOption(exit.cause)
  return Option.isSome(error) ? error.value : undefined
}

const managedRuntimeSlot = Symbol.for("@pathableai/pre-ets-frontend/ManagedRuntime")

const clearInstalledRuntime = (): void => {
  Reflect.deleteProperty(globalThis, managedRuntimeSlot)
}

const memoryRedis = Layer.effect(
  Redis.Redis,
  Redis.make({
    send: () => Effect.die("startup composition must not send Redis commands"),
    subscribe: () => Effect.succeed(Effect.never)
  })
)

// Runtime and authentication contracts: one startup value before infrastructure (V-006, V-001, V-008).
describe("runtime composition", () => {
  afterEach(clearInstalledRuntime)

  it.effect("does not acquire infrastructure when TENANT_CONFIG_DIR is omitted", () => {
    const recording = recordingInfrastructure()
    return withEnv(
      (env) => {
        delete env.TENANT_CONFIG_DIR
      },
      Effect.gen(function*() {
        const exit = yield* Effect.exit(loadProcessStartup)
        if (Exit.isSuccess(exit)) {
          yield* Effect.scoped(Layer.build(applicationLayer(exit.value, recording.layer)))
        }
        assert.instanceOf(failure(exit), Config.ConfigError)
        assert.isFalse(recording.acquired())
      })
    )
  })

  it.effect("does not acquire infrastructure when callback origins are invalid", () => {
    const recording = recordingInfrastructure()
    return withEnv(
      (env) => {
        env.OIDC_CALLBACK_ORIGINS_JSON = "{\"alpha\":\"not-a-url\"}"
      },
      Effect.gen(function*() {
        const provider = ConfigProvider.fromEnvRecord({ ...process.env })
        const authentication = yield* Effect.exit(AuthenticationProcessConfig.pipe(
          Effect.provideService(ConfigProvider.ConfigProvider, provider)
        ))
        const startup = yield* Effect.exit(loadProcessStartup)
        if (Exit.isSuccess(startup)) {
          yield* Effect.scoped(Layer.build(applicationLayer(startup.value, recording.layer)))
        }
        assert.instanceOf(failure(authentication), Config.ConfigError)
        assert.instanceOf(failure(startup), Config.ConfigError)
        assert.isFalse(recording.acquired())
      })
    )
  })

  it.effect("does not acquire infrastructure when the selected protocol is grpc", () => {
    const recording = recordingInfrastructure()
    return withEnv(
      (env) => {
        env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:4318"
        env.OTEL_EXPORTER_OTLP_PROTOCOL = "grpc"
        env.OTEL_SDK_DISABLED = "false"
      },
      Effect.gen(function*() {
        const startup = yield* loadProcessStartup
        const exit = yield* Effect.exit(Effect.scoped(Layer.build(applicationLayer(startup, recording.layer))))
        const error = failure(exit)
        assert.instanceOf(error, ObservabilityInitializationError)
        if (error instanceof ObservabilityInitializationError) {
          assert.strictEqual(error.reason, "protocol")
          assert.strictEqual(error.signal, "traces")
        }
        assert.isFalse(recording.acquired())
      })
    )
  })

  it.effect("reads a public session result through substitute infrastructure", () => {
    return withEnv(
      (env) => {
        env.OTEL_SDK_DISABLED = "true"
      },
      Effect.gen(function*() {
        const startup = yield* loadProcessStartup
        const session = yield* Effect.gen(function*() {
          const service = yield* SessionService
          return yield* service.read({})
        }).pipe(Effect.provide(applicationLayer(startup, Layer.mergeAll(memoryRedis, NodeServices.layer))))
        assert.deepStrictEqual(session, { _tag: "NoUsableSession" })
      })
    )
  })

  it.effect("returns RedisError from substitute infrastructure and continues", () => {
    const failing = Layer.mergeAll(
      Layer.effect(Redis.Redis, Effect.fail(new Redis.RedisError({ cause: "substitute unavailable" }))),
      NodeServices.layer
    )
    return withEnv(
      (env) => {
        env.OTEL_SDK_DISABLED = "true"
      },
      Effect.gen(function*() {
        const startup = yield* loadProcessStartup
        const exit = yield* Effect.exit(Effect.scoped(Layer.build(applicationLayer(startup, failing))))
        assert.instanceOf(failure(exit), Redis.RedisError)
        assert.isTrue(Exit.isFailure(exit))
      })
    )
  })

  it("does not read startup configuration when the module is imported", async () => {
    vi.resetModules()
    const previous = process.env.TENANT_CONFIG_DIR
    const phase = process.env.NEXT_PHASE
    delete process.env.TENANT_CONFIG_DIR
    delete process.env.NEXT_PHASE
    let ran = false
    try {
      const runtime = await import("../../src/runtime.ts")
      await expect(runtime.Runtime.runPromise(Effect.sync(() => {
        ran = true
      }))).rejects.toBeInstanceOf(runtime.StartupNotReady)
      expect(ran).toBe(false)
    } finally {
      if (previous === undefined) delete process.env.TENANT_CONFIG_DIR
      else process.env.TENANT_CONFIG_DIR = previous
      if (phase === undefined) delete process.env.NEXT_PHASE
      else process.env.NEXT_PHASE = phase
    }
  })

  it("uses the runtime installed by another evaluation of this module", async () => {
    vi.resetModules()
    const first = await import("../../src/runtime.ts")
    let ran = false
    first.installManagedRuntime(
      {
        runPromise: () => {
          ran = true
          return Promise.resolve(undefined)
        }
      } as unknown as Parameters<typeof first.installManagedRuntime>[0]
    )
    vi.resetModules()
    const second = await import("../../src/runtime.ts")
    expect(second.Runtime).not.toBe(first.Runtime)
    await expect(second.Runtime.runPromise(Effect.void)).resolves.toBeUndefined()
    expect(ran).toBe(true)
  })

  it("does not call the handler before the runtime is ready", async () => {
    let ran = false
    await expect(Runtime.runPromise(Effect.sync(() => {
      ran = true
    }))).rejects.toBeInstanceOf(StartupNotReady)
    expect(ran).toBe(false)
    const request = new NextRequest("http://127.0.0.1:3000/")
    let called = false
    const handler = toNext(() => {
      called = true
      return Effect.succeed(new NextResponse(null, { status: 200 }))
    })
    const response = await handler(request)
    expect(response.status).toBe(503)
    expect(called).toBe(false)
  })
})
