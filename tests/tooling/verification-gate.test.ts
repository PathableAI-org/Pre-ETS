import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import { defaultNotesRef, recordReview } from "../../scripts/review-findings.ts"
import { notesRef, recordReport, renderResults, reportAt, runGate } from "../../scripts/verification.ts"
import { featureDir, fixture, sampleRepo, type SampleRepo, sampleReport, sampleReview } from "./support.ts"

const hook = fileURLToPath(new URL("../../scripts/pr-ready-hook.ts", import.meta.url))

let repo: SampleRepo
let verified: string

beforeEach(() => {
  repo = sampleRepo()
  verified = repo.commit("feat: A1", { "src/app.ts": "export const app = 2\n" })
})

afterEach(() => {
  repo.remove()
})

const review = (edit?: (review: Record<string, unknown>) => void): void => {
  const recorded = recordReview(repo.dir, defaultNotesRef, sampleReview(repo.git("rev-parse", "main"), verified, edit))
  assert.ok(recorded.ok, recorded.ok ? "" : recorded.problems.join("\n"))
}

/** Records a verification report on the verified SHA, and a passing code review the first time. */
const record = (edit?: (report: Record<string, unknown>) => void): void => {
  const recorded = recordReport(repo.dir, sampleReport(verified, edit))
  assert.ok(recorded.ok, recorded.ok ? "" : recorded.problems.join("\n"))
  if (repo.git("notes", `--ref=${defaultNotesRef}`, "list").length === 0) review()
}

const gateProblems = (): readonly string[] => {
  const gate = runGate(repo.dir)
  return gate.ok ? [] : gate.problems
}

const claim = (report: Record<string, unknown>, index: number): Record<string, unknown> =>
  (report.claims as Record<string, unknown>[])[index] ?? {}

void describe("recording reports in git notes", () => {
  void it("attaches the report to the verified SHA under the verification notes ref", () => {
    record()
    assert.match(repo.git("notes", `--ref=${notesRef}`, "list"), new RegExp(` ${verified}$`))
    const latest = reportAt(repo.dir, verified)
    assert.equal(latest.ok && latest.value?.runId, "79b28959-742b-4ba0-84dc-e25bb8a345dc")
  })

  void it("keeps an earlier report when a retry on the same SHA supersedes it", () => {
    record()
    record((report) => {
      report.runId = "59161d0e-59d5-4379-8d7c-736a2fd48c5b"
    })
    const note = JSON.parse(repo.git("notes", `--ref=${notesRef}`, "show", verified)) as {
      reports: { runId: string; supersedesRunId?: string }[]
    }
    assert.deepEqual(note.reports.map((report) => [report.runId, report.supersedesRunId]), [
      ["79b28959-742b-4ba0-84dc-e25bb8a345dc", undefined],
      ["59161d0e-59d5-4379-8d7c-736a2fd48c5b", "79b28959-742b-4ba0-84dc-e25bb8a345dc"]
    ])
  })

  void it("refuses a second report with the same run ID and an invalid report", () => {
    record()
    const again = recordReport(repo.dir, sampleReport(verified))
    assert.deepEqual(again.ok ? [] : again.problems, [
      "run 79b28959-742b-4ba0-84dc-e25bb8a345dc is already recorded on this SHA; each run needs a new UUID"
    ])
    const invalid = recordReport(repo.dir, "{}")
    assert.equal(invalid.ok, false)
  })
})

void describe("the verification gate", () => {
  void it("passes when the latest report on HEAD meets every rule, with an approved limitation on a partial claim", () => {
    record()
    assert.deepEqual(gateProblems(), [])
  })

  void it("fails with no report", () => {
    assert.deepEqual(gateProblems(), ["no verification report on HEAD or its last 200 ancestors"])
  })

  void it("judges only the latest report on the SHA", () => {
    record()
    record((report) => {
      report.runId = "59161d0e-59d5-4379-8d7c-736a2fd48c5b"
      Object.assign(claim(report, 0), { result: "violated" })
    })
    assert.deepEqual(gateProblems(), ["V-001 is violated"])
  })

  void it("fails a limitation the plan and verification.md do not approve", () => {
    record((report) => {
      Object.assign(claim(report, 1), { limitationId: "L-9" })
    })
    assert.deepEqual(gateProblems(), ["V-004 is not established under L-9, which is not approved"])
  })

  void it("fails a missing claim, a wrong scope, a missing telemetry row, forbidden data, and an open escalation", () => {
    record((report) => {
      report.claims = [{ ...claim(report, 0), scope: "full" }]
      report.telemetryRows = [{ detail: "no denial_cause attribute", id: "T-001", status: "unusable" }]
      report.forbiddenData = [{ field: "http.request.header.cookie", signal: "span protectRequest" }]
      report.escalations = [{ detail: "T-001 lacks the attribute V-004 needs", kind: "plan" }]
    })
    assert.deepEqual(gateProblems(), [
      "V-001 is reported as full but the plan assigns it partial",
      "V-004 has no result",
      "telemetry row T-001 is unusable",
      "forbidden data in span protectRequest field http.request.header.cookie",
      "open escalation (plan): T-001 lacks the attribute V-004 needs"
    ])
  })

  void it("accepts an evidence-only commit that changes only the quickstart execution results", () => {
    record()
    const quickstart = fixture("quickstart.md").replace("No results recorded yet.", "### Slice A1 — results\n\nDone.")
    repo.commit("docs: record A1 results", { [`${featureDir}/quickstart.md`]: quickstart })
    assert.deepEqual(gateProblems(), [])
  })

  void it("fails when a commit after the verified SHA changes run instructions or code", () => {
    record()
    const steps = fixture("quickstart.md").replace("Post the action after the deadline.", "Post it twice.")
    repo.commit("docs: change a step", { [`${featureDir}/quickstart.md`]: steps })
    assert.deepEqual(gateProblems(), [
      `commits after the verified SHA change ${featureDir}/quickstart.md outside its execution results`,
      `code review: commits after the reviewed SHA change ${featureDir}/quickstart.md outside its execution results`
    ])
    repo.commit("fix: code", { "src/app.ts": "export const app = 3\n" })
    assert.deepEqual(gateProblems(), [
      "commits after the verified SHA change src/app.ts",
      "code review: commits after the reviewed SHA change src/app.ts"
    ])
  })

  void it("fails a report for a different slice than the branch", () => {
    repo.git("checkout", "--quiet", "-b", "900-sample-impl-a2")
    record()
    assert.ok(gateProblems().includes("the report is for slice A1, but this branch is slice a2"))
  })
})

