import { Config, Option, Schema, SchemaIssue } from "effect"

/** What a protected document may tell the browser. It never carries collector headers. */
export interface BrowserTracingSettings {
  /** The OTLP base URL the server exports to; the browser appends `v1/traces` the same way. */
  readonly endpoint: URL
  /** `service.instance.id` from `OTEL_RESOURCE_ATTRIBUTES`, when present. */
  readonly serviceInstanceId?: string | undefined
  readonly serviceName: string
  readonly serviceVersion: string
}

export interface OtelDisabled {
  readonly disabled: true
}

export interface OtelEnabled {
  /** Present only when `BROWSER_TRACING_ENABLED` decodes to true. */
  readonly browserTracing: BrowserTracingSettings | undefined
  readonly disabled: false
  readonly endpoint: URL
  readonly headers: Readonly<Record<string, string>>
  readonly serviceName: string
  readonly serviceVersion: string
}

export type OtelSettings = OtelDisabled | OtelEnabled

const headers = Config.Record(
  Schema.String,
  Schema.String,
  "OTEL_EXPORTER_OTLP_HEADERS",
  { trim: true }
)
const serviceName = Config.NonEmptyString("OTEL_SERVICE_NAME")
const serviceVersion = Config.NonEmptyString("OTEL_SERVICE_VERSION")

const rawConfig = (withoutEcho: <A>(name: string, codec: Schema.Codec<A, string>) => Config.Config<A>) =>
  Config.all({
    /** Local verification only; production configuration never sets it (docs/observability.md). */
    browserTracing: Config.withDefault(Config.Boolean("BROWSER_TRACING_ENABLED"), false),
    disabled: Config.withDefault(Config.Boolean("OTEL_SDK_DISABLED"), false),
    endpoint: Config.option(withoutEcho("OTEL_EXPORTER_OTLP_ENDPOINT", Schema.URLFromString)),
    headers: Config.withDefault(headers, {}),
    /** Owned by the Node SDK, which reads it again; only `service.instance.id` is taken here. */
    resourceAttributes: Config.withDefault(Config.String("OTEL_RESOURCE_ATTRIBUTES"), ""),
    serviceName: Config.option(serviceName),
    serviceVersion: Config.withDefault(serviceVersion, "UNKNOWN")
  })

type RawConfig = Config.Success<ReturnType<typeof rawConfig>>

const invalid = (message: string) => Config.fail(new Schema.SchemaError(new SchemaIssue.InvalidValue({ message })))

const maxAttributeLength = 255

/** One `key=value` entry, read as the Node SDK reads it. A malformed entry answers `undefined`. */
const resourceAttribute = (entry: string): readonly [string, string] | undefined => {
  const pair = /^([^=]*)=([^=]*)$/.exec(entry)
  if (pair === null) return undefined
  try {
    const key = decodeURIComponent((pair[1] ?? "").trim())
    const value = decodeURIComponent((pair[2] ?? "").trim())
    return key === "" || key.length > maxAttributeLength || value.length > maxAttributeLength
      ? undefined
      : [key, value]
  } catch {
    return undefined
  }
}

/**
 * `service.instance.id` from an `OTEL_RESOURCE_ATTRIBUTES` list. Like the Node SDK, a list with any malformed entry
 * contributes nothing, so the browser never carries a run identifier the server's own spans lack.
 */
const serviceInstanceId = (list: string): string | undefined => {
  const entries = list.split(",").filter((entry) => entry.trim() !== "").map(resourceAttribute)
  if (entries.includes(undefined)) return undefined
  return entries.filter((entry) => entry?.[0] === "service.instance.id").at(-1)?.[1]
}

/** Only scheme, host, port, and path may reach the page: no userinfo, query, or fragment (research D15). */
const renderable = (url: URL): boolean =>
  (url.protocol === "http:" || url.protocol === "https:") && url.username === "" && url.password === "" &&
  !url.href.includes("?") && !url.href.includes("#")

const parseBrowserTracing = (
  config: RawConfig,
  endpoint: URL,
  name: string
): Config.Config<BrowserTracingSettings | undefined> => {
  if (!config.browserTracing) return Config.succeed(undefined)
  if (!renderable(endpoint)) {
    return invalid(
      "BROWSER_TRACING_ENABLED requires an OTEL_EXPORTER_OTLP_ENDPOINT without credentials, query, or fragment"
    )
  }
  return Config.succeed({
    endpoint,
    serviceInstanceId: serviceInstanceId(config.resourceAttributes),
    serviceName: name,
    serviceVersion: config.serviceVersion
  })
}

const parseRawConfig = (config: RawConfig): Config.Config<OtelSettings> => {
  if (config.disabled) {
    return Config.succeed({ disabled: true } as const)
  }

  if (Option.isNone(config.endpoint)) {
    return invalid("OTEL_EXPORTER_OTLP_ENDPOINT must be provided when otel is not disabled")
  }

  if (Option.isNone(config.serviceName)) {
    return invalid("OTEL_SERVICE_NAME must be provided when otel is not disabled")
  }

  const endpoint = config.endpoint.value
  const name = config.serviceName.value
  return parseBrowserTracing(config, endpoint, name).pipe(
    Config.map((browserTracing) => ({
      browserTracing,
      disabled: false as const,
      endpoint,
      headers: config.headers,
      serviceName: name,
      serviceVersion: config.serviceVersion
    }))
  )
}

/** Browser tracing is effective only when OTEL is enabled and the switch decodes to true (research D1). */
export const otelConfig = (
  withoutEcho: <A>(name: string, codec: Schema.Codec<A, string>) => Config.Config<A>
): Config.Config<OtelSettings> => rawConfig(withoutEcho).pipe(Config.flatMap(parseRawConfig))
