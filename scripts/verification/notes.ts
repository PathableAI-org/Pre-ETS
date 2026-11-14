/**
 * The note document on a verified commit. It keeps every report recorded on that SHA in order, so a retry
 * supersedes the earlier report without erasing it. The latest report is the last one.
 */
import { type Validated, validateReport, type VerificationReport } from "./report.ts"

export interface NoteDocument {
  readonly reports: readonly VerificationReport[]
  readonly schemaVersion: 1
}

export const parseNote = (content: string | undefined): Validated<NoteDocument> => {
  if (content === undefined || content.trim().length === 0) {
    return { ok: true, value: { reports: [], schemaVersion: 1 } }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { ok: false, problems: ["the verification note is not JSON"] }
  }
  const reports: unknown = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "reports") : undefined
  if (!Array.isArray(reports)) return { ok: false, problems: ["the verification note has no reports list"] }
  const checked = reports.map((entry) => validateReport(entry))
  const problems = checked.flatMap((entry, index) =>
    entry.ok ? [] : entry.problems.map((p) => `reports[${String(index)}] ${p}`)
  )
  const valid = checked.flatMap((entry) => entry.ok ? [entry.value] : [])
  return problems.length > 0 ? { ok: false, problems } : { ok: true, value: { reports: valid, schemaVersion: 1 } }
}

/**
 * Adds a report to the note on its verified SHA. A retry names the run it supersedes; when it does not, the
 * previous latest report on that SHA is the one superseded.
 */
export const appendReport = (note: NoteDocument, report: VerificationReport): Validated<NoteDocument> => {
  const previous = note.reports.at(-1)
  if (note.reports.some((entry) => entry.runId === report.runId)) {
    return { ok: false, problems: [`run ${report.runId} is already recorded on this SHA; each run needs a new UUID`] }
  }
  const supersedes = report.supersedesRunId ?? previous?.runId
  if (supersedes !== undefined && !note.reports.some((entry) => entry.runId === supersedes)) {
    return { ok: false, problems: [`supersedesRunId ${supersedes} is not a report on this SHA`] }
  }
  return {
    ok: true,
    value: { reports: [...note.reports, { ...report, supersedesRunId: supersedes }], schemaVersion: 1 }
  }
}

export const latestReport = (note: NoteDocument): undefined | VerificationReport => note.reports.at(-1)

export const serializeNote = (note: NoteDocument): string => `${JSON.stringify(note, null, 2)}\n`
