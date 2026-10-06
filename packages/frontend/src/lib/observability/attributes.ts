import type { Attributes, AttributeValue, Context } from "@opentelemetry/api"
import type { ReadableSpan, Span, SpanProcessor } from "@opentelemetry/sdk-trace-base"

export const METHOD_ATTRIBUTE_KEYS = ["http.request.method", "http.method"] as const
export const ROUTE_ATTRIBUTE_KEYS = ["http.route", "next.route"] as const
export const STATUS_ATTRIBUTE_KEYS = [
  "http.response.status_code",
  "http.status_code"
] as const

const PROHIBITED_KEY_PATTERNS: readonly RegExp[] = [
  /^authorization$/i,
  /^http\.request\.header\.authorization$/i,
  /cookie/i,
  /set-cookie/i,
  /session[_-]?id/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /id[_-]?token/i,
  /api[_-]?key/i,
  /password/i,
  /secret/i,
  /bearer/i
]

export interface RequestSpanFacts {
  readonly method: string
  readonly route: string
  readonly statusCode: number
}

/**
 * SpanProcessor that strips prohibited attributes at the register/export boundary
 * so automatic Next request spans cannot bypass helper-only filtering.
 */
export class AttributeSanitizingSpanProcessor implements SpanProcessor {
  readonly #delegate: SpanProcessor | undefined

  constructor(delegate?: SpanProcessor) {
    this.#delegate = delegate
  }

  forceFlush(): Promise<void> {
    return this.#delegate?.forceFlush() ?? Promise.resolve()
  }

  onEnd(span: ReadableSpan): void {
    sanitizeReadableSpanAttributes(span)
    this.#delegate?.onEnd(span)
  }

  onStart(span: Span, parentContext: Context): void {
    this.#delegate?.onStart(span, parentContext)
  }

  shutdown(): Promise<void> {
    return this.#delegate?.shutdown() ?? Promise.resolve()
  }
}

/** Never promote sensitive request headers onto root span attributes. */
export function attributesFromHeadersSafe(
  _headers?: unknown,
  _getter?: unknown
): Attributes | undefined {
  return undefined
}

export function buildRequestSpanAttributes(facts: RequestSpanFacts): Attributes {
  const candidate: Attributes = {
    "http.method": facts.method,
    "http.request.method": facts.method,
    "http.response.status_code": facts.statusCode,
    "http.route": facts.route,
    "http.status_code": facts.statusCode,
    "next.route": facts.route
  }
  return sanitizeSpanAttributes(candidate)
}

export function hasRequiredRequestSpanFacts(attributes: Attributes): boolean {
  const method = firstPresent(attributes, METHOD_ATTRIBUTE_KEYS)
  const route = firstPresent(attributes, ROUTE_ATTRIBUTE_KEYS)
  const status = firstPresent(attributes, STATUS_ATTRIBUTE_KEYS)
  return method !== undefined && route !== undefined && status !== undefined
}

export function isProhibitedAttributeKey(key: string): boolean {
  return PROHIBITED_KEY_PATTERNS.some((pattern) => pattern.test(key))
}

export function rejectProhibitedAttributeCandidates(
  candidates: Attributes
): Attributes {
  return sanitizeSpanAttributes(candidates)
}

export function sanitizeReadableSpanAttributes(span: ReadableSpan): void {
  const attrs = span.attributes as Record<string, AttributeValue | undefined>
  const kept = sanitizeSpanAttributes(attrs)
  for (const key of Object.keys(attrs)) {
    if (!(key in kept)) {
      Reflect.deleteProperty(attrs, key)
    }
  }
}

export function sanitizeSpanAttributes(attributes: Attributes): Attributes {
  const sanitized: Record<string, AttributeValue> = {}
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) {
      continue
    }
    if (isProhibitedAttributeKey(key)) {
      continue
    }
    sanitized[key] = value
  }
  return sanitized
}

function firstPresent(
  attributes: Attributes,
  keys: readonly string[]
): AttributeValue | undefined {
  for (const key of keys) {
    const value = attributes[key]
    if (value !== undefined) {
      return value
    }
  }
  return undefined
}
