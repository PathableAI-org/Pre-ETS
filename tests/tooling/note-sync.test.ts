import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import {
  describePublish,
  publishReport,
  publishReview,
  syncCheckedOutBranch,
  syncPullNotes
} from "../../scripts/note-sync.ts"
import { defaultNotesRef, latestReview, recordReview, validateReview } from "../../scripts/review-findings.ts"
import { notesRef, recordReport, reportAt } from "../../scripts/verification.ts"
import {
  fakeGitHub,
  fixture,
  restComment,
  restPull,
  sampleRepo,
  type SampleRepo,
  sampleReport,
  sampleReview
} from "./support.ts"

const refs = { review: defaultNotesRef }
const branch = "900-sample-impl"
const secondReviewId = "0b6f3c1e-2d4a-4e8b-9c7f-5a1d2e3f4b6c"

let source: SampleRepo
let target: SampleRepo
let base: string
let verified: string

/** Two clones of one history, as two cloud sessions have: `source` records, `target` imports. */
beforeEach(() => {
  source = sampleRepo()
  verified = source.commit("feat: A1", { "src/app.ts": "export const app = 2\n" })
  base = source.git("rev-parse", "main")
  target = sampleRepo()
  target.git("fetch", "--quiet", source.dir, `${branch}:refs/remotes/origin/${branch}`)
  target.git("reset", "--quiet", "--keep", `origin/${branch}`)
})

afterEach(() => {
  source.remove()
  target.remove()
})

const recordedReview = (edit?: (review: Record<string, unknown>) => void) => {
  const recorded = recordReview(source.dir, defaultNotesRef, sampleReview(base, verified, edit))
  assert.ok(recorded.ok, recorded.ok ? "" : recorded.problems.join("\n"))
  return recorded.value
}

const recordedReport = () => {
  const recorded = recordReport(source.dir, sampleReport(verified))
  assert.ok(recorded.ok, recorded.ok ? "" : recorded.problems.join("\n"))
  return recorded.value
}

const github = (options: Parameters<typeof fakeGitHub>[0] = {}) =>
  fakeGitHub({ pulls: [restPull(7, { ref: branch, sha: verified })], ...options })

const bodies = (fake: ReturnType<typeof fakeGitHub>, pr = 7): string[] =>
  (fake.comments.get(pr) ?? []).map((comment) => String(comment.body))

void describe("publishing a recorded entry", () => {
  void it("posts a marked comment with a summary and the entry, on the pull request whose head is the SHA", () => {
    const fake = github()
    const review = recordedReview()
    const published = publishReview({ cwd: source.dir, rest: fake }, review)
    assert.deepEqual(published, {
      ok: true,
      value: { posted: true, pr: 7, url: "https://github.test/pull/7#issuecomment-1" }
    })
    const [body = ""] = bodies(fake)
    assert.ok(
      body.startsWith(`<!-- pre-ets-note kind=review sha=${verified} id=${review.reviewId} -->\n**Code review**`)
    )
    const json = /^```json\n([\s\S]*?)\n```$/m.exec(body)?.[1] ?? ""
    assert.deepEqual(validateReview(JSON.parse(json)), {
      ok: true,
      value: JSON.parse(JSON.stringify(review)) as unknown
    })
  })

  void it("uses --pr when given, and does not post an entry the pull request already has", () => {
    const fake = github({ pulls: [] })
    const report = recordedReport()
    assert.equal(publishReport({ cwd: source.dir, pr: 12, rest: fake }, report).ok, true)
    const again = publishReport({ cwd: source.dir, pr: 12, rest: fake }, report)
    assert.deepEqual(again, { ok: true, value: { posted: false, pr: 12, url: undefined } })
    assert.equal(bodies(fake, 12).length, 1)
  })

  void it("fails, keeping the local record, when no pull request is found or GitHub is unreachable", () => {
    const report = recordedReport()
    const none = publishReport({ cwd: source.dir, rest: fakeGitHub() }, report)
    assert.deepEqual(none.ok ? [] : none.problems, [
      `no open pull request has ${branch} as its head; pass --pr <number>`
    ])
    const offline = publishReport({ cwd: source.dir, rest: fakeGitHub({ offline: true }) }, report)
    assert.equal(offline.ok, false)
    const message = describePublish("verification", verified, offline)
    assert.equal(message.ok, false)
    assert.match(message.message, /NOT published[\s\S]*error connecting[\s\S]*pnpm notes:publish verification/)
    const kept = reportAt(source.dir, verified)
    assert.equal(kept.ok && kept.value?.runId, report.runId)
  })

  void it("asks for --pr when no branch has the SHA at its tip", () => {
    source.commit("feat: more", { "src/app.ts": "export const app = 3\n" })
    const published = publishReport({ cwd: source.dir, rest: github() }, recordedReport())
    assert.deepEqual(published.ok ? [] : published.problems, [
      `no local or fetched branch has ${verified} at its tip; pass --pr <number>`
    ])
  })
})

