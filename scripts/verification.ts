/**
 * Verification handoff between implementation and verification sessions: requests generated from a feature's
 * artifacts at a pushed SHA, reports stored as git notes on the verified SHA, the gate, and generated quickstart
 * results. See docs/engineering/verification-harness.md.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { evidenceOnlyFindings, gateForBranch, implementationBranch } from "./verification/gate.ts"
import {
  ancestry,
  annotatedCommits,
  changedPaths,
  currentBranch,
  featureArtifactsAt,
  readAtSha,
  readNote,
  repositoryRoot,
  resolveSha,
  writeNote
} from "./verification/git.ts"
import { appendReport, latestReport, parseNote, serializeNote } from "./verification/notes.ts"
import { earlierResultSha, insertResults, renderReport } from "./verification/render.ts"
import { validateReport, type VerificationReport } from "./verification/report.ts"
import { buildRequest, type VerificationRequest } from "./verification/request.ts"

export { notesRef } from "./verification/git.ts"
export { validateReport, type VerificationReport } from "./verification/report.ts"
export { buildRequest, type VerificationRequest } from "./verification/request.ts"

export type Outcome<T> = { readonly ok: false; readonly problems: readonly string[] } | {
  readonly ok: true
  readonly value: T
}

const fail = (...problems: readonly string[]): { readonly ok: false; readonly problems: readonly string[] } => ({
  ok: false,
  problems
})

/** The feature directory of the checked-out implementation-slice branch. */
export const featureForBranch = (cwd: string): string | undefined =>
  implementationBranch(currentBranch(cwd))?.featureDir

/** The request for a slice, read from the feature's committed artifacts at `revision`. */
export const generateRequest = (
  cwd: string,
  target: { readonly featureDir: string; readonly revision: string; readonly sliceId: string }
): Outcome<VerificationRequest> => {
  const sha = resolveSha(cwd, target.revision)
  const artifacts = featureArtifactsAt(cwd, sha, target.featureDir)
  if (typeof artifacts === "string") return fail(artifacts)
  return { ok: true, value: buildRequest(artifacts, { featureDir: target.featureDir, sha, sliceId: target.sliceId }) }
}

/** Validates a report and appends it to the note on its verified SHA. */
export const recordReport = (cwd: string, json: string): Outcome<VerificationReport> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return fail("the report is not JSON")
  }
  const report = validateReport(parsed)
  if (!report.ok) return report
  const note = parseNote(readNote(cwd, report.value.verifiedSha))
  if (!note.ok) return note
  const next = appendReport(note.value, report.value)
  if (!next.ok) return next
  writeNote(cwd, report.value.verifiedSha, serializeNote(next.value))
  return { ok: true, value: next.value.reports.at(-1) ?? report.value }
}

/** The latest report on `revision`, if its note is valid. */
export const reportAt = (cwd: string, revision: string): Outcome<undefined | VerificationReport> => {
  const note = parseNote(readNote(cwd, resolveSha(cwd, revision)))
  return note.ok ? { ok: true, value: latestReport(note.value) } : note
}

export interface GatePass {
  readonly branch: string
  readonly head: string
  readonly report: VerificationReport
}

const ancestorLimit = 200

/** The nearest commit at or below HEAD that carries a verification note. */
const nearestReport = (cwd: string, head: string): Outcome<VerificationReport> => {
  const annotated = annotatedCommits(cwd)
  const verified = ancestry(cwd, head, ancestorLimit).find((sha) => annotated.has(sha))
  if (verified === undefined) {
    return fail(`no verification report on HEAD or its last ${String(ancestorLimit)} ancestors`)
  }
  const report = reportAt(cwd, verified)
  if (!report.ok) return report
  return report.value === undefined ? fail(`the note on ${verified} has no report`) : { ok: true, value: report.value }
}

const driftFindings = (cwd: string, report: VerificationReport, head: string): readonly string[] => {
  if (report.verifiedSha === head) return []
  const quickstart = `${report.featureDir}/quickstart.md`
  return evidenceOnlyFindings(report.featureDir, changedPaths(cwd, report.verifiedSha, head), {
    head: readAtSha(cwd, head, quickstart),
    verified: readAtSha(cwd, report.verifiedSha, quickstart)
  })
}

/** The gate for the checked-out implementation-slice branch. */
export const runGate = (cwd: string): Outcome<GatePass> => {
  const branchName = currentBranch(cwd)
  const branch = implementationBranch(branchName)
  if (branch === undefined || branchName === undefined) {
    return fail(`${branchName ?? "a detached HEAD"} is not an implementation-slice branch`)
  }
  const head = resolveSha(cwd, "HEAD")
  const report = nearestReport(cwd, head)
  if (!report.ok) return report
  const request = generateRequest(cwd, { ...report.value, revision: report.value.verifiedSha })
  if (!request.ok) return request
  const problems = [...driftFindings(cwd, report.value, head), ...gateForBranch(report.value, request.value, branch)]
  return problems.length > 0
    ? fail(...problems)
    : { ok: true, value: { branch: branchName, head, report: report.value } }
}

export interface RenderedResults {
  /** The working-tree `quickstart.md` the results belong in. */
  readonly path: string
  readonly rendered: string
  /** That file with the results appended, or undefined when it has no execution-results section. */
  readonly updated: string | undefined
}

/** The quickstart results for the latest report on `revision`, rendered against the working-tree quickstart. */
export const renderResults = (cwd: string, revision: string): Outcome<RenderedResults> => {
  const report = reportAt(cwd, revision)
  if (!report.ok) return report
  if (report.value === undefined) return fail(`no verification report on ${revision}`)
  const path = join(repositoryRoot(cwd), report.value.featureDir, "quickstart.md")
  const quickstart = existsSync(path) ? readFileSync(path, "utf8") : ""
  const request = generateRequest(cwd, { ...report.value, revision: report.value.verifiedSha })
  const rendered = renderReport(report.value, {
    earlierSha: earlierResultSha(quickstart, report.value.sliceId),
    request: request.ok ? request.value : undefined
  })
  return { ok: true, value: { path, rendered, updated: insertResults(quickstart, rendered) } }
}
