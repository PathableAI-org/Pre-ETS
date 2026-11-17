import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import { defaultNotesRef, recordReview, validateReview } from "../../scripts/review-findings.ts"
import {
  checkedOut,
  gateApplies,
  recordReport,
  renderResults,
  runGate,
  validateReport
} from "../../scripts/verification.ts"
import { featureDir, sampleRepo, type SampleRepo, sampleReport, sampleReview } from "./support.ts"

type Json = Record<string, unknown>

let repo: SampleRepo
let verified: string

beforeEach(() => {
  repo = sampleRepo("fix-session-expiry")
  verified = repo.commit("fix: expiry", { "src/app.ts": "export const app = 2\n" })
})

afterEach(() => {
  repo.remove()
})

/** The sample report as a High fix: slice `fix`, no feature directory, one established claim. */
const asFix = (report: Json): void => {
  Reflect.deleteProperty(report, "featureDir")
  const [first] = report.claims as Json[]
  Object.assign(report, { claims: [first], sliceId: "fix" })
}

const fixReport = (edit: (report: Json) => void = () => undefined): string =>
  sampleReport(verified, (report) => {
    asFix(report)
    edit(report)
  })

const fixReview = (edit: (review: Json) => void = () => undefined): string =>
  sampleReview(repo.git("rev-parse", "main"), verified, (review) => {
    Reflect.deleteProperty(review, "featureDir")
    review.sliceId = "fix"
    edit(review)
  })

const record = (
  report: (report: Json) => void = () => undefined,
  review: (review: Json) => void = () => undefined
): void => {
  const reported = recordReport(repo.dir, fixReport(report))
  assert.ok(reported.ok, reported.ok ? "" : reported.problems.join("\n"))
  const reviewed = recordReview(repo.dir, defaultNotesRef, fixReview(review))
  assert.ok(reviewed.ok, reviewed.ok ? "" : reviewed.problems.join("\n"))
}

const fixGate = (labels: readonly string[] = ["risk:high"]): readonly string[] => {
  const gate = runGate(repo.dir, checkedOut(repo.dir, labels))
  return gate.ok ? [] : gate.problems
}

void describe("a High fix's report and review schema", () => {
  void it("accepts slice fix without a feature directory, and still requires one for a slice", () => {
    assert.equal(validateReport(JSON.parse(fixReport())).ok, true)
    assert.equal(validateReview(JSON.parse(fixReview())).ok, true)
    const slice = validateReport(JSON.parse(fixReport((report) => {
      report.sliceId = "A1"
    })))
    assert.deepEqual(slice.ok ? [] : slice.problems, ["$.featureDir: required unless sliceId is fix"])
    const review = validateReview(JSON.parse(fixReview((entry) => {
      entry.sliceId = "A1"
    })))
    assert.deepEqual(review.ok ? [] : review.problems, ["$.featureDir: required unless sliceId is fix"])
  })

  void it("has no quickstart to render results into", () => {
    record()
    const rendered = renderResults(repo.dir, verified)
    assert.deepEqual(rendered.ok ? [] : rendered.problems, [
      `the report on ${verified} is for a High fix with no feature directory, so it has no quickstart results`
    ])
  })
})

