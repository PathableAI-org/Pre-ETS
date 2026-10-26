import { Config, Option } from "effect"

/** Missing and empty values are absent. The env provider treats "" as missing. */
const optionalString = (name: string): Config.Config<Option.Option<string>> =>
  Config.option(Config.NonEmptyString(name))

const disabled = Config.Boolean("OTEL_SDK_DISABLED").pipe(Config.withDefault(false))

const baseEndpoint = optionalString("OTEL_EXPORTER_OTLP_ENDPOINT")

const specificOrBase = (specific: Config.Config<Option.Option<string>>): Config.Config<Option.Option<string>> =>
  Config.all({ base: baseEndpoint, specific }).pipe(
    Config.map(({ base, specific: selected }) => Option.isSome(selected) ? selected : base)
  )

/** A specific endpoint is already that signal's URL. A base endpoint gains one OTLP path. */
const exportUrlFor = (
  specific: Config.Config<Option.Option<string>>,
  path: "logs" | "metrics" | "traces"
): Config.Config<Option.Option<string>> =>
  Config.all({ base: baseEndpoint, specific }).pipe(Config.map(({ base, specific: selected }) => {
    if (Option.isSome(selected)) return selected
    if (Option.isNone(base)) return Option.none()
    const trimmed = base.value.endsWith("/") ? base.value.slice(0, -1) : base.value
    return Option.some(`${trimmed}/v1/${path}`)
  }))

const tracesEndpoint = optionalString("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
const logsEndpoint = optionalString("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT")
const metricsEndpoint = optionalString("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT")

/**
 * Optional OpenTelemetry process settings.
 *
 * No field is required. A missing or empty value stays unset. This parser does not
 * check that an endpoint is a URL. Selection later rejects an unusable selected
 * signal without logging the value. An unreachable collector remains a best-effort
 * export problem. `disabled` uses Effect's boolean literals. `exportUrl` is the
 * traces endpoint, or the base endpoint plus `/v1/traces`. Logs and metrics follow
 * the same path rule on their own export URLs.
 */
export interface OtelSettings {
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
}

export const OtelConfig: Config.Config<OtelSettings> = Config.all({
  disabled,
  endpoint: specificOrBase(tracesEndpoint),
  exportUrl: exportUrlFor(tracesEndpoint, "traces"),
  headers: optionalString("OTEL_EXPORTER_OTLP_HEADERS"),
  logsEndpoint,
  logsExporter: optionalString("OTEL_LOGS_EXPORTER"),
  logsExportUrl: exportUrlFor(logsEndpoint, "logs"),
  logsProtocol: optionalString("OTEL_EXPORTER_OTLP_LOGS_PROTOCOL"),
  metricsEndpoint,
  metricsExporter: optionalString("OTEL_METRICS_EXPORTER"),
  metricsExportUrl: exportUrlFor(metricsEndpoint, "metrics"),
  metricsProtocol: optionalString("OTEL_EXPORTER_OTLP_METRICS_PROTOCOL"),
  protocol: optionalString("OTEL_EXPORTER_OTLP_PROTOCOL"),
  serviceName: optionalString("OTEL_SERVICE_NAME"),
  tracesExporter: optionalString("OTEL_TRACES_EXPORTER"),
  tracesHeaders: optionalString("OTEL_EXPORTER_OTLP_TRACES_HEADERS"),
  tracesProtocol: optionalString("OTEL_EXPORTER_OTLP_TRACES_PROTOCOL")
})
