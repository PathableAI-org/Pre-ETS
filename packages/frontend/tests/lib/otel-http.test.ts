import { propagation, type TextMapPropagator, trace, type TracerProvider } from "@opentelemetry/api"
import http from "node:http"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { nodeHttpClientInstrumentation } from "../../src/lib/observability/http.ts"

class RecordingSpan {
  readonly attributes: Record<string, unknown> = {}
  readonly exceptions: unknown[] = []
  status: undefined | { readonly code: number; readonly message?: string }
  private recording = true

  addEvent(): this {
    return this
  }

  addLink(): this {
    return this
  }

  addLinks(): this {
    return this
  }

  end(): this {
    this.recording = false
    return this
  }

  isRecording(): boolean {
    return this.recording
  }

  recordException(error: unknown): this {
    this.exceptions.push(error)
    return this
  }

  setAttribute(key: string, value: unknown): this {
    this.attributes[key] = value
    return this
  }

  setAttributes(): this {
    return this
  }

  setStatus(status: { readonly code: number; readonly message?: string }): this {
    this.status = status
    return this
  }

  spanContext() {
    return {
      spanId: "0123456789abcdef",
      traceFlags: 1,
      traceId: "0123456789abcdef0123456789abcdef"
    }
  }

  updateName(): this {
    return this
  }
}

const spans: RecordingSpan[] = []

const traceParentPropagator: TextMapPropagator = {
  extract(current) {
    return current
  },
  fields() {
    return ["traceparent"]
  },
  inject(current, carrier, setter) {
    const span = trace.getSpan(current)
    if (span === undefined) return
    const { spanId, traceFlags, traceId } = span.spanContext()
    const sampled = (traceFlags & 1) === 1 ? "01" : "00"
    setter.set(carrier, "traceparent", `00-${traceId}-${spanId}-${sampled}`)
  }
}

const provider = {
  getTracer: () => ({
    startSpan: (_name: string, options?: { readonly attributes?: Record<string, unknown> }) => {
      const span = new RecordingSpan()
      const attributes = options?.attributes
      if (attributes !== undefined) {
        for (const [key, value] of Object.entries(attributes)) span.setAttribute(key, value)
      }
      spans.push(span)
      return span
    }
  })
} as unknown as TracerProvider

interface CapturedRequest {
  readonly method: string | undefined
  readonly rawHeaders: readonly string[]
  readonly url: string | undefined
}

const headerValues = (rawHeaders: readonly string[], name: string): string[] => {
  const values: string[] = []
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() !== name) continue
    const value = rawHeaders[index + 1]
    if (value !== undefined) values.push(value)
  }
  return values
}

const listen = (host: string) =>
  new Promise<{ readonly port: number; readonly server: http.Server; take(): Promise<CapturedRequest> }>((resolve) => {
    const pending: ((raw: CapturedRequest) => void)[] = []
    const captured: CapturedRequest[] = []
    const server = http.createServer((request, response) => {
      const raw: CapturedRequest = {
        method: request.method,
        rawHeaders: request.rawHeaders,
        url: request.url
      }
      const next = pending.shift()
      if (next === undefined) captured.push(raw)
      else next(raw)
      request.resume()
      response.end("ok")
    })
    server.listen(0, host, () => {
      const address = server.address()
      if (address === null || typeof address === "string") throw new Error("missing port")
      resolve({
        port: address.port,
        server,
        take: () => {
          const raw = captured.shift()
          if (raw !== undefined) return Promise.resolve(raw)
          return new Promise((done) => {
            pending.push(done)
          })
        }
      })
    })
  })

