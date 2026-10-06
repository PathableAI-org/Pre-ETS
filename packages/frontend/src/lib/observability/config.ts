export type ObservabilityConfigDecision =
  | ObservabilityEnabledConfig
  | { readonly kind: "disabled" }
  | {
    readonly kind: "fail-soft"
    readonly reason: string
  }
  | {
    readonly kind: "refuse-to-start"
    readonly reason: string
  }
  | { readonly kind: "sdk-disabled" }

export interface ObservabilityEnabledConfig {
  readonly kind: "enabled"
  readonly otlpEndpoint: string
  readonly otlpHeaders: OtlpHeaders
  readonly serviceName: string
  readonly tracesUrl: string
}

export type OtlpHeaders = Readonly<Record<string, string>>

export const DEFAULT_OTEL_SERVICE_NAME = "pre-ets-frontend"

const TRUTHY_FLAG = /^(true|1)$/i

export type ObservabilityEnv = Readonly<Record<string, string | undefined>>

export function isProductionNodeEnv(nodeEnv: string | undefined): boolean {
  return nodeEnv === "production"
}

export function isSdkDisabledFlag(value: string | undefined): boolean {
  if (value === undefined) {
    return false
  }
  return TRUTHY_FLAG.test(value.trim())
}

export function isTracesEnabledFlag(value: string | undefined): boolean {
  if (value === undefined) {
    return false
  }
  return TRUTHY_FLAG.test(value.trim())
}

export function normalizeOtlpEndpoint(
  raw: string | undefined
): { readonly endpoint: string; readonly ok: true; readonly tracesUrl: string } | {
  readonly ok: false
  readonly reason: string
} {
  if (raw === undefined || raw.trim() === "") {
    return { ok: false, reason: "OTEL_EXPORTER_OTLP_ENDPOINT is missing" }
  }

  const trimmed = raw.trim().replace(/\/+$/, "")
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { ok: false, reason: "OTEL_EXPORTER_OTLP_ENDPOINT is not a valid URL" }
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      reason: "OTEL_EXPORTER_OTLP_ENDPOINT must use http or https"
    }
  }

  if (url.username !== "" || url.password !== "") {
    return {
      ok: false,
      reason: "OTEL_EXPORTER_OTLP_ENDPOINT must not embed credentials"
    }
  }

  const endpoint = url.toString().replace(/\/$/, "")
  return {
    endpoint,
    ok: true,
    tracesUrl: `${endpoint}/v1/traces`
  }
}

export function parseOtlpHeaders(raw: string | undefined): OtlpHeaders {
  if (raw === undefined || raw.trim() === "") {
    return {}
  }

  const headers: Record<string, string> = {}
  for (const part of raw.split(",")) {
    const trimmed = part.trim()
    if (trimmed === "") {
      continue
    }
    const separator = trimmed.indexOf("=")
    if (separator <= 0) {
      continue
    }
    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim()
    if (key === "") {
      continue
    }
    headers[key] = value
  }
  return headers
}

export function resolveObservabilityConfig(
  env: ObservabilityEnv = process.env
): ObservabilityConfigDecision {
  if (!isTracesEnabledFlag(env.OTEL_TRACES_ENABLED)) {
    return { kind: "disabled" }
  }

  if (isSdkDisabledFlag(env.OTEL_SDK_DISABLED)) {
    return { kind: "sdk-disabled" }
  }

  const endpointResult = normalizeOtlpEndpoint(env.OTEL_EXPORTER_OTLP_ENDPOINT)
  if (!endpointResult.ok) {
    if (isProductionNodeEnv(env.NODE_ENV)) {
      return { kind: "refuse-to-start", reason: endpointResult.reason }
    }
    return { kind: "fail-soft", reason: endpointResult.reason }
  }

  const trimmedServiceName = env.OTEL_SERVICE_NAME?.trim()
  const serviceName = trimmedServiceName === undefined || trimmedServiceName === ""
    ? DEFAULT_OTEL_SERVICE_NAME
    : trimmedServiceName

  return {
    kind: "enabled",
    otlpEndpoint: endpointResult.endpoint,
    otlpHeaders: parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
    serviceName,
    tracesUrl: endpointResult.tracesUrl
  }
}
