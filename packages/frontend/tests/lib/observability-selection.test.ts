import { assert, it } from "@effect/vitest"
import { fc, test } from "@fast-check/vitest"
import { Cause, Effect, Exit, Option } from "effect"
import { describe, expect } from "vitest"

import { ObservabilityInitializationError, selectObservability } from "../../src/lib/observability.ts"

const absent = Option.none<string>()

const settings = (
  overrides: Partial<{
    readonly disabled: boolean
    readonly endpoint: Option.Option<string>
    readonly exportUrl: Option.Option<string>
    readonly headers: Option.Option<string>
    readonly logsEndpoint: Option.Option<string>
    readonly logsExporter: Option.Option<string>
    readonly logsExportUrl: Option.Option<string>
    readonly logsProtocol: Option.Option<string>
    readonly metricsEndpoint: Option.Option<string>
    readonly metricsExporter: Option.Option<string>
    readonly metricsExportUrl: Option.Option<string>
    readonly metricsProtocol: Option.Option<string>
    readonly protocol: Option.Option<string>
    readonly serviceName: Option.Option<string>
    readonly tracesExporter: Option.Option<string>
    readonly tracesHeaders: Option.Option<string>
    readonly tracesProtocol: Option.Option<string>
  }>
) => ({
  disabled: false,
  endpoint: absent,
  exportUrl: absent,
  headers: absent,
  logsEndpoint: absent,
  logsExporter: absent,
  logsExportUrl: absent,
  logsProtocol: absent,
  metricsEndpoint: absent,
  metricsExporter: absent,
  metricsExportUrl: absent,
  metricsProtocol: absent,
  protocol: absent,
  serviceName: absent,
  tracesExporter: absent,
  tracesHeaders: absent,
  tracesProtocol: absent,
  ...overrides
})

const initializationError = (exit: Exit.Exit<unknown, unknown>) => {
  if (!Exit.isFailure(exit)) return undefined
  const error = Cause.findErrorOption(exit.cause)
  if (Option.isNone(error) || !(error.value instanceof ObservabilityInitializationError)) return undefined
  return error.value
}

