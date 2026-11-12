import type { Resource } from "@effect/opentelemetry/Resource"

import * as NodeSdk from "@effect/opentelemetry/NodeSdk"
import { Context, Effect, Layer, Schema } from "effect"

import type { BrowserTracingSettings, OtelSettings } from "./config.js"

import { makeNodeSdkConfiguration } from "./observability/sdk.js"

export class ObservabilityInitializationError extends Schema.TaggedError<ObservabilityInitializationError>()(
  "ObservabilityInitializationError",
  { cause: Schema.Defect() }
) {}

/**
 * Sets the closed-set `preets.outcome` of the current span, as the verification telemetry conventions require
 * (docs/observability.md). Each traced operation documents its values in docs/session-state.md.
 */
export const annotateOutcome = (outcome: string): Effect.Effect<void> =>
  Effect.annotateCurrentSpan("preets.outcome", outcome)

export const observabilityLayer = (input: {
  readonly otel: OtelSettings
}): Layer.Layer<Resource, ObservabilityInitializationError> => {
  if (input.otel.disabled) {
    return NodeSdk.layerEmpty
  } else {
    const configuration = makeNodeSdkConfiguration(input.otel).pipe(
      Effect.mapError((cause) => new ObservabilityInitializationError({ cause }))
    )

    return NodeSdk.layer(configuration)
  }
}

/**
 * The effective browser-tracing settings for request-time readers: defined only when OTEL is enabled and
 * `BROWSER_TRACING_ENABLED` is true. The browser exports without collector headers, so building the layer warns once
 * when the server has headers, naming none of them (research D10).
 */
export class BrowserTracing extends Context.Service<BrowserTracing, {
  readonly settings: BrowserTracingSettings | undefined
}>()("BrowserTracing") {
  static readonly layer = (otel: OtelSettings): Layer.Layer<BrowserTracing> => {
    const settings = otel.disabled ? undefined : otel.browserTracing
    const warnAboutHeaders = settings !== undefined && !otel.disabled && Object.keys(otel.headers).length > 0
    return Layer.effect(
      BrowserTracing,
      Effect.as(
        Effect.when(
          Effect.logWarning("Browser tracing exports without collector headers"),
          Effect.succeed(warnAboutHeaders)
        ),
        BrowserTracing.of({ settings })
      )
    )
  }
}
