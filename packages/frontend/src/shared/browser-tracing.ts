import type { BrowserTracingDocument } from "@pathableai/pre-ets-frontend-services"

import { createElement, Fragment, type ReactNode } from "react"

/** The one server-to-browser contract: the four configuration values, as JSON in this meta element's `content`. */
const CONFIG_META_NAME = "preets-browser-tracing"

/**
 * Renders the document's `<meta name="traceparent">` and the browser configuration, or nothing when browser tracing
 * is off. Server-safe; React hoists both elements into `<head>`. Written without JSX so the facade keeps the module
 * name the later browser entry and recorders extend.
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
