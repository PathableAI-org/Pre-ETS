export interface RequestSpanFacts {
  readonly method: string
  readonly route: string
  readonly statusCode: number
}

export type SpanAttributes = Readonly<Record<string, SpanAttributeValue>>

export type SpanAttributeValue = boolean | number | string

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

/** Never promote sensitive request headers onto root span attributes. */
export function attributesFromHeadersSafe(
  _headers?: unknown,
  _getter?: unknown
): SpanAttributes | undefined {
  return undefined
}

export function buildRequestSpanAttributes(facts: RequestSpanFacts): SpanAttributes {
  const candidate: SpanAttributes = {
    "http.method": facts.method,
    "http.request.method": facts.method,
    "http.response.status_code": facts.statusCode,
    "http.route": facts.route,
    "http.status_code": facts.statusCode,
    "next.route": facts.route
  }
  return sanitizeSpanAttributes(candidate)
}

export function hasRequiredRequestSpanFacts(attributes: SpanAttributes): boolean {
  const method = firstPresent(attributes, METHOD_ATTRIBUTE_KEYS)
  const route = firstPresent(attributes, ROUTE_ATTRIBUTE_KEYS)
  const status = firstPresent(attributes, STATUS_ATTRIBUTE_KEYS)
  return method !== undefined && route !== undefined && status !== undefined
}

export function isProhibitedAttributeKey(key: string): boolean {
  return PROHIBITED_KEY_PATTERNS.some((pattern) => pattern.test(key))
}

export function rejectProhibitedAttributeCandidates(
  candidates: Readonly<Record<string, SpanAttributeValue | undefined>>
): SpanAttributes {
  return sanitizeSpanAttributes(candidates)
}

/**
 * Strips prohibited keys at the producer boundary before Effect span annotation.
 * HTTP request spans must call this (via `buildRequestSpanAttributes` /
 * `annotateRequestSpan`) so attributes cannot bypass filtering.
 */
export function sanitizeSpanAttributes(
  attributes: Readonly<Record<string, SpanAttributeValue | undefined>>
): SpanAttributes {
  const sanitized: Record<string, SpanAttributeValue> = {}
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
  attributes: SpanAttributes,
  keys: readonly string[]
): SpanAttributeValue | undefined {
  for (const key of keys) {
    const value = attributes[key]
    if (value !== undefined) {
      return value
    }
  }
  return undefined
}
