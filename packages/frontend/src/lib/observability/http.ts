import type { Instrumentation, InstrumentationConfig } from "@opentelemetry/instrumentation"
import type * as Http from "node:http"

import {
  type Attributes,
  context,
  propagation,
  type Span,
  SpanKind,
  SpanStatusCode,
  type TextMapSetter,
  trace,
  type Tracer,
  type TracerProvider
} from "@opentelemetry/api"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

const INSTRUMENTATION_NAME = "pre-ets-frontend.http"
const INSTRUMENTATION_VERSION = "1.0.0"

type FetchKind = "fetch" | "http"
type HttpCaller = (...args: readonly unknown[]) => Http.ClientRequest

interface ParsedHttpCall {
  readonly callback: ((response: Http.IncomingMessage) => void) | undefined
  readonly options: Http.RequestOptions
  readonly requestUrl: string | undefined | URL
  readonly url: URL
}

const headerRecordSetter: TextMapSetter<Record<string, string>> = {
  set(carrier, key, value) {
    carrier[key] = value
  }
}

const fetchHeaderSetter: TextMapSetter<Headers> = {
  set(carrier, key, value) {
    carrier.set(key, value)
  }
}

/** Origin and path only. Search, hash, and userinfo never become span data. */
const queryFreeUrl = (url: URL): string => {
  const pathname = url.pathname === "" ? "/" : url.pathname
  return `${url.protocol}//${url.host}${pathname}`
}

const shouldPropagate = (url: URL): boolean => {
  const deployment = process.env.VERCEL_URL
  if (deployment !== undefined && deployment !== "") {
    if (url.protocol !== "https:") return false
    const branch = process.env.VERCEL_BRANCH_URL
    return url.host === deployment || (branch !== undefined && url.host === branch)
  }
  return url.protocol === "http:" && url.hostname === "localhost"
}

const SAMPLED_TRACE_FLAG = 0x1

const isSampled = (span: Span): boolean => (span.spanContext().traceFlags & SAMPLED_TRACE_FLAG) === SAMPLED_TRACE_FLAG

const endSpan = (span: Span): void => {
  if (span.isRecording()) span.end()
}

const failSpan = (span: Span, error: unknown): void => {
  if (error instanceof Error) {
    span.recordException(error)
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
    return
  }
  span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) })
}

const startClientSpan = (tracer: Tracer, kind: FetchKind, method: string, url: URL): Span => {
  const sanitized = queryFreeUrl(url)
  const attributes: Attributes = {
    "http.client.name": kind,
    "http.host": url.host,
    "http.method": method,
    "http.scheme": url.protocol.slice(0, -1),
    "http.url": sanitized,
    "net.peer.name": url.hostname,
    "operation.name": `${kind}.${method}`,
    "resource.name": sanitized
  }
  if (url.port !== "") attributes["net.peer.port"] = url.port
  return tracer.startSpan(`${kind} ${method} ${sanitized}`, {
    attributes,
    kind: SpanKind.CLIENT
  }, context.active())
}

const recordResponse = (
  span: Span,
  status: number | undefined,
  elapsedMs: number,
  contentLength: string | undefined
): void => {
  span.setAttribute("http.response_time", elapsedMs)
  if (status === undefined) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: "Response status code is undefined" })
  } else {
    span.setAttribute("http.status_code", status)
    if (status >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `Status: ${String(status)}` })
    }
  }
  if (contentLength !== undefined) {
    span.setAttribute("http.response_content_length_uncompressed", contentLength)
  }
}

const headerValue = (headers: Http.IncomingHttpHeaders, name: string): string | undefined => {
  const value = headers[name]
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value[0]
  return undefined
}

const isCallback = (value: unknown): value is (response: Http.IncomingMessage) => void => typeof value === "function"

const isRequestOptions = (value: unknown): value is Http.RequestOptions =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof URL)

const hostForUrl = (hostname: string): string =>
  hostname.includes(":") && !hostname.startsWith("[") ? `[${hostname}]` : hostname

