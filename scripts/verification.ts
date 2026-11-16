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
  isCommit,
  nearestAnnotated,
  readAtSha,
  repositoryRoot,
  resolveSha
} from "./git-access.ts"
import { importEntry, latestEntry, latestMatching, recordEntry } from "./note-store.ts"
import {
  latestReviewMatching,
  nearestReview,
  type Review,
  defaultNotesRef as reviewNotesRef,
  reviewProblems
} from "./review-findings.ts"
import { isFixSlice } from "./schema-checks.ts"
import {
  evidenceOnlyFindings,
  fixReportFindings,
  gateForBranch,
  type ImplementationBranch,
  implementationBranch,
  sliceMatchesBranch
} from "./verification/gate.ts"
import { featureArtifactsAt } from "./verification/git.ts"
import { reportInputs } from "./verification/inputs.ts"
import { notesRef, reportNotes } from "./verification/notes.ts"
import { earlierResultSha, insertResults, renderReport } from "./verification/render.ts"
import { buildRequest, firstSliceId, type VerificationRequest } from "./verification/request.ts"

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

/** Whether `branch` is an implementation-slice branch, `{number}-{slug}-impl` or `{number}-{slug}-impl-<slice>`. */
export const isImplementationBranch = (branch: string): boolean => implementationBranch(branch) !== undefined

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

const verifiedShaExists = (cwd: string) => (report: VerificationReport): readonly string[] =>
  isCommit(cwd, report.verifiedSha) ? [] : [`${report.verifiedSha} is not a commit in this repository`]

/** A report's recorded inputs, when it has them, must be the inputs of its verified SHA. */
const inputsMatch = (cwd: string) => (report: VerificationReport): readonly string[] => {
  const missing = verifiedShaExists(cwd)(report)
  if (missing.length > 0 || report.inputs === undefined) return missing
  const actual = reportInputs(cwd, report.verifiedSha, report.featureDir)
  return actual.codeTree === report.inputs.codeTree && actual.featureInputs === report.inputs.featureInputs
    ? []
    : [`its recorded inputs are not those of ${report.verifiedSha}`]
}

/** Validates a report, records its inputs from the verified SHA, and appends it to the note on that SHA. */
export const recordReport = (cwd: string, json: string): Outcome<VerificationReport> =>
  recordEntry(reports(cwd), json, verifiedShaExists(cwd), (report) =>
    isCommit(cwd, report.verifiedSha)
      ? { ...report, inputs: reportInputs(cwd, report.verifiedSha, report.featureDir) }
      : report)

/**
 * Validates a report recorded in another clone and appends it unless its run ID is already on that SHA. Recorded
 * inputs must match the verified SHA.
 */
export const importReport = (
  cwd: string,
  json: string
): Outcome<{ readonly entry: VerificationReport; readonly written: boolean }> =>
  importEntry(reports(cwd), json, inputsMatch(cwd))

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

/** The slice an implementation branch carries: its suffix, or for the first slice's `-impl` branch, plan.md's first. */
const branchSlice = (cwd: string, branch: ImplementationBranch, head: string): string | undefined =>
  branch.sliceSuffix ?? firstSliceId(readAtSha(cwd, head, `${branch.featureDir}/plan.md`) ?? "")

/** Whether a report or review is for this feature and slice. */
const forSlice =
  (featureDir: string, sliceId: string) =>
  (entry: { readonly featureDir?: string | undefined; readonly sliceId: string }): boolean =>
    entry.featureDir === featureDir && entry.sliceId.toLowerCase() === sliceId.toLowerCase()

/**
 * The slice's latest report, whatever commit it is on: a restack leaves the verified commit off the branch, and
 * the drift check then decides whether it still covers HEAD. Without a slice ID, the nearest annotated ancestor.
 */
const sliceReport = (cwd: string, featureDir: string, sliceId: string | undefined, head: string) => {
  if (sliceId === undefined) return nearestReport(cwd, head)
  const latest = latestMatching(reports(cwd), forSlice(featureDir, sliceId))
  if (!latest.ok) return latest
  return latest.value === undefined
    ? fail(`no verification report for slice ${sliceId} of ${featureDir}`)
    : { ok: true as const, value: latest.value }
}

/** The slice's latest review, found like `sliceReport`. */
const sliceReview = (cwd: string, featureDir: string, sliceId: string | undefined, head: string) => {
  if (sliceId === undefined) return nearestReview(cwd, reviewNotesRef, head)
  const latest = latestReviewMatching(cwd, reviewNotesRef, forSlice(featureDir, sliceId))
  if (!latest.ok) return latest
  return latest.value === undefined
    ? fail(`no review for slice ${sliceId} of ${featureDir}`)
    : { ok: true as const, value: latest.value }
}

/** Findings for commits after `evidence.sha` other than the feature's quickstart execution results. */
const driftFindings = (
  cwd: string,
  evidence: { readonly featureDir: string | undefined; readonly label: "reviewed" | "verified"; readonly sha: string },
  head: string
): readonly string[] => {
  if (evidence.sha === head) return []
  const quickstart = `${evidence.featureDir ?? ""}/quickstart.md`
  return evidenceOnlyFindings(evidence, changedPaths(cwd, evidence.sha, head), {
    head: readAtSha(cwd, head, quickstart),
    verified: readAtSha(cwd, evidence.sha, quickstart)
  })
}

