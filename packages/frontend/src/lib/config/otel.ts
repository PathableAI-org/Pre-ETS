import { Config, Option } from "effect"

/** Missing and empty values are absent. The env provider treats "" as missing. */
const optionalString = (name: string): Config.Config<Option.Option<string>> =>
  Config.option(Config.NonEmptyString(name))

const disabled = Config.Boolean("OTEL_SDK_DISABLED").pipe(Config.withDefault(false))

const endpoints = Config.all({
  base: optionalString("OTEL_EXPORTER_OTLP_ENDPOINT"),
  traces: optionalString("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
})

const endpoint = endpoints.pipe(Config.map(({ base, traces }) => Option.isSome(traces) ? traces : base))

/** Base endpoints gain the OTLP traces path. A traces endpoint is already that URL. */
const exportUrl = endpoints.pipe(Config.map(({ base, traces }) => {
  if (Option.isSome(traces)) return traces
  if (Option.isNone(base)) return Option.none()
  const trimmed = base.value.endsWith("/") ? base.value.slice(0, -1) : base.value
  return Option.some(`${trimmed}/v1/traces`)
}))

/**
 * Optional OpenTelemetry process settings.
 *
 * No field is required. A missing or empty value stays unset. This parser does not
 * check that an endpoint is a URL. Startup rejects an unparseable export URL without
 * logging it. An unreachable collector remains a best-effort export problem.
 * `disabled` uses Effect's boolean literals (`true`, `false`, `yes`, `no`, `on`, `off`,
 * `1`, `0`, `y`, `n`). `exportUrl` is the traces endpoint, or the base endpoint plus
 * `/v1/traces`. A missing or empty value is absent.
 */
export const OtelConfig = Config.all({
  disabled,
  endpoint,
  exportUrl,
  headers: optionalString("OTEL_EXPORTER_OTLP_HEADERS"),
  protocol: optionalString("OTEL_EXPORTER_OTLP_PROTOCOL"),
  serviceName: optionalString("OTEL_SERVICE_NAME"),
  tracesHeaders: optionalString("OTEL_EXPORTER_OTLP_TRACES_HEADERS"),
  tracesProtocol: optionalString("OTEL_EXPORTER_OTLP_TRACES_PROTOCOL")
})
