import type { Resource } from "@effect/opentelemetry/Resource"

import * as NodeSdk from "@effect/opentelemetry/NodeSdk"
import { Effect, type Layer, Schema } from "effect"

import type { OtelSettings } from "./config.js"

import { makeNodeSdkConfiguration } from "./observability/sdk.js"

export class ObservabilityInitializationError extends Schema.TaggedError<ObservabilityInitializationError>()(
  "ObservabilityInitializationError",
  { cause: Schema.Defect() }
) {}

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
