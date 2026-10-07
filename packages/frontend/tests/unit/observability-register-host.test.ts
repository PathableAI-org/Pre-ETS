import type { Configuration } from "@vercel/otel"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  buildVercelOtelConfiguration,
  formatObservabilityDiagnostic,
  registerObservability
} from "../../src/lib/observability/register.ts"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("registerObservability host boundary", () => {
  it("skips registration when traces are disabled", () => {
    const registerOTelFn = vi.fn()
    const result = registerObservability({
      env: { OTEL_TRACES_ENABLED: "false" },
      registerOTelFn
    })
    expect(result).toEqual({ status: "disabled" })
    expect(registerOTelFn).not.toHaveBeenCalled()
  })

  it("fail-soft locally when enabled with missing endpoint and never logs header values", () => {
    const diagnostics: string[] = []
    const registerOTelFn = vi.fn()
    const secretHeader = "Authorization=Bearer super-secret-value"

    const result = registerObservability({
      env: {
        NODE_ENV: "development",
        OTEL_EXPORTER_OTLP_HEADERS: secretHeader,
        OTEL_TRACES_ENABLED: "true"
      },
      logDiagnostic: (message) => {
        diagnostics.push(message)
      },
      registerOTelFn
    })

    expect(result.status).toBe("fail-soft")
    expect(registerOTelFn).not.toHaveBeenCalled()
    expect(diagnostics.join("\n")).toContain("continuing without export")
    expect(diagnostics.join("\n")).not.toContain("super-secret-value")
    expect(diagnostics.join("\n")).not.toContain(secretHeader)
  })

  it("refuse-to-start in production when enabled with invalid endpoint", () => {
    const diagnostics: string[] = []
    const registerOTelFn = vi.fn()
    const refuseToStart = vi.fn((reason: string): never => {
      throw new Error(`REFUSE:${reason}`)
    })

    expect(() =>
      registerObservability({
        env: {
          NODE_ENV: "production",
          OTEL_EXPORTER_OTLP_ENDPOINT: "bad endpoint",
          OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Bearer must-not-leak",
          OTEL_TRACES_ENABLED: "true"
        },
        logDiagnostic: (message) => {
          diagnostics.push(message)
        },
        refuseToStart,
        registerOTelFn
      })
    ).toThrow(/REFUSE:/)

    expect(registerOTelFn).not.toHaveBeenCalled()
    expect(refuseToStart).toHaveBeenCalledOnce()
    expect(diagnostics.join("\n")).toContain("refusing to start in production")
    expect(diagnostics.join("\n")).not.toContain("must-not-leak")
  })

  it("registers @vercel/otel when enabled with a valid endpoint", () => {
    const registerOTelFn = vi.fn()
    const result = registerObservability({
      env: {
        NODE_ENV: "development",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
        OTEL_TRACES_ENABLED: "true"
      },
      logDiagnostic: () => undefined,
      registerOTelFn
    })

    expect(result.status).toBe("registered")
    expect(registerOTelFn).toHaveBeenCalledOnce()
    const config = registerOTelFn.mock.calls[0]?.[0] as Configuration
    expect(config.serviceName).toBe("pre-ets-frontend")
    expect(config.traceSampler).toBe("always_on")
    expect(config.spanProcessors?.[0]).toBeTypeOf("object")
    expect(config.spanProcessors?.[1]).toBe("auto")
  })

  it("buildVercelOtelConfiguration wires attribute sanitizer before auto export", () => {
    const config = buildVercelOtelConfiguration({
      kind: "enabled",
      otlpEndpoint: "http://127.0.0.1:4318",
      otlpHeaders: {},
      serviceName: "pre-ets-frontend",
      tracesUrl: "http://127.0.0.1:4318/v1/traces"
    })
    expect(config.spanProcessors).toHaveLength(2)
    expect(config.attributesFromHeaders).toBeTypeOf("function")
    expect(
      formatObservabilityDiagnostic({
        kind: "refuse-to-start",
        reason: "OTEL_EXPORTER_OTLP_ENDPOINT is missing"
      })
    ).not.toMatch(/Bearer|Authorization=/)
  })
})
