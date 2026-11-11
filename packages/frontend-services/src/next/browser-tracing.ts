import { context, propagation } from "@opentelemetry/api"

import { BrowserTracing } from "../observability.js"
import { Runtime } from "../runtime.js"

/** Exactly the four values a protected document gives the browser (FR-005). */
export interface BrowserTracingConfig {
  /** Absolute OTLP base URL with trailing slash, e.g. `http://127.0.0.1:4318/`. */
  readonly endpoint: string
  readonly serviceInstanceId?: string | undefined
  readonly serviceName: string
  readonly serviceVersion: string
}

export interface BrowserTracingDocument {
  readonly config: BrowserTracingConfig
  /** W3C `traceparent` of the active server span, when one is recording. */
  readonly traceparent: string | undefined
}

const readSettings = BrowserTracing.useSync((service) => service.settings)

/**
 * The browser configuration and trace context for the protected document being rendered. Resolves `undefined` when
 * browser tracing is off or anything fails, and never rejects: telemetry never fails a page (FR-003, FR-009).
 */
export const readBrowserTracing = async (): Promise<BrowserTracingDocument | undefined> => {
  // The active context belongs to this document request only until the first `await`.
  const carrier: Record<string, string> = {}
  propagation.inject(context.active(), carrier)
  const settings = await Runtime.runPromise(readSettings).catch(() => undefined)
  if (settings === undefined) return undefined
  return {
    config: {
      endpoint: settings.endpoint.href,
      serviceInstanceId: settings.serviceInstanceId,
      serviceName: settings.serviceName,
      serviceVersion: settings.serviceVersion
    },
    traceparent: carrier.traceparent
  }
}
