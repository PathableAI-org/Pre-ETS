import { Config, Option, Schema, SchemaIssue } from "effect"

export interface OtelDisabled {
  readonly disabled: true
}

export interface OtelEnabled {
  readonly disabled: false
  readonly endpoint: URL
  readonly headers: Readonly<Record<string, string>>
  readonly serviceName: string
  readonly serviceVersion: string
}

export type OtelSettings = OtelDisabled | OtelEnabled

const disabled = Config.Boolean("OTEL_SDK_DISABLED")
const endpoint = Config.URL("OTEL_EXPORTER_OTLP_ENDPOINT")
const headers = Config.Record(
  Schema.String,
  Schema.String,
  "OTEL_EXPORTER_OTLP_HEADERS",
  { trim: true }
)
const serviceName = Config.NonEmptyString("OTEL_SERVICE_NAME")
const serviceVersion = Config.NonEmptyString("OTEL_SERVICE_VERSION")

const rawConfig = Config.all({
  disabled: Config.withDefault(disabled, false),
  endpoint: Config.option(endpoint),
  headers: Config.withDefault(headers, {}),
  serviceName: Config.option(serviceName),
  serviceVersion: Config.withDefault(serviceVersion, "UNKNOWN")
})

const parseRawConfig = (
  config: Config.Success<typeof rawConfig>
): Config.Config<OtelSettings> => {
  if (config.disabled) {
    return Config.succeed({ disabled: true } as const)
  }

  if (Option.isNone(config.endpoint)) {
    const issue = new SchemaIssue.InvalidValue(
      { message: "OTEL_EXPORTER_OTLP_ENDPOINT must be provided when otel is not disabled" }
    )
    return Config.fail(new Schema.SchemaError(issue))
  }

  if (Option.isNone(config.serviceName)) {
    const issue = new SchemaIssue.InvalidValue(
      { message: "OTEL_SERVICE_NAME must be provided when otel is not disabled" }
    )
    return Config.fail(new Schema.SchemaError(issue))
  }

  return Config.succeed(
    {
      disabled: false,
      endpoint: config.endpoint.value,
      headers: config.headers,
      serviceName: config.serviceName.value,
      serviceVersion: config.serviceVersion
    } as const
  )
}

export const OtelConfig = rawConfig.pipe(Config.flatMap(parseRawConfig))