// Observability contract: disabled and unselected signals ignore malformed values; a selected
// invalid URL or protocol names the first failing signal. This file does not open a socket (V-004).
describe("selectObservability", () => {
  it.effect("ignores endpoint and protocol when the SDK is disabled", () =>
    Effect.gen(function*() {
      const selection = yield* selectObservability(settings({
        disabled: true,
        exportUrl: Option.some("not a url"),
        logsExportUrl: Option.some("not a url"),
        logsProtocol: Option.some("grpc"),
        metricsExportUrl: Option.some("not a url"),
        protocol: Option.some("grpc")
      }))
      assert.deepEqual(selection, { logs: undefined, metrics: undefined, traces: undefined })
    }))

  it.effect("ignores a signal whose exporter is none", () =>
    Effect.gen(function*() {
      const selection = yield* selectObservability(settings({
        exportUrl: Option.some("http://127.0.0.1:4318/v1/traces"),
        logsExporter: Option.some("none"),
        logsExportUrl: Option.some("http://127.0.0.1:4318/v1/logs"),
        logsProtocol: Option.some("grpc"),
        metricsExportUrl: Option.some("http://127.0.0.1:4318/v1/metrics"),
        protocol: Option.some("http/protobuf")
      }))
      assert.deepEqual(selection.logs, undefined)
      assert.deepEqual(selection.traces, {
        protocol: "http/protobuf",
        url: "http://127.0.0.1:4318/v1/traces"
      })
      assert.deepEqual(selection.metrics, {
        protocol: "http/protobuf",
        url: "http://127.0.0.1:4318/v1/metrics"
      })
    }))

  it.effect("leaves a signal absent when neither its endpoint nor the base endpoint is set", () =>
    Effect.gen(function*() {
      const selection = yield* selectObservability(settings({
        logsProtocol: Option.some("grpc"),
        protocol: Option.some("grpc"),
        tracesExporter: Option.some("console"),
        tracesProtocol: Option.some("grpc")
      }))
      assert.deepEqual(selection, { logs: undefined, metrics: undefined, traces: undefined })
    }))

  it.effect("fails the first selected signal whose exporter is neither otlp nor none", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(selectObservability(settings({
        exportUrl: Option.some("http://127.0.0.1:4318/v1/traces"),
        logsExporter: Option.some("console"),
        logsExportUrl: Option.some("http://127.0.0.1:4318/v1/logs"),
        metricsExporter: Option.some("console"),
        metricsExportUrl: Option.some("http://127.0.0.1:4318/v1/metrics"),
        tracesExporter: Option.some("console")
      })))
      const error = initializationError(exit)
      assert.strictEqual(error?.reason, "exporter")
      assert.strictEqual(error?.signal, "traces")
    }))

  it.effect("names traces when the selected protocol is grpc", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(selectObservability(settings({
        exportUrl: Option.some("http://127.0.0.1:4318/v1/traces"),
        logsExportUrl: Option.some("http://127.0.0.1:4318/v1/logs"),
        logsProtocol: Option.some("grpc"),
        protocol: Option.some("grpc")
      })))
      const error = initializationError(exit)
      assert.strictEqual(error?.reason, "protocol")
      assert.strictEqual(error?.signal, "traces")
    }))

  it.effect("names traces when the selected endpoint is not a URL", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(selectObservability(settings({
        exportUrl: Option.some("not a url"),
        logsExportUrl: Option.some("also not a url"),
        metricsExportUrl: Option.some("still not a url"),
        protocol: Option.some("http/json")
      })))
      const error = initializationError(exit)
      assert.strictEqual(error?.reason, "endpoint")
      assert.strictEqual(error?.signal, "traces")
    }))

  it.effect("selects a syntactically valid URL without opening a socket", () =>
    Effect.gen(function*() {
      const selection = yield* selectObservability(settings({
        exportUrl: Option.some("http://127.0.0.1:9/v1/traces"),
        logsExportUrl: Option.some("http://127.0.0.1:9/v1/logs"),
        metricsExportUrl: Option.some("http://127.0.0.1:9/v1/metrics"),
        protocol: Option.some("http/protobuf"),
        tracesProtocol: Option.some("http/json")
      }))
      assert.deepEqual(selection.traces, {
        protocol: "http/json",
        url: "http://127.0.0.1:9/v1/traces"
      })
      assert.deepEqual(selection.metrics, {
        protocol: "http/protobuf",
        url: "http://127.0.0.1:9/v1/metrics"
      })
      assert.deepEqual(selection.logs, {
        protocol: "http/protobuf",
        url: "http://127.0.0.1:9/v1/logs"
      })
    }))

  test.prop([fc.string(), fc.string()])(
    "disabled SDK and exporter none ignore arbitrary endpoint and protocol strings",
    async (endpoint, protocol) => {
      const disabled = await Effect.runPromise(selectObservability(settings({
        disabled: true,
        endpoint: Option.some(endpoint),
        exportUrl: Option.some(endpoint),
        logsEndpoint: Option.some(endpoint),
        logsExportUrl: Option.some(endpoint),
        logsProtocol: Option.some(protocol),
        metricsEndpoint: Option.some(endpoint),
        metricsExportUrl: Option.some(endpoint),
        metricsProtocol: Option.some(protocol),
        protocol: Option.some(protocol),
        tracesProtocol: Option.some(protocol)
      })))
      expect(disabled).toEqual({ logs: undefined, metrics: undefined, traces: undefined })

      const unselected = await Effect.runPromise(selectObservability(settings({
        exportUrl: Option.some(endpoint),
        logsExporter: Option.some("none"),
        logsExportUrl: Option.some(endpoint),
        logsProtocol: Option.some(protocol),
        metricsExporter: Option.some("none"),
        metricsExportUrl: Option.some(endpoint),
        metricsProtocol: Option.some(protocol),
        protocol: Option.some(protocol),
        tracesExporter: Option.some("none"),
        tracesProtocol: Option.some(protocol)
      })))
      expect(unselected).toEqual({ logs: undefined, metrics: undefined, traces: undefined })
    }
  )
})
