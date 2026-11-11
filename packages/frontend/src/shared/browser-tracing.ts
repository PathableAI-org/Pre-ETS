import type { BrowserTracingConfig, BrowserTracingDocument } from "@pathableai/pre-ets-frontend-services"

import { createElement, Fragment, type ReactNode } from "react"

/** The one server-to-browser contract: the four configuration values, as JSON in this meta element's `content`. */
const CONFIG_META_NAME = "preets-browser-tracing"

/**
 * Renders the document's `<meta name="traceparent">` and the browser configuration, or nothing when browser tracing
 * is off. Server-safe; React hoists both elements into `<head>`. Written without JSX so the facade keeps the module
 * name the browser entry imports.
 */
export function BrowserTracingMeta({ document }: { readonly document: BrowserTracingDocument | undefined }): ReactNode {
  if (document === undefined) return null
  const { endpoint, serviceInstanceId, serviceName, serviceVersion } = document.config
  return createElement(
    Fragment,
    null,
    document.traceparent === undefined
      ? null
      : createElement("meta", { content: document.traceparent, name: "traceparent" }),
    createElement("meta", {
      content: JSON.stringify({ endpoint, serviceInstanceId, serviceName, serviceVersion }),
      name: CONFIG_META_NAME
    })
  )
}

const isText = (value: unknown) => typeof value === "string" && value.length > 0

/** One check per configuration value; the collector endpoint must be an absolute `http:` or `https:` URL. */
const CONFIG_CHECKS: Readonly<Record<keyof BrowserTracingConfig, (value: unknown) => boolean>> = {
  endpoint: (value) =>
    typeof value === "string" && URL.canParse(value) && ["http:", "https:"].includes(new URL(value).protocol),
  serviceInstanceId: (value) => value === undefined || isText(value),
  serviceName: isText,
  serviceVersion: isText
}

const isConfig = (value: object): value is BrowserTracingConfig =>
  Object.entries(CONFIG_CHECKS).every(([key, check]) => check(Reflect.get(value, key)))

/**
 * Reads the rendered configuration synchronously. Without it, nothing is loaded and nothing is requested (FR-003).
 * With it, the SDK chunk is imported lazily and started. Never throws; a failure leaves the page untouched (FR-009).
 */
export function startBrowserTracing(): void {
  try {
    const config = readConfig()
    if (config === undefined) return
    import("./browser-tracing/sdk.ts").then((sdk) => {
      sdk.startSdk(config)
    }).catch(() => undefined)
  } catch {
    // Telemetry never changes the page.
  }
}

/** The rendered configuration, or `undefined` when it is absent or not the four expected values. */
function readConfig(): BrowserTracingConfig | undefined {
  const content = document.querySelector(`meta[name="${CONFIG_META_NAME}"]`)?.getAttribute("content")
  if (content === null || content === undefined) return undefined
  const parsed: unknown = JSON.parse(content)
  if (typeof parsed !== "object" || parsed === null || !isConfig(parsed)) return undefined
  const { endpoint, serviceInstanceId, serviceName, serviceVersion } = parsed
  return { endpoint, serviceInstanceId, serviceName, serviceVersion }
}
