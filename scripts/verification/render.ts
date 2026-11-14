import type { ClaimReport, VerificationReport } from "./report.ts"
import type { VerificationRequest } from "./request.ts"

/**
 * Renders a report as the slice's `quickstart.md` execution results, in the format earlier features used, so the
 * implementation session commits generated text instead of a hand summary.
 */
import { headings, sectionRange } from "./markdown.ts"

const short = (sha: string): string => sha.slice(0, 7)

const claimLabel = (claim: ClaimReport, request: undefined | VerificationRequest): string => {
  const note = request?.claims.find((requested) => requested.id === claim.id)?.scopeNote
  if (claim.scope === "full") return claim.id
  return note === undefined ? `${claim.id} (partial)` : `${claim.id} (${note})`
}

const resultLabel = (claim: ClaimReport): string =>
  claim.limitationId === undefined ? claim.result : `${claim.result} (${claim.limitationId})`

const evidenceText = (claim: ClaimReport): string => {
  const parts = [
    claim.evidence.traceIds?.length ? `traces ${claim.evidence.traceIds.map((id) => `\`${id}\``).join(", ")}` : "",
    claim.evidence.queries?.length ? `queries ${claim.evidence.queries.map((query) => `\`${query}\``).join("; ")}` : "",
    claim.evidence.procedure ?? ""
  ].filter((part) => part.length > 0)
  return parts.join("; ")
}

const cell = (value: string): string => value.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ")

const observation = (claim: ClaimReport): string =>
  cell(`${claim.observed} Conditions: ${claim.conditions}. Evidence: ${evidenceText(claim)}.`)

/** A pipe table padded the way dprint formats it. */
const table = (header: readonly string[], rows: readonly (readonly string[])[]): string => {
  const widths = header.map((title, index) => Math.max(title.length, ...rows.map((row) => (row[index] ?? "").length)))
  const line = (cells: readonly string[]): string =>
    `| ${cells.map((value, index) => value.padEnd(widths[index] ?? 0)).join(" | ")} |`
  return [line(header), line(widths.map((width) => "-".repeat(width))), ...rows.map(line)].join("\n")
}

const listOrNone = (items: readonly string[]): string => items.length === 0 ? "none" : items.join("; ")

const telemetryLine = (report: VerificationReport): string => {
  const rows = report.telemetryRows.map((row) =>
    row.detail === undefined ? `${row.id} ${row.status}` : `${row.id} ${row.status} (${row.detail})`
  )
  return `**Telemetry rows:** ${listOrNone(rows)}.`
}

const supersedesLine = (report: VerificationReport, earlierSha: string | undefined): readonly string[] => {
  const lines: string[] = []
  if (earlierSha !== undefined && earlierSha !== report.verifiedSha) {
    lines.push(`This run supersedes the \`${short(earlierSha)}\` report above.`)
  }
  if (report.supersedesRunId !== undefined) {
    lines.push(`This run supersedes run \`${report.supersedesRunId}\` at the same revision.`)
  }
  return lines.length === 0 ? [] : [lines.join(" "), ""]
}

export interface RenderOptions {
  /** The SHA of the slice's most recent earlier results, which this report marks stale. */
  readonly earlierSha?: string | undefined
  readonly request?: undefined | VerificationRequest
}

export const renderReport = (report: VerificationReport, options: RenderOptions = {}): string => {
  const claims = [...report.claims, ...report.unrequestedViolations]
  const rows = claims.map((claim) => [claimLabel(claim, options.request), resultLabel(claim), observation(claim)])
  return [
    `### Slice ${report.sliceId} — \`${report.verifiedSha}\` (${report.timeRange.start.slice(0, 10)})`,
    "",
    `Generated from the verification note on \`${
      short(report.verifiedSha)
    }\` (\`refs/notes/verification\`). Do not edit by hand.`,
    "",
    ...supersedesLine(report, options.earlierSha),
    `**Run:** \`${report.runId}\`, ${report.timeRange.start} to ${report.timeRange.end}.`,
    "",
    `**Conditions:** ${report.environment}`,
    "",
    table(["Claim", "Result", "Observation"], rows),
    "",
    telemetryLine(report),
    "",
    `**Forbidden data observed:** ${
      listOrNone(report.forbiddenData.map((finding) => `${finding.signal} field \`${finding.field}\``))
    }.`,
    "",
    `**Escalation:** ${
      listOrNone(report.escalations.map((escalation) => `${escalation.kind}: ${escalation.detail}`))
    }.`,
    "",
    `**Cleanup:** ${report.cleanup.complete ? "complete" : `incomplete: ${report.cleanup.remaining ?? "not stated"}`}.`,
    ""
  ].join("\n")
}

const sliceHeading = (sliceId: string): RegExp => new RegExp(`^Slice ${sliceId}\\b.*\`([0-9a-f]{7,40})\``, "i")

/** The SHA in the slice's latest earlier execution-results heading, if any. */
export const earlierResultSha = (quickstart: string, sliceId: string): string | undefined =>
  headings(quickstart).flatMap((heading) => sliceHeading(sliceId).exec(heading.text)?.[1] ?? []).at(-1)

/** Appends the rendered results to the end of the execution-results section. */
export const insertResults = (quickstart: string, rendered: string): string | undefined => {
  const range = sectionRange(quickstart, /^execution results$/i)
  if (range === undefined) return undefined
  const lines = quickstart.split("\n")
  const before = lines.slice(0, range.end)
  while (before.at(-1) === "") before.pop()
  return [...before, "", rendered.trimEnd(), ...(range.end < lines.length ? ["", ...lines.slice(range.end)] : [""])]
    .join("\n")
}
