import type { Resource } from "@effect/opentelemetry/Resource"

import { makeNodeSdkConfiguration} from './observability/sdk.ts';

import * as NodeSdk from "@effect/opentelemetry/NodeSdk"
import { Effect, Layer, Schema } from "effect"

import type { OtelSettings } from "./config/index.js"

const ObservabilityInitializationErrorTag = "@pathableai/pre-ets-frontend/ObservabilityInitializationError"

export class ObservabilityInitializationError extends Schema.TaggedError<ObservabilityInitializationError>()(
  ObservabilityInitializationErrorTag,
  {
    cause: Schema.instanceOf(globalThis.Error),
  }
) {}

export const observabilityLayer = (input: {
  readonly otel: OtelSettings
}): Layer.Layer<Resource, ObservabilityInitializationError, never> => {
  if (input.otel.disabled) {
    return NodeSdk.layerEmpty
  } else {
    const configuration = makeNodeSdkConfiguration(input.otel).pipe(
      Effect.mapError(
        cause => new ObservabilityInitializationError({ cause }),
      )
    );
    return NodeSdk.layer(configuration);
  }
}
