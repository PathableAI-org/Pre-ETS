/**
 * Verification handoff between implementation and verification sessions: requests generated from a feature's
 * artifacts at a pushed SHA, reports stored as git notes on the verified SHA, the gate, and generated quickstart
 * results. See docs/engineering/verification-harness.md.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import type { VerificationReport } from "./verification/report.ts"

import {
  ancestorLimit,
  changedPaths,
  currentBranch,
  nearestAnnotated,
  readAtSha,
  repositoryRoot,
  resolveSha
} from "./git-access.ts"
import { latestEntry, recordEntry } from "./note-store.ts"
import { nearestReview, defaultNotesRef as reviewNotesRef, reviewProblems } from "./review-findings.ts"
import {
  evidenceOnlyFindings,
  gateForBranch,
  type ImplementationBranch,
  implementationBranch,
  sliceMatchesBranch
} from "./verification/gate.ts"
import { featureArtifactsAt } from "./verification/git.ts"
import { notesRef, reportNotes } from "./verification/notes.ts"
import { earlierResultSha, insertResults, renderReport } from "./verification/render.ts"
import { buildRequest, type VerificationRequest } from "./verification/request.ts"

export { notesRef } from "./verification/notes.ts"
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

const reports = (cwd: string) => ({ cwd, kind: reportNotes, ref: notesRef })

/** Validates a report and appends it to the note on its verified SHA. */
export const recordReport = (cwd: string, json: string): Outcome<VerificationReport> => recordEntry(reports(cwd), json)

/** The latest report on `revision`, if its note is valid. */
export const reportAt = (cwd: string, revision: string): Outcome<undefined | VerificationReport> =>
  latestEntry(reports(cwd), revision)

export interface GatePass {
  readonly branch: string
  readonly head: string
  readonly report: VerificationReport
}

/** The nearest commit at or below HEAD that carries a verification note. */
const nearestReport = (cwd: string, head: string): Outcome<VerificationReport> => {
  const verified = nearestAnnotated(cwd, notesRef, head)
  if (verified === undefined) {
    return fail(`no verification report on HEAD or its last ${String(ancestorLimit)} ancestors`)
  }
  const report = reportAt(cwd, verified)
  if (!report.ok) return report
  return report.value === undefined ? fail(`the note on ${verified} has no report`) : { ok: true, value: report.value }
}

/** Findings for commits after `evidence.sha` other than the feature's quickstart execution results. */
const driftFindings = (
  cwd: string,
  evidence: { readonly featureDir: string; readonly label: "reviewed" | "verified"; readonly sha: string },
  head: string
): readonly string[] => {
  if (evidence.sha === head) return []
  const quickstart = `${evidence.featureDir}/quickstart.md`
  return evidenceOnlyFindings(evidence, changedPaths(cwd, evidence.sha, head), {
    head: readAtSha(cwd, head, quickstart),
    verified: readAtSha(cwd, evidence.sha, quickstart)
  })
}

/** The code review half of the gate: the nearest review passes, matches the branch, and covers HEAD. */
const reviewFindings = (cwd: string, branch: ImplementationBranch, head: string): readonly string[] => {
  const review = nearestReview(cwd, reviewNotesRef, head)
  if (!review.ok) return review.problems.map((problem) => `code review: ${problem}`)
  const { featureDir, reviewedSha, sliceId } = review.value
  return [
    ...reviewProblems(review.value),
    ...sliceMatchesBranch({ featureDir, label: "review", sliceId }, branch),
    ...driftFindings(cwd, { featureDir, label: "reviewed", sha: reviewedSha }, head)
  ].map((problem) => `code review: ${problem}`)
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
  const { featureDir, verifiedSha } = report.value
  const problems = [
    ...driftFindings(cwd, { featureDir, label: "verified", sha: verifiedSha }, head),
    ...gateForBranch(report.value, request.value, branch),
    ...reviewFindings(cwd, branch, head)
  ]
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
