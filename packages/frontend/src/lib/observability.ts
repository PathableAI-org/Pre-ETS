import type { Attributes } from "@opentelemetry/api"
import type { SpanProcessor } from "@opentelemetry/sdk-trace-base"

import { Config, Effect, Layer, Logger, References } from "effect"

import { AppEnv } from "./config/env.ts"

const DEFAULT_LOG_LEVEL = "Info" as const

const privateAttributeNames = new Set([
  "error.message",
  "error.stack",
  "exception.message",
  "exception.stacktrace",
  "url.fragment",
  "url.password",
  "url.query",
  "url.userinfo",
  "url.username"
])

const locationAttributeNames = new Set([
  "http.route",
  "next.span_name",
  "operation.name",
  "resource.name",
  "url.full",
  "url.original",
  "url.path"
])

const safeLocationText = (value: string): string =>
  (value.split(/[?#]/u, 1)[0] ?? "").replace(/(?:https?:)?\/\/[^\s]+/gu, (target) => {
    try {
      const url = new URL(target, "https://redacted.invalid")
      url.username = ""
      url.password = ""
      return target.startsWith("//") ? `//${url.host}${url.pathname}` : url.href
    } catch {
      return "[invalid URL]"
    }
  })

const sanitizeAttributes = (attributes: Attributes): Attributes => {
  const safe: Attributes = {}
  for (const [key, value] of Object.entries(attributes)) {
    const name = key.toLowerCase()
    if (privateAttributeNames.has(name)) continue
    if (
      locationAttributeNames.has(name) || name.endsWith(".url") || name.endsWith(".fullurl") || name.endsWith(".target")
    ) {
      if (typeof value === "string") safe[key] = safeLocationText(value)
    } else safe[key] = value
  }
  return safe
}

/** Callback probes exposed code/state in automatic http.target attributes.
 * Vercel invokes this processor before its default export processors, with the
 * ended SDK span still mutable. Preserve routing/error categories, not raw URLs
 * or automatic exception text that can contain authentication protocol values.
 */
export const privacySpanProcessor: SpanProcessor = {
  forceFlush: () => Promise.resolve(),
  onEnd: (span) => {
    for (const event of span.events) {
      if (event.attributes !== undefined) Object.assign(event, { attributes: sanitizeAttributes(event.attributes) })
    }
    Object.assign(span, {
      attributes: sanitizeAttributes(span.attributes),
      name: safeLocationText(span.name),
      status: { code: span.status.code }
    })
  },
  onStart: () => undefined,
  shutdown: () => Promise.resolve()
}

/** Fail-soft log knobs for the process-lifetime console logger. */
const appLogConfig = Config.all({
  env: AppEnv,
  logLevel: Config.LogLevel("LOG_LEVEL").pipe(
    Config.orElse(() => Config.succeed(DEFAULT_LOG_LEVEL))
  )
}).pipe(
  // THis should never fail; both fields have orElse guards
  Effect.orDie
)

const prettyConsoleLogger = Logger.consolePretty()

const consoleLoggerForAppEnv = (env: AppEnv): Logger.Logger<unknown, void> =>
  env === "production" ? Logger.consoleJson : prettyConsoleLogger

/** Process-lifetime console logger: JSON in production, pretty otherwise. */
export const appLoggerLayer = (): Layer.Layer<never> =>
  Layer.unwrap(
    Effect.gen(function*() {
      const { env, logLevel } = yield* appLogConfig
      return Layer.mergeAll(
        Logger.layer([consoleLoggerForAppEnv(env)]),
        Layer.succeed(References.MinimumLogLevel, logLevel)
      )
    })
  )
