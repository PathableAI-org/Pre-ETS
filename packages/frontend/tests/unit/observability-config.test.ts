import { afterEach, describe, expect, it } from "vitest"

import {
  DEFAULT_OTEL_SERVICE_NAME,
  normalizeOtlpEndpoint,
  parseOtlpHeaders,
  resolveObservabilityConfig
} from "../../src/lib/observability/config.ts"

afterEach(() => {
  // Config helpers are pure; nothing to reset.
})

describe("resolveObservabilityConfig", () => {
  it("disables when OTEL_TRACES_ENABLED is unset", () => {
    expect(resolveObservabilityConfig({})).toEqual({ kind: "disabled" })
  })

  it("disables when OTEL_TRACES_ENABLED is not true/1", () => {
    expect(
      resolveObservabilityConfig({
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
        OTEL_TRACES_ENABLED: "false"
      })
    ).toEqual({ kind: "disabled" })
  })

  it("treats only true/1 (case-insensitive) as enabled", () => {
    for (const value of ["true", "TRUE", "1"]) {
      const decision = resolveObservabilityConfig({
        NODE_ENV: "development",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
        OTEL_TRACES_ENABLED: value
      })
      expect(decision.kind).toBe("enabled")
    }
  })

  it("returns sdk-disabled when OTEL_SDK_DISABLED=true even if traces enabled", () => {
    expect(
      resolveObservabilityConfig({
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
        OTEL_SDK_DISABLED: "true",
        OTEL_TRACES_ENABLED: "true"
      })
    ).toEqual({ kind: "sdk-disabled" })
  })

  it("fail-soft in local/dev when enabled with missing endpoint", () => {
    expect(
      resolveObservabilityConfig({
        NODE_ENV: "development",
        OTEL_TRACES_ENABLED: "true"
      })
    ).toEqual({
      kind: "fail-soft",
      reason: "OTEL_EXPORTER_OTLP_ENDPOINT is missing"
    })
  })

  it("refuse-to-start in production when enabled with invalid endpoint", () => {
    expect(
      resolveObservabilityConfig({
        NODE_ENV: "production",
        OTEL_EXPORTER_OTLP_ENDPOINT: "not-a-url",
        OTEL_TRACES_ENABLED: "1"
      })
    ).toEqual({
      kind: "refuse-to-start",
      reason: "OTEL_EXPORTER_OTLP_ENDPOINT is not a valid URL"
    })
  })

  it("enables with traces URL and default service name", () => {
    expect(
      resolveObservabilityConfig({
        NODE_ENV: "development",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318/",
        OTEL_TRACES_ENABLED: "true"
      })
    ).toEqual({
      kind: "enabled",
      otlpEndpoint: "http://127.0.0.1:4318",
      otlpHeaders: {},
      serviceName: DEFAULT_OTEL_SERVICE_NAME,
      tracesUrl: "http://127.0.0.1:4318/v1/traces"
    })
  })

  it("parses OTEL_EXPORTER_OTLP_HEADERS into a map", () => {
    const decision = resolveObservabilityConfig({
      NODE_ENV: "development",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
      OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Bearer test-token,X-Scope=demo",
      OTEL_SERVICE_NAME: "custom-frontend",
      OTEL_TRACES_ENABLED: "true"
    })
    expect(decision).toEqual({
      kind: "enabled",
      otlpEndpoint: "http://127.0.0.1:4318",
      otlpHeaders: {
        Authorization: "Bearer test-token",
        "X-Scope": "demo"
      },
      serviceName: "custom-frontend",
      tracesUrl: "http://127.0.0.1:4318/v1/traces"
    })
  })
})

describe("normalizeOtlpEndpoint / parseOtlpHeaders", () => {
  it("rejects non-http protocols", () => {
    expect(normalizeOtlpEndpoint("ftp://example.com").ok).toBe(false)
  })

  it("returns empty headers for blank input", () => {
    expect(parseOtlpHeaders(undefined)).toEqual({})
    expect(parseOtlpHeaders("")).toEqual({})
  })
})
