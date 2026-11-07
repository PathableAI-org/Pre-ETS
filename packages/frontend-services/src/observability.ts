import type { Resource } from "@effect/opentelemetry/Resource"

import * as NodeSdk from "@effect/opentelemetry/NodeSdk"
import { Effect, type Layer, Schema } from "effect"

import type { OtelSettings } from "./config/index.js"
import type { OtelSdkError } from "./observability/error.ts"

import { makeNodeSdkConfiguration } from "./observability/sdk.js"

const ObservabilityInitializationErrorTag = "@pathableai/pre-ets-frontend/ObservabilityInitializationError"

export class ObservabilityInitializationError extends Schema.TaggedError<ObservabilityInitializationError>()(
  ObservabilityInitializationErrorTag,
  {
    cause: Schema.instanceOf(globalThis.Error)
  }
) {
  public static new(cause: OtelSdkError) {
    return new ObservabilityInitializationError({ cause })
  }
}

export const observabilityLayer = (input: {
  readonly otel: OtelSettings
}): Layer.Layer<Resource, ObservabilityInitializationError> => {
  if (input.otel.disabled) {
    return NodeSdk.layerEmpty
  } else {
    const configuration = makeNodeSdkConfiguration(input.otel).pipe(
      Effect.mapError(
        (cause) => ObservabilityInitializationError.new(cause)
      )
    )

    return NodeSdk.layer(configuration)
  }
}
