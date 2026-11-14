import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import { latestReview, passes, recordReview, validateReview } from "../../scripts/review-findings.ts"

const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "review-a1.json")

type Json = Record<string, unknown>

const sample = (edit: (review: Json) => void = () => undefined): Json => {
  const review = JSON.parse(readFileSync(fixture, "utf8")) as Json
  edit(review)
  return review
}

const findings = (review: Json): Json[] => review.findings as Json[]

const problems = (edit: (review: Json) => void): readonly string[] => {
  const result = validateReview(sample(edit))
  return result.ok ? [] : result.problems
}

void describe("review schema", () => {
  void it("accepts the sample review, which does not pass while a blocking finding is open", () => {
    const result = validateReview(sample())
    assert.ok(result.ok)
    assert.equal(passes(result.value), false)
  })

  void it("requires how each finding was verified", () => {
    assert.deepEqual(
      problems((review) => {
        Reflect.deleteProperty(findings(review)[0] ?? {}, "verification")
      }),
      ["$.findings[0].verification: expected non-empty text"]
    )
  })

  void it("rejects low-confidence findings", () => {
    assert.deepEqual(
      problems((review) => {
        Object.assign(findings(review)[0] ?? {}, { confidence: "low" })
      }),
      ["$.findings[0].confidence: expected one of high, medium"]
    )
  })

  void it("caps the number of findings", () => {
    const result = problems((review) => {
      const first = findings(review)[0] ?? {}
      review.findings = Array.from({ length: 11 }, (_, index) => ({
        ...first,
        id: `R-${String(index + 1).padStart(3, "0")}`
      }))
    })
    assert.deepEqual(result, ["$.findings: report at most 10 findings"])
  })

  void it("rejects a finding that is both open and closed", () => {
    assert.deepEqual(
      problems((review) => {
        review.closed = [{ closure: "fixed", id: "R-001", note: "fixed in a later commit" }]
      }),
      ["$: R-001 appears more than once"]
    )
  })

  void it("requires a third round escalation while blocking findings stay open", () => {
    assert.deepEqual(
      problems((review) => {
        review.round = 3
      }),
      ["$.escalations: round 3 with open blocking findings needs a third round escalation"]
    )
    assert.deepEqual(
      problems((review) => {
        review.round = 3
        review.escalations = [{ detail: "Still racing after two fixes.", findingIds: ["R-001"], kind: "third round" }]
      }),
      []
    )
  })

  void it("does not pass while an escalation is open, even with no blocking finding", () => {
    const result = validateReview(sample((review) => {
      review.findings = []
      review.closed = [{ closure: "justified", id: "R-001", note: "the plan accepts this ordering" }]
      review.escalations = [{ detail: "Justification disputed.", findingIds: ["R-001"], kind: "disagreement" }]
    }))
    assert.ok(result.ok)
    assert.equal(passes(result.value), false)
  })

  void it("rejects an escalation about an unknown finding, and paths outside the repository", () => {
    assert.deepEqual(
      problems((review) => {
        review.escalations = [{ detail: "Disputed.", findingIds: ["R-009"], kind: "disagreement" }]
      }),
      ["$.escalations[0].findingIds: R-009 is not a finding in this review"]
    )
    assert.deepEqual(
      problems((review) => {
        Object.assign(findings(review)[0] ?? {}, { file: "../outside.ts" })
      }),
      ["$.findings[0].file: expected a repository-relative path"]
    )
  })
})

void describe("review notes", () => {
  let dir = ""
  let base = ""
  let head = ""
  const ref = "refs/notes/review-test"
  const git = (...args: readonly string[]): string =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  const commit = (content: string): string => {
    writeFileSync(join(dir, "app.ts"), content)
    git("add", "--all")
    git("commit", "--quiet", "--message", content)
    return git("rev-parse", "HEAD")
  }
  const reviewJson = (edit: (review: Json) => void = () => undefined): string =>
    JSON.stringify(sample((review) => {
      review.baseSha = base
      review.reviewedSha = head
      edit(review)
    }))

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "review-test-"))
    git("init", "--quiet", "--initial-branch", "main")
    git("config", "user.email", "reviewer@example.test")
    git("config", "user.name", "Reviewer")
    git("config", "commit.gpgsign", "false")
    git("config", "core.hooksPath", "/dev/null")
    base = commit("export const app = 1\n")
    head = commit("export const app = 2\n")
  })

  after(() => {
    rmSync(dir, { force: true, recursive: true })
  })

  void it("records a review on the reviewed SHA and reads back the latest", () => {
    assert.ok(recordReview(dir, ref, reviewJson()).ok)
    const retry = recordReview(
      dir,
      ref,
      reviewJson((review) => {
        review.reviewId = "9d3c2b1a-0f4e-4a5b-8c7d-1e2f3a4b5c6d"
        review.findings = []
        review.closed = [
          { closure: "fixed", id: "R-001", note: "fixed" },
          { closure: "justified", id: "R-002", note: "matches the plan's naming" }
        ]
      })
    )
    assert.ok(retry.ok)
    assert.equal(retry.value.supersedesReviewId, "4b0e6a52-3c1f-4d7e-9f0a-6c2b8d1e5a90")
    const latest = latestReview(dir, ref, "HEAD")
    assert.ok(latest.ok)
    assert.equal(latest.value.reviewId, "9d3c2b1a-0f4e-4a5b-8c7d-1e2f3a4b5c6d")
    assert.ok(passes(latest.value))
    assert.deepEqual(latestReview(dir, ref, base), { ok: false, problems: [`no review on ${base} in ${ref}`] })
  })

  void it("refuses a repeated review ID, an unknown commit, and a ref outside refs/notes", () => {
    assert.deepEqual(recordReview(dir, ref, reviewJson()), {
      ok: false,
      problems: ["review 4b0e6a52-3c1f-4d7e-9f0a-6c2b8d1e5a90 is already recorded on this SHA; use a new UUID"]
    })
    assert.deepEqual(
      recordReview(
        dir,
        ref,
        reviewJson((review) => {
          review.baseSha = "3".repeat(40)
        })
      ),
      {
        ok: false,
        problems: [`${"3".repeat(40)} is not a commit in this repository`]
      }
    )
    assert.deepEqual(recordReview(dir, "refs/heads/main", reviewJson()), {
      ok: false,
      problems: ["refs/heads/main is not a ref under refs/notes/"]
    })
    assert.deepEqual(recordReview(dir, ref, "{"), { ok: false, problems: ["the review is not JSON"] })
  })
})
