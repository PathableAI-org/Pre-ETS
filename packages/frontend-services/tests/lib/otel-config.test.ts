import { assert, it } from "@effect/vitest"
import { ConfigProvider, Effect, Exit, Option } from "effect"
import { describe } from "vitest"

import { OtelConfig } from "../../src/config/index.ts"

const provide = (env: Record<string, string>) =>
  Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(env))

describe("OtelConfig", () => {
  it.effect("succeeds when every variable is unset", () =>
    Effect.gen(function*() {
      const config = yield* OtelConfig
      assert.isFalse(config.disabled)
      assert.deepEqual(config.endpoint, Option.none())
      assert.deepEqual(config.exportUrl, Option.none())
      assert.deepEqual(config.headers, Option.none())
      assert.deepEqual(config.protocol, Option.none())
      assert.deepEqual(config.serviceName, Option.none())
      assert.deepEqual(config.tracesHeaders, Option.none())
      assert.deepEqual(config.tracesProtocol, Option.none())
    }).pipe(provide({})))

  it.effect("treats empty values as unset", () =>
    Effect.gen(function*() {
      const config = yield* OtelConfig
      assert.isFalse(config.disabled)
      assert.deepEqual(config.endpoint, Option.none())
      assert.deepEqual(config.exportUrl, Option.none())
      assert.deepEqual(config.headers, Option.none())
      assert.deepEqual(config.serviceName, Option.none())
    }).pipe(provide({
      OTEL_EXPORTER_OTLP_ENDPOINT: "",
      OTEL_EXPORTER_OTLP_HEADERS: "",
      OTEL_SDK_DISABLED: "",
      OTEL_SERVICE_NAME: ""
    })))

  it.effect("rejects a whitespace OTEL_SDK_DISABLED", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(OtelConfig)
      assert.isTrue(Exit.isFailure(exit))
    }).pipe(provide({ OTEL_SDK_DISABLED: "   " })))

  it.effect("treats false boolean literals as enabled", () =>
    Effect.forEach(["false", "0", "off", "no", "n"], (value) =>
      Effect.gen(function*() {
        const config = yield* OtelConfig
        assert.isFalse(config.disabled)
        assert.deepEqual(config.exportUrl, Option.some("http://127.0.0.1:4318/v1/traces"))
      }).pipe(provide({
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318/",
        OTEL_SDK_DISABLED: value
      }))))

  it.effect("records a disabled SDK without requiring an endpoint", () =>
    Effect.gen(function*() {
      const config = yield* OtelConfig
      assert.isTrue(config.disabled)
      assert.deepEqual(config.endpoint, Option.some("http://127.0.0.1:4318"))
      assert.deepEqual(config.exportUrl, Option.some("http://127.0.0.1:4318/v1/traces"))
    }).pipe(provide({
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
      OTEL_SDK_DISABLED: "true"
    })))

  it.effect("uses the traces endpoint when both endpoints are set", () =>
    Effect.gen(function*() {
      const config = yield* OtelConfig
      assert.isFalse(config.disabled)
      assert.deepEqual(config.endpoint, Option.some("http://127.0.0.1:4318/v1/traces"))
      assert.deepEqual(config.exportUrl, Option.some("http://127.0.0.1:4318/v1/traces"))
      assert.deepEqual(config.headers, Option.some("Authorization=Bearer test-token"))
      assert.deepEqual(config.protocol, Option.some("http/protobuf"))
      assert.deepEqual(config.serviceName, Option.some("pre-ets-frontend"))
      assert.deepEqual(config.tracesHeaders, Option.some("X-Trace=1"))
      assert.deepEqual(config.tracesProtocol, Option.some("http/json"))
    }).pipe(provide({
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
      OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Bearer test-token",
      OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://127.0.0.1:4318/v1/traces",
      OTEL_EXPORTER_OTLP_TRACES_HEADERS: "X-Trace=1",
      OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: "http/json",
      OTEL_SERVICE_NAME: "pre-ets-frontend"
    })))

  it.effect("does not select an endpoint from headers, protocol, or service name", () =>
    Effect.gen(function*() {
      const config = yield* OtelConfig
      assert.isFalse(config.disabled)
      assert.deepEqual(config.endpoint, Option.none())
      assert.deepEqual(config.exportUrl, Option.none())
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

  // OtelConfig contract: disabled or unselected strings still decode. URL syntax is not checked here (V-006).
  it.effect("leaves logs, metrics, and exporter fields unset", () =>
    Effect.gen(function*() {
      const config = yield* OtelConfig
      assert.deepEqual(config.logsEndpoint, Option.none())
      assert.deepEqual(config.logsExporter, Option.none())
      assert.deepEqual(config.logsExportUrl, Option.none())
      assert.deepEqual(config.logsProtocol, Option.none())
      assert.deepEqual(config.metricsEndpoint, Option.none())
      assert.deepEqual(config.metricsExporter, Option.none())
      assert.deepEqual(config.metricsExportUrl, Option.none())
      assert.deepEqual(config.metricsProtocol, Option.none())
      assert.deepEqual(config.tracesExporter, Option.none())
    }).pipe(provide({})))

  it.effect("treats empty logs and metrics values as unset", () =>
    Effect.gen(function*() {
      const config = yield* OtelConfig
      assert.deepEqual(config.logsEndpoint, Option.none())
      assert.deepEqual(config.logsExporter, Option.none())
      assert.deepEqual(config.logsExportUrl, Option.none())
      assert.deepEqual(config.logsProtocol, Option.none())
      assert.deepEqual(config.metricsEndpoint, Option.none())
      assert.deepEqual(config.metricsExporter, Option.none())
      assert.deepEqual(config.metricsExportUrl, Option.none())
      assert.deepEqual(config.metricsProtocol, Option.none())
      assert.deepEqual(config.tracesExporter, Option.none())
    }).pipe(provide({
      OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: "",
      OTEL_EXPORTER_OTLP_LOGS_PROTOCOL: "",
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: "",
      OTEL_EXPORTER_OTLP_METRICS_PROTOCOL: "",
      OTEL_LOGS_EXPORTER: "",
      OTEL_METRICS_EXPORTER: "",
      OTEL_TRACES_EXPORTER: ""
    })))

  it.effect("lets a logs or metrics endpoint win over the base export URL", () =>
    Effect.gen(function*() {
      const config = yield* OtelConfig
      assert.deepEqual(config.logsEndpoint, Option.some("http://127.0.0.1:4318/v1/logs"))
      assert.deepEqual(config.logsExportUrl, Option.some("http://127.0.0.1:4318/v1/logs"))
      assert.deepEqual(config.metricsEndpoint, Option.some("http://127.0.0.1:4318/v1/metrics"))
      assert.deepEqual(config.metricsExportUrl, Option.some("http://127.0.0.1:4318/v1/metrics"))
      assert.deepEqual(config.exportUrl, Option.some("http://127.0.0.1:4318/v1/traces"))
    }).pipe(provide({
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
      OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: "http://127.0.0.1:4318/v1/logs",
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: "http://127.0.0.1:4318/v1/metrics"
    })))

  it.effect("appends logs and metrics paths after removing one trailing slash", () =>
    Effect.gen(function*() {
      const config = yield* OtelConfig
      assert.deepEqual(config.logsEndpoint, Option.none())
      assert.deepEqual(config.logsExportUrl, Option.some("http://127.0.0.1:4318/v1/logs"))
      assert.deepEqual(config.metricsEndpoint, Option.none())
      assert.deepEqual(config.metricsExportUrl, Option.some("http://127.0.0.1:4318/v1/metrics"))
    }).pipe(provide({
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318/"
    })))

  it.effect("still decodes a disabled SDK, including the computed traces export URL", () =>
    Effect.gen(function*() {
      const config = yield* OtelConfig
      assert.isTrue(config.disabled)
      assert.deepEqual(config.exportUrl, Option.some("http://127.0.0.1:4318/v1/traces"))
      assert.deepEqual(config.logsExportUrl, Option.some("http://127.0.0.1:4318/v1/logs"))
      assert.deepEqual(config.metricsExportUrl, Option.some("http://127.0.0.1:4318/v1/metrics"))
      assert.deepEqual(config.logsExporter, Option.some("none"))
      assert.deepEqual(config.logsProtocol, Option.some("grpc"))
    }).pipe(provide({
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
      OTEL_EXPORTER_OTLP_LOGS_PROTOCOL: "grpc",
      OTEL_LOGS_EXPORTER: "none",
      OTEL_SDK_DISABLED: "true"
    })))
})
