import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { afterEach, describe, expect, it } from "vitest"

import {
  AttributeSanitizingSpanProcessor,
  hasRequiredRequestSpanFacts
} from "../../src/lib/observability/attributes.ts"
import { buildVercelOtelConfiguration } from "../../src/lib/observability/register.ts"

describe("producer-boundary span sanitization", () => {
  let provider: BasicTracerProvider | undefined

  afterEach(async () => {
    if (provider !== undefined) {
      await provider.shutdown()
      provider = undefined
    }
  })

  it("emitted spans keep required facts and drop prohibited attributes", async () => {
    const exporter = new InMemorySpanExporter()
    const pipeline = new AttributeSanitizingSpanProcessor(
      new SimpleSpanProcessor(exporter)
    )
    provider = new BasicTracerProvider({
      spanProcessors: [pipeline]
    })

    const tracer = provider.getTracer("observability-sanitization-test")
    const span = tracer.startSpan("GET /api/health")
    span.setAttributes({
      Authorization: "Bearer must-not-export",
      "http.method": "GET",
      "http.request.header.authorization": "Bearer must-not-export",
      "http.request.header.cookie": "session=abc",
      "http.route": "/api/health",
      "http.status_code": 200
    })
    span.end()
    await pipeline.forceFlush()

    const finished = exporter.getFinishedSpans()
    expect(finished).toHaveLength(1)
    const attrs = finished[0]?.attributes ?? {}
    expect(hasRequiredRequestSpanFacts(attrs)).toBe(true)
    expect(attrs.Authorization).toBeUndefined()
    expect(attrs["http.request.header.authorization"]).toBeUndefined()
    expect(attrs["http.request.header.cookie"]).toBeUndefined()
  })

  it("register configuration includes the same sanitizing processor type", () => {
    const config = buildVercelOtelConfiguration({
      kind: "enabled",
      otlpEndpoint: "http://127.0.0.1:4318",
      otlpHeaders: {},
      serviceName: "pre-ets-frontend",
      tracesUrl: "http://127.0.0.1:4318/v1/traces"
    })
    const first = config.spanProcessors?.[0]
    expect(first).toBeInstanceOf(AttributeSanitizingSpanProcessor)
  })
})