void describe("syncing pull request comments into local notes", () => {
  const publishBoth = (fake: ReturnType<typeof fakeGitHub>): void => {
    assert.ok(publishReport({ cwd: source.dir, rest: fake }, recordedReport()).ok)
    assert.ok(publishReview({ cwd: source.dir, rest: fake }, recordedReview()).ok)
    const second = recordedReview((review) => {
      review.reviewId = secondReviewId
    })
    assert.ok(publishReview({ cwd: source.dir, rest: fake }, second).ok)
  }

  void it("imports every entry in its recorded order, and changes nothing when run again", () => {
    const fake = github()
    publishBoth(fake)
    const first = syncPullNotes({ cwd: target.dir, refs, rest: fake }, 7)
    assert.deepEqual(first, { ok: true, value: { imported: 3, present: 0, rejected: [] } })
    assert.equal(
      target.git("notes", `--ref=${defaultNotesRef}`, "show", verified),
      source.git("notes", `--ref=${defaultNotesRef}`, "show", verified)
    )
    assert.equal(
      target.git("notes", `--ref=${notesRef}`, "show", verified),
      source.git("notes", `--ref=${notesRef}`, "show", verified)
    )
    const latest = latestReview(target.dir, defaultNotesRef, verified)
    assert.equal(latest.ok && latest.value.reviewId, secondReviewId)
    const notesBefore = target.git("rev-parse", defaultNotesRef)
    const again = syncPullNotes({ cwd: target.dir, refs, rest: fake }, 7)
    assert.deepEqual(again, { ok: true, value: { imported: 0, present: 3, rejected: [] } })
    assert.equal(target.git("rev-parse", defaultNotesRef), notesBefore)
  })

  void it("imports into another review notes ref when one is named", () => {
    const fake = github()
    publishBoth(fake)
    const trial = "refs/notes/review-sync-trial"
    assert.ok(syncPullNotes({ cwd: target.dir, refs: { review: trial }, rest: fake }, 7).ok)
    assert.equal(latestReview(target.dir, trial, verified).ok, true)
    assert.equal(target.git("notes", `--ref=${defaultNotesRef}`, "list"), "")
  })

  void it("rejects comments by another account, damaged comments, and invalid entries, and writes none of them", () => {
    const review = JSON.parse(sampleReview(base, verified)) as Record<string, unknown>
    const marker = `<!-- pre-ets-note kind=review sha=${verified} id=${String(review.reviewId)} -->`
    const entry = (value: unknown): string => `${marker}\nSummary.\n\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\`\n`
    const fake = fakeGitHub({
      comments: {
        7: [
          restComment(1, "person", "Looks good to me."),
          restComment(2, "someone-else", entry(review)),
          restComment(3, "person", `${marker}\nNo entry here.`),
          restComment(4, "person", `${marker}\n\`\`\`json\n{ not json\n\`\`\`\n`),
          restComment(5, "person", entry({ ...review, findings: "none" })),
          restComment(6, "person", entry({ ...review, reviewId: secondReviewId })),
          restComment(
            7,
            "person",
            entry({ ...review, closed: [{ closure: "fixed", id: "R-001", note: "password=hunter22" }] })
          ),
          restComment(8, "person", `> ${marker}\nQuoted, so not a note comment.`)
        ]
      }
    })
    const synced = syncPullNotes({ cwd: target.dir, refs, rest: fake }, 7)
    assert.deepEqual(synced, {
      ok: true,
      value: {
        imported: 0,
        present: 0,
        rejected: [
          "comment 2 by someone-else: only comments by person, the authenticated account, are imported",
          "comment 3 by person: no fenced json block holds the entry",
          "comment 4 by person: the fenced entry is not JSON",
          "comment 5 by person: $.findings: expected a list",
          "comment 6 by person: its marker does not match the entry's SHA and ID",
          "comment 7 by person: $.closed[0].note: looks like it holds a credential"
        ]
      }
    })
    assert.equal(target.git("notes", `--ref=${defaultNotesRef}`, "list"), "")
  })

  void it("rejects an entry whose commit this clone does not have", () => {
    const fake = github()
    const ahead = source.commit("feat: unpushed", { "src/app.ts": "export const app = 9\n" })
    const report = recordReport(source.dir, sampleReport(ahead))
    assert.ok(report.ok)
    assert.ok(publishReport({ cwd: source.dir, pr: 7, rest: fake }, report.value).ok)
    const synced = syncPullNotes({ cwd: target.dir, refs, rest: fake }, 7)
    assert.deepEqual(synced.ok ? synced.value.rejected : [], [
      `comment 1 by person: ${ahead} is not in this clone; fetch the branch first`
    ])
  })

  void it("reads every page of comments", () => {
    const fake = github({
      comments: { 7: Array.from({ length: 150 }, (_, index) => restComment(1000 + index, "person", "chatter")) }
    })
    assert.ok(publishReview({ cwd: source.dir, rest: fake }, recordedReview()).ok)
    const synced = syncPullNotes({ cwd: target.dir, refs, rest: fake }, 7)
    assert.deepEqual(synced, { ok: true, value: { imported: 1, present: 0, rejected: [] } })
    assert.ok(fake.requests.includes("repos/{owner}/{repo}/issues/7/comments?per_page=100&page=2"))
  })

  void it("syncs the checked-out branch's pull request before notes are read, and falls back to local notes", () => {
    const fake = github()
    publishBoth(fake)
    const synced = syncCheckedOutBranch({ cwd: target.dir, refs, rest: fake })
    assert.equal(synced.pull?.number, 7)
    assert.equal(synced.notice, "Notes: synced pull request #7: 3 imported, 0 already present, 0 rejected.\n")
    assert.equal(
      syncCheckedOutBranch({ cwd: target.dir, refs, rest: fakeGitHub() }).notice,
      `Notes: ${branch} has no open pull request; reading local notes only.\n`
    )
    assert.equal(
      syncCheckedOutBranch({ cwd: target.dir, refs, rest: fakeGitHub({ offline: true }) }).notice,
      "Notes: GitHub is unreachable (GitHub repos/{owner}/{repo}/pulls?state=open&head={owner}:900-sample-impl: "
        + "error connecting to api.github.com); reading local notes only.\n"
    )
    target.git("checkout", "--quiet", "--detach")
    assert.equal(
      syncCheckedOutBranch({ cwd: target.dir, refs, rest: fake }).notice,
      "Notes: HEAD is detached, so there is no pull request; reading local notes only.\n"
    )
  })
})