void describe("the High fix gate", () => {
  void it("passes a fix branch labelled risk:high with an established report and a clean review on HEAD", () => {
    record()
    const gate = runGate(repo.dir, checkedOut(repo.dir, ["risk:high"]))
    assert.equal(gate.ok && gate.value.branch, "fix-session-expiry")
  })

  void it("needs the pull request's labels to gate a branch that is not an implementation slice", () => {
    record()
    const unlabelled = runGate(repo.dir)
    assert.deepEqual(unlabelled.ok ? [] : unlabelled.problems, [
      "fix-session-expiry is not an implementation-slice branch, and no pull request was found to show a High fix"
    ])
    assert.deepEqual(fixGate(["risk:standard"]), [
      "fix-session-expiry is not an implementation-slice branch or a High fix labelled risk:high"
    ])
  })

  void it("fails with no report, and with no review", () => {
    assert.deepEqual(fixGate(), ["no verification report on HEAD or its last 200 ancestors"])
    assert.ok(recordReport(repo.dir, fixReport()).ok)
    assert.deepEqual(fixGate(), ["code review: no review on HEAD or its last 200 ancestors"])
  })

  void it("fails any claim that is not established, an empty report, a missing row, forbidden data, and escalations", () => {
    record((report) => {
      const [first] = report.claims as Json[]
      report.claims = [
        { ...first, result: "violated" },
        { ...first, id: "V-002", limitationId: "L-1", result: "blocked" }
      ]
      report.telemetryRows = [{ id: "T-001", status: "missing" }]
      report.forbiddenData = [{ field: "http.request.header.cookie", signal: "span protectRequest" }]
      report.escalations = [{ detail: "The claim needs a plan.", kind: "plan" }]
    })
    assert.deepEqual(fixGate(), [
      "V-001 is violated; a High fix must establish every claim",
      "V-002 is blocked; a High fix must establish every claim",
      "telemetry row T-001 is missing",
      "forbidden data in span protectRequest field http.request.header.cookie",
      "open escalation (plan): The claim needs a plan."
    ])
  })

  void it("fails a report that names no claim, and a report or review for a slice", () => {
    record((report) => {
      report.claims = []
    }, (review) => {
      Object.assign(review, { featureDir, sliceId: "A1" })
    })
    assert.deepEqual(fixGate(), [
      "the report names no claim",
      "code review: the review is for slice A1, not a High fix (slice fix)"
    ])
  })

  void it("fails an open blocking finding", () => {
    record(undefined, (review) => {
      review.findings = [
        {
          category: "correctness",
          confidence: "high",
          failureScenario: "An expired session renews.",
          file: "src/app.ts",
          id: "R-001",
          line: 1,
          severity: "blocking",
          summary: "Renewal ignores the deadline.",
          verification: "Read renew()."
        }
      ]
    })
    assert.deepEqual(fixGate(), ["code review: R-001 is blocking at src/app.ts:1"])
  })

  void it("counts only a commit that changes nothing as evidence-only", () => {
    record()
    repo.git("commit", "--quiet", "--allow-empty", "--message", "chore: retrigger")
    assert.deepEqual(fixGate(), [])
    repo.commit("docs: results", { [`${featureDir}/quickstart.md`]: "# Quickstart\n\n## Execution results\n\nDone.\n" })
    assert.deepEqual(fixGate(), [
      `commits after the verified SHA change ${featureDir}/quickstart.md`,
      `code review: commits after the reviewed SHA change ${featureDir}/quickstart.md`
    ])
  })

  void it("applies to a High fix and a slice, but not to a High specification or plan branch", () => {
    const applies = (branch: string, labels: readonly string[] = ["risk:high"]): boolean =>
      gateApplies(repo.dir, { branch, head: verified, labels })
    assert.equal(applies("900-sample"), false)
    assert.equal(applies("900-sample-plan"), false)
    assert.equal(applies("fix-session-expiry"), true)
    assert.equal(applies("901-session-expiry"), true)
    assert.equal(applies("900-sample-impl", []), true)
    assert.equal(applies("900-sample-impl-b2", []), true)
    assert.equal(applies("fix-session-expiry", ["risk:standard"]), false)
  })

  void it("reads the feature directory from the tree at the head, not the working tree", () => {
    const head = repo.commit("spec: later feature", { "specs/902-later/spec.md": "# Later\n" })
    assert.equal(gateApplies(repo.dir, { branch: "902-later", head, labels: ["risk:high"] }), false)
    assert.equal(gateApplies(repo.dir, { branch: "902-later", head: verified, labels: ["risk:high"] }), true)
  })

  void it("does not judge a specification or plan branch as a High fix", () => {
    repo.git("checkout", "--quiet", "-b", "900-sample-plan")
    record()
    const gate = runGate(repo.dir, checkedOut(repo.dir, ["risk:high"]))
    assert.deepEqual(gate.ok ? [] : gate.problems, [
      "900-sample-plan is a Spec Kit specification or plan branch, which the gate does not judge"
    ])
  })

  void it("does not let a fix report pass an implementation-slice branch", () => {
    repo.git("checkout", "--quiet", "-b", "900-sample-impl")
    record()
    const gate = runGate(repo.dir)
    assert.ok(!gate.ok)
    assert.deepEqual(gate.problems, ["no verification report for slice A1 of specs/900-sample"])
  })
})
