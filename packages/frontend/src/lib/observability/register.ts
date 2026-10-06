import type { Configuration } from "@vercel/otel"

import { registerOTel } from "@vercel/otel"

import { AttributeSanitizingSpanProcessor, attributesFromHeadersSafe } from "./attributes.ts"
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
  readonly registerOTelFn?: (options: Configuration) => void
}

export type ObservabilityRegisterResult =
  | { readonly config: ObservabilityEnabledConfig; readonly status: "registered" }
  | { readonly reason: string; readonly status: "fail-soft" }
  | { readonly reason: string; readonly status: "refuse-to-start" }
  | { readonly status: "disabled" }
  | { readonly status: "sdk-disabled" }

const DEFAULT_DIAGNOSTIC_PREFIX = "[observability]"

/**
 * Builds the @vercel/otel configuration used by the instrumentation host path.
 * Attribute sanitization is wired into spanProcessors so export cannot bypass it.
 */
export function buildVercelOtelConfiguration(
  config: ObservabilityEnabledConfig
): Configuration {
  return {
    attributesFromHeaders: attributesFromHeadersSafe,
    serviceName: config.serviceName,
    spanProcessors: [new AttributeSanitizingSpanProcessor(), "auto"],
    traceSampler: "always_on"
  }
}

export function formatObservabilityDiagnostic(
  decision: ObservabilityConfigDecision
): string {
  switch (decision.kind) {
    case "disabled":
      return `${DEFAULT_DIAGNOSTIC_PREFIX} traces disabled (OTEL_TRACES_ENABLED not true/1)`
    case "enabled":
      return `${DEFAULT_DIAGNOSTIC_PREFIX} registering OTEL export to ${decision.tracesUrl}`
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
 * Applies observability startup policy and registers @vercel/otel when enabled.
 * Safe to call from Next instrumentation `register()` on the Node runtime only.
 */
export function registerObservability(
  deps: ObservabilityRegisterDeps = {}
): ObservabilityRegisterResult {
  const env = deps.env ?? process.env
  const logDiagnostic = deps.logDiagnostic ?? defaultLogDiagnostic
  const registerOTelFn = deps.registerOTelFn ?? registerOTel
  const refuseToStart = deps.refuseToStart ?? defaultRefuseToStart

  const decision = resolveObservabilityConfig(env)

  if (decision.kind === "disabled") {
    return { status: "disabled" }
  }

  if (decision.kind === "sdk-disabled") {
    logDiagnostic(formatObservabilityDiagnostic(decision))
    return { status: "sdk-disabled" }
  }

  if (decision.kind === "fail-soft") {
    logDiagnostic(formatObservabilityDiagnostic(decision))
    return { reason: decision.reason, status: "fail-soft" }
  }

  if (decision.kind === "refuse-to-start") {
    const message = formatObservabilityDiagnostic(decision)
    logDiagnostic(message)
    return refuseToStart(decision.reason)
  }

  // Apply endpoint/headers to process env so @vercel/otel's auto OTLP exporter
  // picks them up. Never log header values.
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = decision.otlpEndpoint
  process.env.OTEL_SERVICE_NAME = decision.serviceName
  if (Object.keys(decision.otlpHeaders).length > 0) {
    const existing = env.OTEL_EXPORTER_OTLP_HEADERS
    if (existing !== undefined && existing.trim() !== "") {
      process.env.OTEL_EXPORTER_OTLP_HEADERS = existing
    } else {
      process.env.OTEL_EXPORTER_OTLP_HEADERS = Object.entries(decision.otlpHeaders)
        .map(([key, value]) => `${key}=${value}`)
        .join(",")
    }
  }

  // Prefer HTTP/protobuf for local otel-lgtm on 4318 when unset.
  process.env.OTEL_EXPORTER_OTLP_PROTOCOL ??= "http/protobuf"

  logDiagnostic(formatObservabilityDiagnostic(decision))
  registerOTelFn(buildVercelOtelConfiguration(decision))

  return { config: decision, status: "registered" }
}

function defaultLogDiagnostic(message: string): void {
  console.error(message)
}

function defaultRefuseToStart(reason: string): never {
  const error = new Error(formatObservabilityDiagnostic({ kind: "refuse-to-start", reason }))
  error.name = "ObservabilityConfigurationError"
  throw error
}
