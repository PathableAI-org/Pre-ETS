import { Config, Option, Schema, SchemaIssue } from "effect"

const TRUE_TOKENS = new Set(["1", "on", "true", "y", "yes"])
const FALSE_TOKENS = new Set(["0", "false", "n", "no", "off"])

const invalidDisabledFlag = (): Config.Config<boolean> =>
  Config.fail(
    new Schema.SchemaError(
      new SchemaIssue.InvalidValue({ message: "OTEL_SDK_DISABLED must be a boolean" })
    )
  )

/** Missing and blank values are absent. Present values keep surrounding space removed. */
const optionalString = (name: string): Config.Config<Option.Option<string>> =>
  Config.String(name).pipe(
    Config.option,
    Config.map(Option.flatMap((value) => {
      const trimmed = value.trim()
      return trimmed === "" ? Option.none() : Option.some(trimmed)
    }))
  )

const disabled = Config.String("OTEL_SDK_DISABLED").pipe(
  Config.option,
  Config.flatMap((value) => {
    if (Option.isNone(value)) return Config.succeed(false)
    const token = value.value.trim().toLowerCase()
    if (token === "") return Config.succeed(false)
    if (TRUE_TOKENS.has(token)) return Config.succeed(true)
    if (FALSE_TOKENS.has(token)) return Config.succeed(false)
    return invalidDisabledFlag()
  })
)

const endpoint = Config.all({
  base: optionalString("OTEL_EXPORTER_OTLP_ENDPOINT"),
  traces: optionalString("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
}).pipe(Config.map(({ base, traces }) => Option.isSome(traces) ? traces : base))

/**
 * Optional OpenTelemetry process settings.
 *
 * No field is required. A missing or blank value stays unset. Endpoint strings are not
 * validated; an unreachable collector remains a best-effort export problem after startup.
 */
export const OtelConfig = Config.all({
  disabled,
  endpoint,
  headers: optionalString("OTEL_EXPORTER_OTLP_HEADERS"),
  protocol: optionalString("OTEL_EXPORTER_OTLP_PROTOCOL"),
  serviceName: optionalString("OTEL_SERVICE_NAME"),
  tracesHeaders: optionalString("OTEL_EXPORTER_OTLP_TRACES_HEADERS"),
  tracesProtocol: optionalString("OTEL_EXPORTER_OTLP_TRACES_PROTOCOL")
})
