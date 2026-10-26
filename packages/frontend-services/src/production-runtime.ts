import { NodeRedis, NodeServices } from "@effect/platform-node"
import { Config, Effect, Layer, ManagedRuntime } from "effect"
import * as Redis from "effect/persistence/Redis"

import { ObservabilityInitializationError, selectObservability } from "./observability.js"
import {
  applicationLayer,
  type ApplicationServices,
  installManagedRuntime,
  loadProcessStartup,
  type ProcessStartup,
  StartupFailure
} from "./runtime.js"

const fatalExitMilliseconds = 10_000

type SentenceReason = "acquisition" | "config" | "defect" | "endpoint" | "exporter" | "protocol"

type Signal = ObservabilityInitializationError["signal"]

type StartupStage = StartupFailure["stage"]

const writeStderr = (sentence: string): void => {
  try {
    process.stderr.write(`${sentence}\n`)
  } catch {
    // A failed diagnostic write does not change the exit status.
  }
}

const diagnosticReason = (reason: StartupFailure["reason"]): SentenceReason =>
  reason === "observability-initialization" ? "defect" : reason

const sentenceFor = (
  failure: StartupFailure,
  signal: Signal | undefined,
  signalReason: SentenceReason | undefined
): string => {
  if (failure.stage === "observability" && signal !== undefined && signalReason !== undefined) {
    return `pre-ets-frontend: startup failed during observability signal=${signal} reason=${signalReason}`
  }
  return `pre-ets-frontend: startup failed during ${failure.stage} reason=${diagnosticReason(failure.reason)}`
}

const classify = (error: unknown, stage: StartupStage): {
  readonly failure: StartupFailure
  readonly signal: Signal | undefined
  readonly signalReason: SentenceReason | undefined
} => {
  if (error instanceof ObservabilityInitializationError) {
    return {
      failure: new StartupFailure({ reason: "observability-initialization", stage: "observability" }),
      signal: error.signal,
      signalReason: error.reason
    }
  }
  if (error instanceof Redis.RedisError) {
    return {
      failure: new StartupFailure({ reason: "acquisition", stage: "application-acquisition" }),
      signal: undefined,
      signalReason: undefined
    }
  }
  if (error instanceof Config.ConfigError) {
    return {
      failure: new StartupFailure({ reason: "config", stage: "configuration" }),
      signal: undefined,
      signalReason: undefined
    }
  }
  return {
    failure: new StartupFailure({ reason: "defect", stage }),
    signal: undefined,
    signalReason: undefined
  }
}

/** Builds the production runtime and publishes it for request handlers. */
export const startProductionRuntime = (): Promise<void> => {
  let stage: StartupStage = "configuration"
  let managed: ManagedRuntime.ManagedRuntime<ApplicationServices, unknown> | undefined
  let disposal: Promise<void> | undefined
  let fatal = false
  let shuttingDown = false

  const disposeOnce = (): Promise<void> => {
    if (disposal === undefined) {
      const current = managed
      disposal = current === undefined ?
        Promise.resolve() :
        current.dispose().then(() => undefined, () => undefined)
    }
    return disposal
  }

  const onSignal = () => {
    if (fatal || shuttingDown) return
    shuttingDown = true
    void disposeOnce().then(() => {
      process.exit(0)
    })
  }
  process.on("SIGTERM", onSignal)
  process.on("SIGINT", onSignal)

  const fail = async (error: unknown): Promise<never> => {
    fatal = true
    const timer = setTimeout(() => {
      process.exit(1)
    }, fatalExitMilliseconds)
    const classified = classify(error, stage)
    const sentence = sentenceFor(classified.failure, classified.signal, classified.signalReason)
    if (stage === "application-acquisition" && managed !== undefined) {
      try {
        await managed.runPromise(Effect.logError(sentence).pipe(Effect.timeout("1 second")))
      } catch {
        writeStderr(sentence)
      }
    } else {
      writeStderr(sentence)
    }
    await disposeOnce()
    clearTimeout(timer)
    process.exit(1)
  }

  const productionRedis = (url: string) =>
    Layer.unwrap(Effect.sync(() => {
      stage = "application-acquisition"
      return NodeRedis.layer({
        disableOfflineQueue: true,
        pingInterval: 1_000,
        socket: { socketTimeout: 5_000 },
        url
      })
    }))

  return Effect.runPromise(loadProcessStartup).then(async (startup: ProcessStartup) => {
    stage = "observability"
    await Effect.runPromise(selectObservability(startup.otel))
    const infrastructure = Layer.mergeAll(NodeServices.layer, productionRedis(startup.server.redis.url))
    const layer = applicationLayer(startup, infrastructure)
    managed = ManagedRuntime.make(layer)
    await managed.runPromise(Effect.void)
    installManagedRuntime(managed)
  }).catch((error: unknown) => fail(error))
}
