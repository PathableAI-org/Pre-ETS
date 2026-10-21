import { assert, it } from "@effect/vitest"
import { ConfigProvider, Effect, Exit, Option } from "effect"
import { describe } from "vitest"

import { OtelConfig } from "../../src/lib/config"

const provide = (env: Record<string, string>) =>
  Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(env))

describe("OtelConfig", () => {
  it.effect("succeeds when every variable is unset", () =>
    Effect.gen(function*() {
      const config = yield* OtelConfig
      assert.isFalse(config.disabled)
      assert.deepEqual(config.endpoint, Option.none())
      assert.deepEqual(config.headers, Option.none())
      assert.deepEqual(config.protocol, Option.none())
      assert.deepEqual(config.serviceName, Option.none())
      assert.deepEqual(config.tracesHeaders, Option.none())
      assert.deepEqual(config.tracesProtocol, Option.none())
    }).pipe(provide({})))

  it.effect("treats blank values as unset", () =>
    Effect.gen(function*() {
      const config = yield* OtelConfig
      assert.isFalse(config.disabled)
      assert.deepEqual(config.endpoint, Option.none())
      assert.deepEqual(config.headers, Option.none())
      assert.deepEqual(config.serviceName, Option.none())
    }).pipe(provide({
      OTEL_EXPORTER_OTLP_ENDPOINT: "  ",
      OTEL_EXPORTER_OTLP_HEADERS: "",
      OTEL_SDK_DISABLED: "   ",
      OTEL_SERVICE_NAME: " "
    })))

  it.effect("records a disabled SDK without requiring an endpoint", () =>
    Effect.gen(function*() {
      const config = yield* OtelConfig
      assert.isTrue(config.disabled)
      assert.deepEqual(config.endpoint, Option.some("http://127.0.0.1:4318"))
    }).pipe(provide({
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
      OTEL_SDK_DISABLED: "true"
    })))

  it.effect("uses the traces endpoint when both endpoints are set", () =>
    Effect.gen(function*() {
      const config = yield* OtelConfig
      assert.isFalse(config.disabled)
      assert.deepEqual(config.endpoint, Option.some("http://127.0.0.1:4318/v1/traces"))
      assert.deepEqual(config.headers, Option.some("Authorization=Bearer test-token"))
      assert.deepEqual(config.protocol, Option.some("http/protobuf"))
      assert.deepEqual(config.serviceName, Option.some("pre-ets-frontend"))
      assert.deepEqual(config.tracesHeaders, Option.some("X-Trace=1"))
      assert.deepEqual(config.tracesProtocol, Option.some("http/json"))
    }).pipe(provide({
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
      OTEL_EXPORTER_OTLP_HEADERS: " Authorization=Bearer test-token ",
      OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://127.0.0.1:4318/v1/traces",
      OTEL_EXPORTER_OTLP_TRACES_HEADERS: "X-Trace=1",
      OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: "http/json",
      OTEL_SERVICE_NAME: " pre-ets-frontend "
    })))

  it.effect("does not select an endpoint from headers, protocol, or service name", () =>
    Effect.gen(function*() {
      const config = yield* OtelConfig
      assert.isFalse(config.disabled)
      assert.deepEqual(config.endpoint, Option.none())
      assert.deepEqual(config.headers, Option.some("Authorization=Bearer test-token"))
      assert.deepEqual(config.protocol, Option.some("http/protobuf"))
      assert.deepEqual(config.serviceName, Option.some("pre-ets-frontend"))
    }).pipe(provide({
      OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Bearer test-token",
      OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
      OTEL_SERVICE_NAME: "pre-ets-frontend"
    })))

  it.effect("rejects a non-boolean OTEL_SDK_DISABLED", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(OtelConfig)
      assert.isTrue(Exit.isFailure(exit))
    }).pipe(provide({ OTEL_SDK_DISABLED: "maybe" })))
})
