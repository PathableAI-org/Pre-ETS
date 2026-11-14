import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { validateReport } from "../../scripts/verification.ts"
import { sampleReport } from "./support.ts"

const sha = "b".repeat(40)

const problems = (edit: (report: Record<string, unknown>) => void): readonly string[] => {
  const result = validateReport(JSON.parse(sampleReport(sha, edit)))
  return result.ok ? [] : result.problems
}

const firstClaim = (report: Record<string, unknown>): Record<string, unknown> =>
  (report.claims as Record<string, unknown>[])[0] ?? {}

void describe("report schema", () => {
  void it("accepts the sample report", () => {
    assert.deepEqual(problems(() => undefined), [])
  })

  void it("requires a limitation for a result that is not established", () => {
    assert.deepEqual(
      problems((report) => {
        Object.assign(firstClaim(report), { result: "blocked" })
      }),
      ["$.claims[0].limitationId: required for a blocked result"]
    )
  })

  void it("requires evidence of some kind", () => {
    assert.deepEqual(
      problems((report) => {
        firstClaim(report).evidence = { traceIds: [] }
      }),
      ["$.claims[0].evidence: give trace IDs, queries, or the procedure"]
    )
  })

  void it("rejects text that looks like a credential", () => {
    assert.deepEqual(
      problems((report) => {
        report.environment = "OTEL_EXPORTER_OTLP_HEADERS authorization=Basic Zm9vOmJhcg=="
      }),
      ["$.environment: looks like it holds a credential"]
    )
  })

  void it("accepts a forbidden-data field name but not a value", () => {
    assert.deepEqual(
      problems((report) => {
        report.forbiddenData = [{ field: "http.request.header.cookie", signal: "span protectRequest" }]
      }),
      []
    )
    assert.deepEqual(
      problems((report) => {
        report.forbiddenData = [{ field: "pathable-session abc123 def", signal: "log" }]
      }),
      ["$.forbiddenData[0].field: expected a field name without spaces, never a value"]
    )
  })

  void it("rejects an abbreviated SHA, an unknown result, and unknown fields", () => {
    assert.deepEqual(
      problems((report) => {
        report.verifiedSha = "860f620"
        report.extra = true
        Object.assign(firstClaim(report), { result: "passed" })
      }),
      [
        "$.extra: unknown field",
        "$.claims[0].result: expected one of established, violated, not established, blocked",
        "$.verifiedSha: expected a full 40-character commit SHA"
      ]
    )
  })
})
