import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildRequest, type VerificationRequest } from "../../scripts/verification.ts"
import { featureDir, fixture } from "./support.ts"

const artifacts = {
  plan: fixture("plan.md"),
  quickstart: fixture("quickstart.md"),
  research: fixture("research.md"),
  verification: fixture("verification.md")
}

const request = (sliceId: string, plan = artifacts.plan): VerificationRequest =>
  buildRequest({ ...artifacts, plan }, { featureDir, sha: "a".repeat(40), sliceId })

const claims = (built: VerificationRequest): readonly string[] =>
  built.claims.map((claim) =>
    `${claim.id} ${claim.scope}${claim.scopeNote === undefined ? "" : ` (${claim.scopeNote})`}`
  )

void describe("request generation from the legacy slice table", () => {
  void it("reads a qualified claim as partial, keeping a semicolon inside its qualifier", () => {
    const built = request("A1")
    assert.deepEqual(claims(built), [
      "V-001 partial (gate)",
      "V-004 partial (no-script unknown; server-expired best effort)"
    ])
    assert.deepEqual(built.telemetryRows, ["T-001"])
    assert.deepEqual(built.warnings, [])
    assert.equal(built.source, "legacy-table")
  })

  void it("reads (full) and bare IDs as full claims, and None new as no telemetry rows", () => {
    const built = request("A2")
    assert.deepEqual(claims(built), ["V-006 full", "V-001 partial (action-level path)"])
    assert.deepEqual(built.telemetryRows, [])
  })

  void it("expands ranges with their padding and reads a `partial` prefix", () => {
    const built = request("b")
    assert.deepEqual(claims(built), ["V-009 full", "V-010 full", "V-011 full", "V-012 partial"])
    assert.deepEqual(built.telemetryRows, ["T-002", "T-003"])
  })

  void it("selects the slice's quickstart sections and the shared module evidence", () => {
    assert.deepEqual(request("A1").quickstartSections, [
      { anchor: "module-evidence-every-slice", heading: "Module evidence (every slice)" },
      { anchor: "a1--gate-recovery-slice-a1", heading: "§A1 — Gate recovery (slice A1)" }
    ])
  })

  void it("warns rather than guesses on prose it cannot read, and when a slice has no quickstart section", () => {
    assert.deepEqual(request("C").warnings, [
      "Slice C claims: cannot read \"full manual procedure for all claims\" as a claim ID",
      "Slice C telemetry rows: cannot read \"Uses T-001–T-003 and existing\" as a row ID",
      "Slice C: no quickstart heading names \"(slice C)\""
    ])
  })

  void it("reports an unknown slice as a warning", () => {
    assert.deepEqual(request("Z9").warnings, ["plan.md has no slice \"Z9\""])
  })

  void it("lists approved limitations: unnumbered verification.md bullets by position, plan limitations by ID", () => {
    const limitations = request("A1").approvedLimitations
    assert.deepEqual(limitations.map((limitation) => `${limitation.id} ${limitation.source}`), [
      "VL-1 verification.md (unnumbered bullet 1)",
      "VL-2 verification.md (unnumbered bullet 2)",
      "L-1 research.md",
      "L-2 research.md"
    ])
    assert.match(limitations[1]?.text ?? "", /browser pair actually used\. Other pairs are not established\.$/)
  })
})

void describe("request generation from the structured slice table", () => {
  const structured = [
    "| Slice | Decision | Telemetry rows | Full claims | Partial claims | Quickstart sections |",
    "| ----- | -------- | -------------- | ----------- | -------------- | ------------------- |",
    "| A1    | Denials  | T-001          | V-002       | V-001 (gate)   | Module evidence, §A1 |",
    "| A2    | Forms    | —              | V-006       | —              | §A9                 |"
  ].join("\n")

  void it("reads full and partial columns and the named sections", () => {
    const built = request("A1", structured)
    assert.equal(built.source, "structured")
    assert.deepEqual(claims(built), ["V-002 full", "V-001 partial (gate)"])
    assert.deepEqual(built.quickstartSections.map((section) => section.heading), [
      "Module evidence (every slice)",
      "§A1 — Gate recovery (slice A1)"
    ])
    assert.deepEqual(built.warnings, [])
  })

  void it("warns when a named section does not exist", () => {
    assert.deepEqual(request("A2", structured).warnings, [
      "Slice A2 quickstart sections: no quickstart heading starts with \"§A9\""
    ])
  })
})