const splitHost = (host: string): { readonly hostname: string; readonly port?: string } => {
  if (host.startsWith("[")) {
    const end = host.indexOf("]")
    if (end === -1) return { hostname: host }
    const hostname = host.slice(0, end + 1)
    const rest = host.slice(end + 1)
    if (rest.startsWith(":")) return { hostname, port: rest.slice(1) }
    return { hostname }
  }
  const colon = host.lastIndexOf(":")
  if (colon === -1) return { hostname: host }
  const port = host.slice(colon + 1)
  return port === "" ? { hostname: host.slice(0, colon) } : { hostname: host.slice(0, colon), port }
}

const schemeFor = (raw: null | string | undefined, fallback: "http:" | "https:"): string => {
  const protocol = raw ?? fallback
  return protocol.endsWith(":") ? protocol : `${protocol}:`
}

const explicitPort = (port: null | number | string | undefined): string | undefined =>
  port === undefined || port === null ? undefined : String(port)

const missingHostname = (hostname: null | string | undefined): boolean => hostname === undefined || hostname === ""

const hostFromHeader = (
  host: Http.RequestOptions["host"],
  port: string | undefined
): { readonly hostname: string | undefined; readonly port: string | undefined } => {
  if (typeof host !== "string" || host === "") return { hostname: undefined, port }
  const split = splitHost(host)
  return { hostname: split.hostname, port: port ?? split.port }
}

const resolvedHostname = (hostname: null | string | undefined): string => {
  if (hostname === undefined || hostname === null || hostname === "") return "localhost"
  return hostname
}

const portSuffix = (port: string | undefined): string => port === undefined || port === "" ? "" : `:${port}`

const urlFromRequestOptions = (options: Http.RequestOptions, protocol: "http:" | "https:"): undefined | URL => {
  if (options.socketPath !== undefined) return undefined
  const port = explicitPort(options.port)
  const located = missingHostname(options.hostname)
    ? hostFromHeader(options.host, port)
    : { hostname: options.hostname, port }
  try {
    return new URL(
      options.path ?? "/",
      `${schemeFor(options.protocol, protocol)}//${hostForUrl(resolvedHostname(located.hostname))}${
        portSuffix(located.port)
      }/`
    )
  } catch {
    return undefined
  }
}

const urlFromInput = (input: string | URL): undefined | URL => {
  try {
    return input instanceof URL ? new URL(input.href) : new URL(input)
  } catch {
    return undefined
  }
}

const callbackAt = (value: unknown): ((response: Http.IncomingMessage) => void) | undefined =>
  isCallback(value) ? value : undefined

const parseUrlCall = (input: string | URL, second: unknown, third: unknown): ParsedHttpCall | undefined => {
  const url = urlFromInput(input)
  if (url === undefined) return undefined
  if (isCallback(second)) return { callback: second, options: {}, requestUrl: input, url }
  if (isRequestOptions(second)) return { callback: callbackAt(third), options: second, requestUrl: input, url }
  return { callback: undefined, options: {}, requestUrl: input, url }
}

const parseOptionsCall = (
  options: Http.RequestOptions,
  second: unknown,
  protocol: "http:" | "https:"
): ParsedHttpCall | undefined => {
  const url = urlFromRequestOptions(options, protocol)
  if (url === undefined) return undefined
  return { callback: callbackAt(second), options, requestUrl: undefined, url }
}

const parseHttpCall = (args: readonly unknown[], protocol: "http:" | "https:"): ParsedHttpCall | undefined => {
  const first = args[0]
  if (typeof first === "string" || first instanceof URL) return parseUrlCall(first, args[1], args[2])
  if (!isRequestOptions(first)) return undefined
  return parseOptionsCall(first, args[1], protocol)
}

const isHeaderPairList = (
  headers: Http.OutgoingHttpHeaders | readonly string[]
): headers is readonly string[] => Object.getPrototypeOf(headers) === Array.prototype

const pairListRecord = (headers: readonly string[]): Record<string, string> => {
  const record: Record<string, string> = {}
  for (let index = 0; index < headers.length; index += 2) {
    const key = headers[index]
    const value = headers[index + 1]
    if (key !== undefined && value !== undefined) record[key] = value
  }
  return record
}

