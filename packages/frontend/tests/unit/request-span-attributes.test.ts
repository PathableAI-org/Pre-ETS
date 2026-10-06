import { describe, expect, it } from "vitest"

import {
  buildRequestSpanAttributes,
  hasRequiredRequestSpanFacts,
  isProhibitedAttributeKey,
  rejectProhibitedAttributeCandidates
} from "../../src/lib/observability/attributes.ts"

describe("request span attributes", () => {
  it("builds required method, route, and status facts", () => {
    const attrs = buildRequestSpanAttributes({
      method: "GET",
      route: "/api/health",
      statusCode: 200
    })

    expect(hasRequiredRequestSpanFacts(attrs)).toBe(true)
    expect(attrs["http.request.method"] ?? attrs["http.method"]).toBe("GET")
    expect(attrs["http.route"] ?? attrs["next.route"]).toBe("/api/health")
    expect(attrs["http.response.status_code"] ?? attrs["http.status_code"]).toBe(200)
  })

  it("negative fixture: rejects Authorization and cookie attribute candidates", () => {
    expect(isProhibitedAttributeKey("Authorization")).toBe(true)
    expect(isProhibitedAttributeKey("http.request.header.authorization")).toBe(true)
    expect(isProhibitedAttributeKey("http.request.header.cookie")).toBe(true)

    const sanitized = rejectProhibitedAttributeCandidates({
      "api_key": "should-not-pass",
      Authorization: "Bearer secret-token",
      "http.method": "GET",
      "http.request.header.authorization": "Bearer secret-token",
      "http.request.header.cookie": "session=abc",
      "http.route": "/api/health",
      "http.status_code": 200
    })

    expect(sanitized.Authorization).toBeUndefined()
    expect(sanitized["http.request.header.authorization"]).toBeUndefined()
    expect(sanitized["http.request.header.cookie"]).toBeUndefined()
    expect(sanitized.api_key).toBeUndefined()
    expect(hasRequiredRequestSpanFacts(sanitized)).toBe(true)
  })
})
