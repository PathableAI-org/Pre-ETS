/**
 * The human-readable part of a note comment, generated from the entry alone so it always matches the JSON below it.
 * Entry text is written as single-line inline text: line breaks are collapsed and anything that would open an HTML
 * tag is escaped, so an entry cannot end the comment's `<details>` block or start a fenced block of its own.
 */
import type { Review } from "../review-findings.ts"
import type { VerificationReport } from "../verification.ts"

import { cell, table } from "../markdown.ts"

type Claim = VerificationReport["claims"][number]

/** Entry text as one line of inline markdown that cannot open an HTML tag or comment. */
const inline = (value: string): string => value.replace(/\s+/g, " ").trim().replace(/<(?=[A-Za-z/!?])/g, "&lt;")

const count = (entries: readonly unknown[], noun: string): string => `${String(entries.length)} ${noun}`

/** A titled section, or nothing when it has no lines. */
const section = (title: string, lines: readonly string[]): readonly string[] =>
  lines.length === 0 ? [] : ["", `#### ${title}`, "", ...lines]

const severity = (review: Review, level: Review["findings"][number]["severity"]): Review["findings"] =>
  review.findings.filter((finding) => finding.severity === level)

/** The blob URL of `file` at `line` in the reviewed SHA. */
const blobUrl = (repository: string, sha: string, file: string, line: number): string =>
  `${repository}/blob/${sha}/${file.split("/").map(encodeURIComponent).join("/")}#L${String(line)}`

/** Blocking findings first, then advisory ones, each in recorded order. */
const findingLines = (review: Review, repository: string): readonly string[] =>
  [...severity(review, "blocking"), ...severity(review, "advisory")].flatMap((finding) => {
    const location = `${finding.file}:${String(finding.line)}`
    return [
      `- **${finding.severity}** ${finding.id} [\`${inline(location)}\`](${
        blobUrl(repository, review.reviewedSha, finding.file, finding.line)
      }) (${finding.category}): ${inline(finding.summary)}`,
      `  - Failure scenario: ${inline(finding.failureScenario)}`
    ]
  })

/** The review's headline, open findings with links into the reviewed SHA, closures, and escalations. */
export const renderReview = (review: Review, repository: string): string => {
  return [
    `**Code review** \`${review.reviewId}\` (round ${
      String(review.round)
    }) of slice ${review.sliceId} at \`${review.reviewedSha}\`: ${count(severity(review, "blocking"), "blocking")}, ${
      count(severity(review, "advisory"), "advisory")
    }, ${count(review.closed, "closed")}, ${count(review.escalations, "escalations")}.`,
    "",
    "#### Findings",
    "",
    ...(review.findings.length === 0 ? ["No open findings."] : findingLines(review, repository)),
    ...section(
      "Closures",
      review.closed.map((closed) => `- ${closed.id} **${closed.closure}**: ${inline(closed.note)}`)
    ),
    ...section(
      "Escalations",
      review.escalations.map((escalation) =>
        `- **${escalation.kind}**${
          escalation.findingIds.length === 0 ? "" : ` (${escalation.findingIds.join(", ")})`
        }: ${inline(escalation.detail)}`
      )
    )
  ].join("\n")
}

const claimResults = ["established", "violated", "not established", "blocked"] as const

const reportHeadline = (report: VerificationReport): string => {
  const results = claimResults.flatMap((result) => {
    const matching = report.claims.filter((claim) => claim.result === result)
    return matching.length > 0 ? [count(matching, result)] : []
  })
  return `**Verification report** run \`${report.runId}\` of slice ${report.sliceId} at \`${report.verifiedSha}\`: ${
    results.length > 0 ? results.join(", ") : "no claims"
  }; ${count(report.telemetryRows.filter((row) => row.status !== "present"), "telemetry rows not present")}; ${
    count(report.forbiddenData, "forbidden-data findings")
  }; ${count(report.escalations, "escalations")}.`
}

/** The procedure behind a claim: the stated procedure, else the queries and traces it rests on. */
const procedure = (claim: Claim): string => {
  const { procedure: stated, queries = [], traceIds = [] } = claim.evidence
  if (stated !== undefined) return stated
  return [
    queries.length === 0 ? "" : `queries ${queries.join("; ")}`,
    traceIds.length === 0 ? "" : `traces ${traceIds.join(", ")}`
  ].filter((part) => part.length > 0).join("; ")
}

const claimRow = (claim: Claim, unrequested: boolean): readonly string[] => [
  `${claim.id}${claim.scope === "partial" ? " (partial)" : ""}${unrequested ? " (unrequested)" : ""}`,
  claim.limitationId === undefined ? claim.result : `${claim.result} (${claim.limitationId})`,
  cell(inline(procedure(claim))),
  cell(inline(claim.conditions))
]

/** The report's headline, a claims table, then any escalations, forbidden data, and telemetry rows not present. */
export const renderReport = (report: VerificationReport): string => {
  const rows = [
    ...report.claims.map((claim) => claimRow(claim, false)),
    ...report.unrequestedViolations.map((claim) => claimRow(claim, true))
  ]
  return [
    reportHeadline(report),
    "",
    "#### Claims",
    "",
    rows.length === 0 ? "No claims." : table(["Claim", "Result", "Procedure", "Conditions"], rows),
    ...section(
      "Escalations",
      report.escalations.map((escalation) => `- **${escalation.kind}**: ${inline(escalation.detail)}`)
    ),
    ...section(
      "Forbidden data",
      report.forbiddenData.map((finding) => `- ${inline(finding.signal)} field \`${finding.field}\``)
    ),
    ...section(
      "Telemetry rows not present",
      report.telemetryRows.filter((row) => row.status !== "present").map((row) =>
        `- ${row.id} **${row.status}**${row.detail === undefined ? "" : `: ${inline(row.detail)}`}`
      )
    )
  ].join("\n")
}