describe("node HTTP client instrumentation", () => {
  beforeEach(() => {
    propagation.disable()
    propagation.setGlobalPropagator(traceParentPropagator)
  })

  afterEach(() => {
    nodeHttpClientInstrumentation.disable()
    propagation.disable()
    spans.length = 0
  })

  it("records the options target and keeps array headers", async () => {
    const server = await listen("127.0.0.1")
    nodeHttpClientInstrumentation.setTracerProvider(provider)
    nodeHttpClientInstrumentation.enable()
    await new Promise<void>((resolve, reject) => {
      const request = http.request(
        "http://localhost/original?token=secret",
        {
          headers: { Cookie: ["a=1", "b=2"] },
          hostname: "127.0.0.1",
          path: "/actual",
          port: server.port
        },
        (response) => {
          response.resume()
          resolve()
        }
      )
      request.on("error", reject)
      request.end()
    })
    const raw = await server.take()
    server.server.close()
    expect(raw.method).toBe("GET")
    expect(raw.url).toBe("/actual")
    expect(headerValues(raw.rawHeaders, "cookie")).toEqual(["a=1; b=2"])
    expect(headerValues(raw.rawHeaders, "traceparent")).toEqual([])
    expect(raw.url).not.toContain("token")
    const span = spans[0]
    expect(span?.attributes["http.url"]).toBe(`http://127.0.0.1:${String(server.port)}/actual`)
    expect(span?.attributes["net.peer.name"]).toBe("127.0.0.1")
  })

  it("keeps a callback when options are omitted and preserves repeated headers", async () => {
    const server = await listen("localhost")
    nodeHttpClientInstrumentation.setTracerProvider(provider)
    nodeHttpClientInstrumentation.enable()
    let called = false
    const requestWithOptionalOptions = http.request as (
      url: string,
      options: http.RequestOptions | undefined,
      callback: (response: http.IncomingMessage) => void
    ) => http.ClientRequest
    await new Promise<void>((resolve, reject) => {
      const request = requestWithOptionalOptions(
        `http://localhost:${String(server.port)}/cb?token=secret`,
        undefined,
        (response) => {
          called = true
          response.resume()
          resolve()
        }
      )
      request.on("error", reject)
      request.end()
    })
    const callbackRaw = await server.take()
    const repeatedRaw = server.take()
    await new Promise<void>((resolve, reject) => {
      const request = http.request(`http://localhost:${String(server.port)}/pair`, {
        headers: ["Host", `localhost:${String(server.port)}`, "Cookie", "a=1", "Cookie", "b=2"]
      }, (response) => {
        response.resume()
        resolve()
      })
      request.on("error", reject)
      request.end()
    })
    const repeated = await repeatedRaw
    server.server.close()
    expect(called).toBe(true)
    expect(callbackRaw.url).toBe("/cb?token=secret")
    expect(headerValues(callbackRaw.rawHeaders, "traceparent")).toHaveLength(1)
    expect(spans[0]?.attributes["http.url"]).toBe(`http://localhost:${String(server.port)}/cb`)
    expect(headerValues(repeated.rawHeaders, "cookie")).toEqual(["a=1", "b=2"])
    expect(spans.some((span) => String(span.attributes["http.url"]).includes("token"))).toBe(false)
  })

  it("replaces request headers and omits failure details", async () => {
    const server = await listen("127.0.0.1")
    nodeHttpClientInstrumentation.setTracerProvider(provider)
    nodeHttpClientInstrumentation.enable()
    const input = new Request(`http://127.0.0.1:${String(server.port)}/fetch?token=secret`, {
      headers: { Authorization: "Bearer secret" }
    })
    await fetch(input, { headers: {} })
    const raw = await server.take()
    const controller = new AbortController()
    controller.abort("https://user:pass@idp.example/token?secret=1")
    await expect(fetch(`http://127.0.0.1:${String(server.port)}/aborted`, { signal: controller.signal })).rejects
      .toBeTruthy()
    const named = new Error("ignored")
    named.name = "https://user:pass@idp.example/token?secret=1"
    const namedController = new AbortController()
    namedController.abort(named)
    await expect(fetch(`http://127.0.0.1:${String(server.port)}/named`, { signal: namedController.signal })).rejects
      .toBeTruthy()
    server.server.close()
    expect(headerValues(raw.rawHeaders, "authorization")).toEqual([])
    expect(spans[0]?.attributes["http.url"]).toBe(`http://127.0.0.1:${String(server.port)}/fetch`)
    const failed = spans.at(-2)
    const namedFailure = spans.at(-1)
    expect(failed?.exceptions).toEqual([])
    expect(failed?.status?.message).toBe("Client request failed")
    expect(JSON.stringify(failed?.status)).not.toContain("secret")
    expect(JSON.stringify(failed?.attributes)).not.toContain("secret")
    expect(namedFailure?.attributes["error.type"]).toBe("Error")
    expect(JSON.stringify(namedFailure?.attributes)).not.toContain("secret")
  })

  it("does not let a protocol-relative path replace the connection host", async () => {
    const server = await listen("127.0.0.1")
    nodeHttpClientInstrumentation.setTracerProvider(provider)
    nodeHttpClientInstrumentation.enable()
    const target = "//localhost/probe?token=secret"
    await new Promise<void>((resolve, reject) => {
      const request = http.request({
        hostname: "127.0.0.1",
        path: target,
        port: server.port
      }, (response) => {
        response.resume()
        resolve()
      })
      request.on("error", reject)
      request.end()
    })
    const optionsRaw = server.take()
    await new Promise<void>((resolve, reject) => {
      const request = http.request(`http://127.0.0.1:${String(server.port)}/original`, {
        path: target
      }, (response) => {
        response.resume()
        resolve()
      })
      request.on("error", reject)
      request.end()
    })
    const fromUrl = await server.take()
    const fromOptions = await optionsRaw
    server.server.close()
    const recorded = `http://127.0.0.1:${String(server.port)}/${encodeURIComponent("//localhost/probe")}`
    expect(fromOptions.url).toBe(target)
    expect(headerValues(fromOptions.rawHeaders, "traceparent")).toEqual([])
    expect(spans[0]?.attributes["http.url"]).toBe(recorded)
    expect(spans[0]?.attributes["net.peer.name"]).toBe("127.0.0.1")
    expect(fromUrl.url).toBe(target)
    expect(headerValues(fromUrl.rawHeaders, "traceparent")).toEqual([])
    expect(spans[1]?.attributes["http.url"]).toBe(recorded)
    expect(spans[1]?.attributes["net.peer.name"]).toBe("127.0.0.1")
  })
})