const outgoingHeaderRecord = (headers: Http.OutgoingHttpHeaders): Record<string, string> => {
  const record: Record<string, string> = {}
  for (const key of Object.keys(headers)) {
    const value = headers[key]
    if (typeof value === "string") record[key] = value
    else if (typeof value === "number") record[key] = String(value)
    else if (Array.isArray(value)) record[key] = value.join(",")
  }
  return record
}

const headerRecord = (headers: Http.OutgoingHttpHeaders | readonly string[] | undefined): Record<string, string> => {
  if (headers === undefined) return {}
  return isHeaderPairList(headers) ? pairListRecord(headers) : outgoingHeaderRecord(headers)
}

const invokeHttp = (original: HttpCaller, args: readonly unknown[]): Http.ClientRequest => original(...args)

const invokeHttpWithHeaders = (
  original: HttpCaller,
  parsed: ParsedHttpCall,
  headers: Record<string, string>
): Http.ClientRequest => {
  const options = { ...parsed.options, headers }
  if (parsed.requestUrl === undefined) {
    return parsed.callback === undefined ? original(options) : original(options, parsed.callback)
  }
  return parsed.callback === undefined
    ? original(parsed.requestUrl, options)
    : original(parsed.requestUrl, options, parsed.callback)
}

const bindClientRequest = (span: Span, request: Http.ClientRequest, startedAt: number): void => {
  request.prependListener("response", (response) => {
    recordResponse(
      span,
      response.statusCode,
      Date.now() - startedAt,
      headerValue(response.headers, "content-length")
    )
    response.on("end", () => {
      endSpan(span)
    })
  })
  request.on("error", (error: Error) => {
    failSpan(span, error)
    endSpan(span)
  })
  request.on("close", () => {
    endSpan(span)
  })
}

const traceHttp = (
  original: HttpCaller,
  args: readonly unknown[],
  protocol: "http:" | "https:",
  tracer: Tracer
): Http.ClientRequest => {
  const parsed = parseHttpCall(args, protocol)
  if (parsed === undefined) return invokeHttp(original, args)
  const method = parsed.options.method ?? "GET"
  const span = startClientSpan(tracer, "http", method, parsed.url)
  if (!span.isRecording() || !isSampled(span)) {
    endSpan(span)
    return invokeHttp(original, args)
  }
  try {
    const request = shouldPropagate(parsed.url)
      ? invokeHttpWithHeaders(original, parsed, propagateHeaders(span, headerRecord(parsed.options.headers)))
      : invokeHttp(original, args)
    bindClientRequest(span, request, Date.now())
    return request
  } catch (error) {
    failSpan(span, error)
    endSpan(span)
    throw error
  }
}

const propagateHeaders = (span: Span, headers: Record<string, string>): Record<string, string> => {
  propagation.inject(traceContext(span), headers, headerRecordSetter)
  return headers
}

const traceContext = (span: Span) => trace.setSpan(context.active(), span)

const isInternalFetch = (init: RequestInit | undefined): boolean => {
  if (typeof init !== "object" || !Object.hasOwn(init, "next")) return false
  const next: unknown = Reflect.get(init, "next")
  return typeof next === "object" && next !== null && Object.hasOwn(next, "internal") &&
    Reflect.get(next, "internal") === true
}

const requestUrl = (input: RequestInfo | URL): undefined | URL => {
  try {
    if (typeof input === "string") return new URL(input)
    if (input instanceof URL) return new URL(input.href)
    return new URL(input.url)
  } catch {
    return undefined
  }
}

const requestMethod = (input: RequestInfo | URL, init: RequestInit | undefined): string => {
  if (init?.method !== undefined && init.method !== "") return init.method
  if (typeof input !== "string" && !(input instanceof URL)) return input.method
  return "GET"
}

const requestHeaders = (input: RequestInfo | URL, init: RequestInit | undefined): Headers => {
  const headers = new Headers(typeof input !== "string" && !(input instanceof URL) ? input.headers : undefined)
  if (init?.headers !== undefined) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value)
    })
  }
  return headers
}