/** The code review half of the gate: the review found passes, matches the branch, and covers HEAD. */
const reviewFindings = (
  cwd: string,
  head: string,
  review: Outcome<Review>,
  checks: {
    readonly featureDir: (review: Review) => string | undefined
    readonly matches: (review: Review) => readonly string[]
  }
): readonly string[] => {
  if (!review.ok) return review.problems.map((problem) => `code review: ${problem}`)
  return [
    ...reviewProblems(review.value),
    ...checks.matches(review.value),
    ...driftFindings(
      cwd,
      { featureDir: checks.featureDir(review.value), label: "reviewed", sha: review.value.reviewedSha },
      head
    )
  ].map((problem) => `code review: ${problem}`)
}

/** The branch and commit the gate judges, and the labels of its pull request when one was found. */
export interface GateTarget {
  readonly branch: string | undefined
  readonly head: string
  readonly labels?: readonly string[] | undefined
}

/** The checked-out branch at HEAD. */
export const checkedOut = (cwd: string, labels?: readonly string[]): GateTarget => ({
  branch: currentBranch(cwd),
  head: resolveSha(cwd, "HEAD"),
  labels
})

const highFixLabel = "risk:high"

/** Whether marking this branch's pull request ready needs the gate: an implementation slice or a High fix. */
export const gateApplies = (branch: string, labels: readonly string[]): boolean =>
  isImplementationBranch(branch) || labels.includes(highFixLabel)

const slicePass = (cwd: string, branch: ImplementationBranch, target: GateTarget): Outcome<VerificationReport> => {
  const sliceId = branchSlice(cwd, branch, target.head)
  const report = sliceReport(cwd, branch.featureDir, sliceId, target.head)
  if (!report.ok) return report
  const { featureDir, verifiedSha } = report.value
  // A report without a feature directory fails gateForBranch's branch check; the branch's own one builds the request.
  const request = generateRequest(cwd, {
    featureDir: featureDir ?? branch.featureDir,
    revision: verifiedSha,
    sliceId: report.value.sliceId
  })
  if (!request.ok) return request
  const problems = [
    ...driftFindings(cwd, { featureDir, label: "verified", sha: verifiedSha }, target.head),
    ...gateForBranch(report.value, request.value, branch),
    ...reviewFindings(cwd, target.head, sliceReview(cwd, branch.featureDir, sliceId, target.head), {
      featureDir: (review) => review.featureDir,
      matches: (review) =>
        sliceMatchesBranch({ featureDir: review.featureDir, label: "review", sliceId: review.sliceId }, branch)
    })
  ]
  return problems.length > 0 ? fail(...problems) : report
}

/**
 * The gate for a High fix's single pull request. There is no plan, so no request: the report must pass on its own
 * terms, and only a commit that changes no path counts as evidence-only after the verified or reviewed SHA.
 */
const fixPass = (cwd: string, target: GateTarget): Outcome<VerificationReport> => {
  const report = nearestReport(cwd, target.head)
  if (!report.ok) return report
  const problems = [
    ...driftFindings(cwd, { featureDir: undefined, label: "verified", sha: report.value.verifiedSha }, target.head),
    ...fixReportFindings(report.value),
    ...reviewFindings(cwd, target.head, nearestReview(cwd, reviewNotesRef, target.head), {
      featureDir: () => undefined,
      matches: (review) =>
        isFixSlice(review.sliceId) ? [] : [`the review is for slice ${review.sliceId}, not a High fix (slice fix)`]
    })
  ]
  return problems.length > 0 ? fail(...problems) : report
}

const nameOf = (target: GateTarget): string => target.branch ?? "a detached HEAD"

const passFor = (cwd: string, target: GateTarget): Outcome<VerificationReport> => {
  const branch = implementationBranch(target.branch)
  if (branch !== undefined) return slicePass(cwd, branch, target)
  if (target.labels === undefined) {
    return fail(
      `${nameOf(target)} is not an implementation-slice branch, and no pull request was found to show a High fix`
    )
  }
  return target.labels.includes(highFixLabel)
    ? fixPass(cwd, target)
    : fail(`${nameOf(target)} is not an implementation-slice branch or a High fix labelled ${highFixLabel}`)
}

/**
 * The gate for `target`, by default the checked-out branch: the slice gate on an implementation-slice branch, the
 * fix gate on a branch whose pull request is labelled risk:high. Labels come from the pull request; without them only
 * an implementation-slice branch can be judged.
 */
export const runGate = (cwd: string, target: GateTarget = checkedOut(cwd)): Outcome<GatePass> => {
  const pass = passFor(cwd, target)
  return pass.ok ? { ok: true, value: { branch: nameOf(target), head: target.head, report: pass.value } } : pass
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
  const { featureDir, sliceId, verifiedSha } = report.value
  if (featureDir === undefined) {
    return fail(
      `the report on ${revision} is for a High fix with no feature directory, so it has no quickstart results`
    )
  }
  const path = join(repositoryRoot(cwd), featureDir, "quickstart.md")
  const quickstart = existsSync(path) ? readFileSync(path, "utf8") : ""
  const request = generateRequest(cwd, { featureDir, revision: verifiedSha, sliceId })
  const rendered = renderReport(report.value, {
    earlierSha: earlierResultSha(quickstart, report.value.sliceId),
    request: request.ok ? request.value : undefined
  })
  return { ok: true, value: { path, rendered, updated: insertResults(quickstart, rendered) } }
}
