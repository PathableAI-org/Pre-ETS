import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpClient } from "effect/http"
import { type OtlpExporter, OtlpSerialization, OtlpTracer } from "effect/observability"

import {
  type ObservabilityConfigDecision,
  type ObservabilityEnabledConfig,
  type ObservabilityEnv,
  resolveObservabilityConfig
} from "./config.ts"

export interface ObservabilityRegisterDeps {
  readonly env?: ObservabilityEnv
  readonly logDiagnostic?: (message: string) => void
  readonly refuseToStart?: (reason: string) => never
}

export type ObservabilityRegisterResult =
  | {
    readonly config: ObservabilityEnabledConfig
    readonly layer: Layer.Layer<OtlpExporter.Flusher>
    readonly status: "registered"
  }
  | { readonly layer: Layer.Layer<never>; readonly reason: string; readonly status: "fail-soft" }
  | { readonly layer: Layer.Layer<never>; readonly status: "disabled" }
  | { readonly layer: Layer.Layer<never>; readonly status: "sdk-disabled" }

const DEFAULT_DIAGNOSTIC_PREFIX = "[observability]"

/**
 * Builds the Effect OTLP tracing Layer for an enabled config decision.
 * Attribute sanitization happens at annotate/producer boundary (see attributes.ts).
 */
export function buildOtlpTracingLayer(
  config: ObservabilityEnabledConfig
): Layer.Layer<OtlpExporter.Flusher> {
  return OtlpTracer.layer({
    headers: config.otlpHeaders,
    resource: {
      serviceName: config.serviceName
    },
    url: config.tracesUrl
  }).pipe(
    Layer.provide(OtlpSerialization.layerProtobuf),
    Layer.provide(otlpExportHttpClientLayer())
  )
}

export function formatObservabilityDiagnostic(
  decision: ObservabilityConfigDecision
): string {
  switch (decision.kind) {
    case "disabled":
      return `${DEFAULT_DIAGNOSTIC_PREFIX} traces disabled (OTEL_TRACES_ENABLED not true/1)`
    case "enabled":
      return `${DEFAULT_DIAGNOSTIC_PREFIX} registering Effect OtlpTracer export to ${decision.tracesUrl}`
    case "fail-soft":
      return `${DEFAULT_DIAGNOSTIC_PREFIX} enabled but invalid config (${decision.reason}); continuing without export`
    case "refuse-to-start":
      return `${DEFAULT_DIAGNOSTIC_PREFIX} enabled but invalid config (${decision.reason}); refusing to start in production`
    case "sdk-disabled":
      return `${DEFAULT_DIAGNOSTIC_PREFIX} OTEL_SDK_DISABLED=true; skipping export`
  }
}

/** True during `next build` when instrumentation may load without serving. */
export function isNextProductionBuildPhase(env: ObservabilityEnv = process.env): boolean {
  return env.NEXT_PHASE === "phase-production-build"
}

/**
 * Applies observability startup policy and returns an Effect Layer.
 * Safe to call from the frontend ManagedRuntime boot path on the Node runtime only.
 */
export function resolveObservabilityLayer(
  deps: ObservabilityRegisterDeps = {}
): ObservabilityRegisterResult {
  const env = deps.env ?? process.env
  const logDiagnostic = deps.logDiagnostic ?? defaultLogDiagnostic
  const refuseToStart = deps.refuseToStart ?? defaultRefuseToStart

  const decision = resolveObservabilityConfig(env)

  if (decision.kind === "disabled") {
    return { layer: Layer.empty, status: "disabled" }
  }

  if (decision.kind === "sdk-disabled") {
    logDiagnostic(formatObservabilityDiagnostic(decision))
    return { layer: Layer.empty, status: "sdk-disabled" }
  }

  if (decision.kind === "fail-soft") {
    logDiagnostic(formatObservabilityDiagnostic(decision))
    return { layer: Layer.empty, reason: decision.reason, status: "fail-soft" }
  }

  if (decision.kind === "refuse-to-start") {
    logDiagnostic(formatObservabilityDiagnostic(decision))
    return refuseToStart(decision.reason)
  }

  logDiagnostic(formatObservabilityDiagnostic(decision))
  return {
    config: decision,
    layer: buildOtlpTracingLayer(decision),
    status: "registered"
  }
}

function defaultLogDiagnostic(message: string): void {
  console.error(message)
}

function defaultRefuseToStart(reason: string): never {
  const error = new Error(formatObservabilityDiagnostic({ kind: "refuse-to-start", reason }))
  error.name = "ObservabilityConfigurationError"
  throw error
}

/**
 * HttpClient used by OtlpTracer. Logs a fixed stderr line on export failure (SC-005)
 * without printing header values or request bodies.
 */
function otlpExportHttpClientLayer(): Layer.Layer<HttpClient.HttpClient> {
  return Layer.effect(
    HttpClient.HttpClient,
    Effect.gen(function*() {
      const client = yield* HttpClient.HttpClient
      return client.pipe(
        HttpClient.tapError(() =>
          Effect.sync(() => {
            console.error(`${DEFAULT_DIAGNOSTIC_PREFIX} OTLP export failed`)
          })
        )
      )
    })
  ).pipe(
    Layer.provide(FetchHttpClient.layer)
  )
}
