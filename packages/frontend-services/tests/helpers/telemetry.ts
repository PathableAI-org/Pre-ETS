/**
 * Telemetry for the code a test exercises, behind `pnpm test:telemetry` (docs/observability.md). Without the
 * `TEST_TELEMETRY` marker the layer is empty and no OpenTelemetry code runs. With it, the application's own
 * `observabilityLayer` is built once per test file from the settings the command prepared, and disposed after the
 * file's tests, so the file's records have left when it finishes. A build failure or an unreachable collector changes
 * no test result. The layer does not replace a test's clock, so a program under `TestClock`, a fixed `Clock`, or a
 * faked `Date` exports records stamped with that clock's time.
 */
import { Context, Effect, Layer, ManagedRuntime } from "effect"
import { afterAll } from "vitest"

import type { OtelEnabled } from "../../src/config.ts"

import { observabilityLayer } from "../../src/observability.ts"

const present = (value: string | undefined): string | undefined => value === "" ? undefined : value

/**
 * The plain settings the command prepared, or `undefined` when the run has no marker or lacks a setting the command
 * fills (endpoint, service name, timing). The command owns their defaults (scripts/test-run.ts); it prepares no
 * version, so the application's `UNKNOWN` applies.
 */
const settings = (env: NodeJS.ProcessEnv): OtelEnabled | undefined => {
  const endpoint = present(env.OTEL_EXPORTER_OTLP_ENDPOINT)
  const serviceName = present(env.OTEL_SERVICE_NAME)
  const exportTiming = env.TELEMETRY_EXPORT_TIMING
  const usable = env.TEST_TELEMETRY === "true" && endpoint !== undefined && URL.canParse(endpoint) &&
    serviceName !== undefined && (exportTiming === "batch" || exportTiming === "immediate")
  if (!usable) return undefined
  return {
    browserTracing: undefined,
    disabled: false,
    endpoint: new URL(endpoint),
    exportTiming,
    headers: {},
    serviceName,
    serviceVersion: present(env.OTEL_SERVICE_VERSION) ?? "UNKNOWN"
  }
}

const fileTelemetry = (otel: OtelEnabled): Layer.Layer<never> => {
  const runtime = ManagedRuntime.make(observabilityLayer({ otel }))
  afterAll(() => runtime.dispose())
  return Layer.effectContext(runtime.contextEffect.pipe(Effect.catch(() => Effect.succeed(Context.empty()))))
}

const otel = settings(process.env)

/** Empty unless the test run was started through `pnpm test:telemetry`. Never fails. */
export const testTelemetry: Layer.Layer<never> = otel === undefined ? Layer.empty : fileTelemetry(otel)