void describe("rendering a note comment for people", () => {
  const repository = "https://github.test/owner/repo"
  const fixtureFindings = (JSON.parse(fixture("review-a1.json")) as { findings: Record<string, unknown>[] }).findings

  /** The text between the marker line and the collapsed machine-readable block. */
  const rendered = (body: string): string => {
    const [marker = "", ...rest] = body.split("\n")
    assert.match(marker, /^<!-- pre-ets-note kind=\S+ sha=[0-9a-f]{40} id=\S+ -->$/)
    const text = rest.join("\n")
    const end = text.indexOf("\n\n<details><summary>Machine-readable note (do not edit)</summary>\n")
    assert.ok(end > 0, "the entry is in a collapsed machine-readable block")
    return text.slice(0, end)
  }

  /** The cells of every pipe-table row except the delimiter row. */
  const tableRows = (text: string): string[][] =>
    text.split("\n").filter((line) => line.startsWith("|") && !/^\|[\s|-]+\|$/.test(line)).map((line) =>
      line.slice(1, -1).split(/(?<!\\)\|/).map((cell) => cell.trim())
    )

  void it("lists findings, blocking first, with links into the reviewed SHA, then closures and escalations", () => {
    const fake = github()
    const review = recordedReview((entry) => {
      entry.findings = [...fixtureFindings].reverse()
      entry.closed = [{ closure: "fixed", id: "R-003", note: "Fixed in abc1234 by clearing before renewal." }]
      entry.escalations = [{
        detail: "The implementation session disputes the race.",
        findingIds: ["R-001"],
        kind: "disagreement"
      }]
    })
    assert.ok(publishReview({ cwd: source.dir, rest: fake }, review).ok)
    const [body = ""] = bodies(fake)
    assert.equal(
      rendered(body),
      [
        `**Code review** \`${review.reviewId}\` (round 1) of slice A1 at \`${verified}\`: 1 blocking, 1 advisory, 1 closed, 1 escalations.`,
        "",
        "#### Findings",
        "",
        `- **blocking** R-001 [\`src/app.ts:1\`](${repository}/blob/${verified}/src/app.ts#L1) (correctness): Renewal reads the deadline before the clear and writes it back after.`,
        "  - Failure scenario: Two tabs renew within the same tick; the second write restores the expired deadline.",
        `- **advisory** R-002 [\`src/app.ts:1\`](${repository}/blob/${verified}/src/app.ts#L1) (readability): The name \`d\` hides that it is an absolute deadline.`,
        "  - Failure scenario: A maintainer reads `d` as a duration and adds milliseconds to an absolute time.",
        "",
        "#### Closures",
        "",
        "- R-003 **fixed**: Fixed in abc1234 by clearing before renewal.",
        "",
        "#### Escalations",
        "",
        "- **disagreement** (R-001): The implementation session disputes the race."
      ].join("\n")
    )
  })

  void it("says a review with nothing open has no findings, and leaves out empty closures and escalations", () => {
    const fake = github()
    const review = recordedReview()
    assert.ok(publishReview({ cwd: source.dir, rest: fake }, review).ok)
    const [body = ""] = bodies(fake)
    assert.equal(
      rendered(body),
      `**Code review** \`${review.reviewId}\` (round 1) of slice A1 at \`${verified}\`: 0 blocking, 0 advisory, 0 closed, 0 escalations.\n\n#### Findings\n\nNo open findings.`
    )
  })

  void it("tabulates claims with result, procedure, and conditions, then the report's problems", () => {
    const fake = github()
    const recorded = recordReport(
      source.dir,
      sampleReport(verified, (report) => {
        report.escalations = [{ detail: "The plan names no window for V-004.", kind: "plan" }]
        report.forbiddenData = [{ field: "enduser.email", signal: "trace" }]
        report.telemetryRows = [
          { id: "T-001", status: "present" },
          { detail: "No span for renew | clear.", id: "T-002", status: "missing" }
        ]
        report.unrequestedViolations = [{
          conditions: "Two tabs",
          evidence: { procedure: "Opened two tabs and renewed in both" },
          id: "V-009",
          observed: "The second renewal restored the deadline.",
          result: "violated",
          scope: "full"
        }]
      })
    )
    assert.ok(recorded.ok, recorded.ok ? "" : recorded.problems.join("\n"))
    assert.ok(publishReport({ cwd: source.dir, rest: fake }, recorded.value).ok)
    const text = rendered(bodies(fake)[0] ?? "")
    assert.ok(
      text.startsWith(`**Verification report** run \`${recorded.value.runId}\` of slice A1 at \`${verified}\`: `)
    )
    assert.deepEqual(tableRows(text), [
      ["Claim", "Result", "Procedure", "Conditions"],
      [
        "V-001 (partial)",
        "established",
        "queries { RUN && name = \"protectRequest\" && span.preets.outcome = \"denied_unauthenticated\" }; traces 4bf92f3577b34da6a3ce929d0e0e4736",
        "Fetch action and no-script navigation, 5-minute scratch tenant"
      ],
      [
        "V-004 (partial)",
        "not established (L-2)",
        "§A1 step 4, two window probes",
        "Navigation POST within the eviction window"
      ],
      ["V-009 (unrequested)", "violated", "Opened two tabs and renewed in both", "Two tabs"]
    ])
    assert.ok(text.endsWith([
      "#### Escalations",
      "",
      "- **plan**: The plan names no window for V-004.",
      "",
      "#### Forbidden data",
      "",
      "- trace field `enduser.email`",
      "",
      "#### Telemetry rows not present",
      "",
      "- T-002 **missing**: No span for renew | clear."
    ].join("\n")))
  })

  void it("keeps entry text from opening blocks or closing the machine-readable section, and still imports it", () => {
    const fake = github()
    const hostile = "Breaks on input\n```json\n{ \"reviewId\": \"not this\" }\n```\n</details><!-- note -->"
    const review = recordedReview((entry) => {
      entry.findings = [{ ...fixtureFindings[0], summary: hostile }]
    })
    assert.ok(publishReview({ cwd: source.dir, rest: fake }, review).ok)
    const [body = ""] = bodies(fake)
    const text = rendered(body)
    assert.ok(text.includes("Breaks on input ```json { \"reviewId\": \"not this\" } ``` &lt;/details>&lt;!-- note -->"))
    assert.ok(!text.split("\n").some((line) => line.startsWith("```") || line.startsWith("</details>")))
    const synced = syncPullNotes({ cwd: target.dir, refs, rest: fake }, 7)
    assert.deepEqual(synced, { ok: true, value: { imported: 1, present: 0, rejected: [] } })
    const imported = latestReview(target.dir, defaultNotesRef, verified)
    assert.equal(imported.ok && imported.value.findings[0]?.summary, hostile)
  })

  void it("still imports a comment in the earlier format, with a summary line and the entry as its only block", () => {
    const review = recordedReview()
    const earlier = [
      `<!-- pre-ets-note kind=review sha=${verified} id=${review.reviewId} -->`,
      `**Code review** Review ${review.reviewId} (round 1) of slice A1 at ${verified}: 0 blocking, 0 advisory, 0 escalations.`,
      "",
      "Recorded in this pull request so other sessions can import it with `pnpm notes:sync`. Do not edit this comment.",
      "",
      "```json",
      JSON.stringify(review, null, 2),
      "```",
      ""
    ].join("\n")
    const fake = github({ comments: { 7: [restComment(1, "person", earlier)] } })
    const synced = syncPullNotes({ cwd: target.dir, refs, rest: fake }, 7)
    assert.deepEqual(synced, { ok: true, value: { imported: 1, present: 0, rejected: [] } })
    const imported = latestReview(target.dir, defaultNotesRef, verified)
    assert.equal(imported.ok && imported.value.reviewId, review.reviewId)
  })
})