void describe("the code review half of the gate", () => {
  void it("fails a verified slice with no code review", () => {
    assert.ok(recordReport(repo.dir, sampleReport(verified)).ok)
    assert.deepEqual(gateProblems(), ["code review: no review on HEAD or its last 200 ancestors"])
  })

  void it("fails while the latest review has an open blocking finding or escalation, and passes once closed", () => {
    record()
    const blocking = JSON.parse(fixture("review-a1.json")) as { findings: unknown[] }
    review((entry) => {
      Object.assign(entry, { findings: blocking.findings, reviewId: "0b6f3c1e-2d4a-4e8b-9c7f-5a1d2e3f4b6c" })
    })
    assert.deepEqual(gateProblems(), ["code review: R-001 is blocking at src/app.ts:1"])
    review((entry) => {
      Object.assign(entry, {
        closed: [{ closure: "justified", id: "R-001", note: "the plan accepts this ordering" }],
        escalations: [{ detail: "Justification disputed.", findingIds: ["R-001"], kind: "disagreement" }],
        reviewId: "6e2d9a4b-1c3f-4b7a-8e5d-0f9c2b4a6d1e"
      })
    })
    assert.deepEqual(gateProblems(), ["code review: open escalation (disagreement): Justification disputed."])
    review((entry) => {
      Object.assign(entry, {
        closed: [{ closure: "justified", id: "R-001", note: "the maintainer accepted the ordering" }],
        reviewId: "c4a1e7d2-8b3f-4c6a-9d0e-2f5b7a1c3e9d"
      })
    })
    assert.deepEqual(gateProblems(), [])
  })

  void it("fails a review for a different slice than the branch", () => {
    repo.git("checkout", "--quiet", "-b", "900-sample-impl-a2")
    record()
    assert.ok(gateProblems().includes("code review: the review is for slice A1, but this branch is slice a2"))
  })
})

void describe("rendering quickstart execution results", () => {
  void it("renders the slice heading, claim table with limitations, and appends to the execution results", () => {
    record()
    const rendered = renderResults(repo.dir, verified)
    assert.ok(rendered.ok)
    const { rendered: text, updated } = rendered.value
    assert.match(text, new RegExp(`^### Slice A1 — \`${verified}\` \\(2026-11-13\\)\n`))
    assert.match(text, /\| V-001 \(gate\) +\| established +\| A removed record/)
    assert.match(text, /\| V-004 \(no-script unknown; server-expired best effort\) \| not established \(L-2\) \|/)
    assert.match(text, /\*\*Telemetry rows:\*\* T-001 present\./)
    assert.ok(updated?.endsWith(`No results recorded yet.\n\n${text}`))
  })

  void it("marks an earlier result for the slice stale, and names a superseded run on the same SHA", () => {
    record()
    record((report) => {
      report.runId = "59161d0e-59d5-4379-8d7c-736a2fd48c5b"
    })
    const earlier = fixture("quickstart.md").replace(
      "No results recorded yet.",
      "### Slice A1 — `1234567` (2026-11-12)"
    )
    writeFileSync(join(repo.dir, featureDir, "quickstart.md"), earlier)
    const rendered = renderResults(repo.dir, verified)
    assert.ok(rendered.ok)
    assert.match(
      rendered.value.rendered,
      /This run supersedes the `1234567` report above\. This run supersedes run `79b28959-742b-4ba0-84dc-e25bb8a345dc` at the same revision\./
    )
  })
})

void describe("the gh pr ready hook", () => {
  const runHook = (command: string): { status: null | number; stderr: string } => {
    const result = spawnSync(process.execPath, [hook], {
      encoding: "utf8",
      input: JSON.stringify({ cwd: repo.dir, tool_input: { command }, tool_name: "Bash" })
    })
    return { status: result.status, stderr: result.stderr }
  }

  void it("blocks gh pr ready on an implementation branch whose gate fails", () => {
    const blocked = runHook("gh pr ready")
    assert.equal(blocked.status, 2)
    assert.match(blocked.stderr, /code review gate fails[\s\S]*no verification report on HEAD/)
  })

  void it("allows gh pr ready once the gate passes, and ignores other commands and branches", () => {
    assert.equal(runHook("git status").status, 0)
    assert.equal(runHook("gh pr ready --undo").status, 0)
    record()
    assert.equal(runHook("pnpm check:changes && gh pr ready").status, 0)
    repo.git("checkout", "--quiet", "-b", "claude/tooling")
    repo.commit("chore: unrelated", { "src/app.ts": "export const app = 4\n" })
    assert.equal(runHook("gh pr ready").status, 0)
  })
})
