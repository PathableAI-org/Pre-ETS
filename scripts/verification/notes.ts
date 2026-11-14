/** Verification reports as git notes on the verified SHA, in refs/notes/verification. */
import type { NoteKind } from "../note-store.ts"

import { validateReport, type VerificationReport } from "./report.ts"

export const notesRef = "refs/notes/verification"

export const reportNotes: NoteKind<VerificationReport> = {
  entry: "report",
  id: (report) => report.runId,
  idLabel: "run",
  listKey: "reports",
  note: "verification",
  sha: (report) => report.verifiedSha,
  supersedes: { field: "supersedesRunId", of: (report) => report.supersedesRunId },
  validate: validateReport,
  withSupersedes: (report, supersedesRunId) => ({ ...report, supersedesRunId })
}