const instrumentFetch = (tracer: Tracer): () => void => {
  const original = globalThis.fetch.bind(globalThis)
  const patched: typeof fetch = async (input, init) => {
    if (isInternalFetch(init)) return original(input, init)
    const url = requestUrl(input)
    if (url === undefined) return original(input, init)
    const span = startClientSpan(tracer, "fetch", requestMethod(input, init), url)
    if (!span.isRecording() || !isSampled(span)) {
      endSpan(span)
      return original(input, init)
    }
    const headers = requestHeaders(input, init)
    if (shouldPropagate(url)) propagation.inject(traceContext(span), headers, fetchHeaderSetter)
    const startedAt = Date.now()
    try {
      const response = await original(input, { ...init, headers })
      recordResponse(span, response.status, Date.now() - startedAt, response.headers.get("content-length") ?? undefined)
      endSpan(span)
      return response
    } catch (error) {
      failSpan(span, error)
      endSpan(span)
      throw error
    }
  }
  globalThis.fetch = patched
  return () => {
    globalThis.fetch = original
  }
}

interface NodeHttpModule {
  get: HttpCaller
  request: HttpCaller
}

const readExport = (loaded: object, key: "get" | "request"): unknown => {
  if (!Object.hasOwn(loaded, key)) return undefined
  const properties = loaded as Record<"get" | "request", unknown>
  return properties[key]
}

const isHttpModule = (value: unknown): value is NodeHttpModule => {
  if (typeof value !== "object" || value === null) return false
  return typeof readExport(value, "request") === "function" && typeof readExport(value, "get") === "function"
}

const loadHttpModule = (name: string, loaded: unknown): NodeHttpModule => {
  if (!isHttpModule(loaded)) throw new Error(`Unable to load ${name}`)
  return loaded
}

// Literal requires. A variable specifier is too dynamic for the Next server bundle.
const httpModule = loadHttpModule("node:http", require("node:http"))
const httpsModule = loadHttpModule("node:https", require("node:https"))

const patchHttpMethod = (
  target: NodeHttpModule,
  key: "get" | "request",
  protocol: "http:" | "https:",
  tracer: Tracer
): () => void => {
  const original = target[key]
  target[key] = (...args) => traceHttp(original, args, protocol, tracer)
  return () => {
    target[key] = original
  }
}

/** Client spans for `fetch` and Node `http`/`https`, registered on the global tracer. */
class NodeHttpClientInstrumentation implements Instrumentation {
  readonly instrumentationName = INSTRUMENTATION_NAME
  readonly instrumentationVersion = INSTRUMENTATION_VERSION
  private config: InstrumentationConfig = {}
  private readonly restore: (() => void)[] = []
  private tracerProvider: TracerProvider | undefined

  disable(): void {
    const restore = this.restore.splice(0).reverse()
    for (const undo of restore) undo()
  }

  enable(): void {
    if (this.config.enabled === false || this.tracerProvider === undefined) return
    this.disable()
    // Next's fetch patch records the raw href. Hide it while this client span is installed.
    process.env.NEXT_OTEL_FETCH_DISABLED = "1"
    const tracer = this.tracerProvider.getTracer(this.instrumentationName, this.instrumentationVersion)
    this.restore.push(
      instrumentFetch(tracer),
      patchHttpMethod(httpModule, "request", "http:", tracer),
      patchHttpMethod(httpModule, "get", "http:", tracer),
      patchHttpMethod(httpsModule, "request", "https:", tracer),
      patchHttpMethod(httpsModule, "get", "https:", tracer)
    )
  }

  getConfig(): InstrumentationConfig {
    return this.config
  }

  setConfig(config: InstrumentationConfig): void {
    this.config = config
  }

  setMeterProvider(): void {
    // Metrics are out of scope.
  }

  setTracerProvider(tracerProvider: TracerProvider): void {
    this.tracerProvider = tracerProvider
  }
}

export const nodeHttpClientInstrumentation = new NodeHttpClientInstrumentation()
