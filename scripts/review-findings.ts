/**
 * Code review findings from the reviewer session, stored as git notes on the reviewed SHA, and the review half of
 * the ready gate. See docs/engineering/code-review.md.
 */
import type { Validated } from "./schema-checks.ts"

import { ancestorLimit, checkNotesRef, codeTree, isCommit, nearestAnnotated } from "./git-access.ts"
import { importEntry, latestEntry, latestMatching, type NoteTarget, recordEntry } from "./note-store.ts"
import { reviewNotes } from "./review-findings/notes.ts"
import { openBlocking, type Review } from "./review-findings/schema.ts"

export { defaultNotesRef } from "./review-findings/notes.ts"
export { type Review, validateReview } from "./review-findings/schema.ts"

const fail = (...problems: readonly string[]): { readonly ok: false; readonly problems: readonly string[] } => ({
  ok: false,
  problems
})

const commitsExist = (cwd: string) => (review: Review): readonly string[] =>
  [review.reviewedSha, review.baseSha].filter((sha) => !isCommit(cwd, sha)).map((sha) =>
    `${sha} is not a commit in this repository`
  )

/** The inputs `review:record` records: the code trees of the base and reviewed SHAs. */
const inputsOf = (cwd: string, review: Review): NonNullable<Review["inputs"]> => ({
  baseCodeTree: codeTree(cwd, review.baseSha),
  codeTree: codeTree(cwd, review.reviewedSha)
})

/** A review's recorded inputs, when it has them, must be those of its base and reviewed SHAs. */
const inputsMatch = (cwd: string) => (review: Review): readonly string[] => {
  const missing = commitsExist(cwd)(review)
  if (missing.length > 0 || review.inputs === undefined) return missing
  const actual = inputsOf(cwd, review)
  return actual.codeTree === review.inputs.codeTree && actual.baseCodeTree === review.inputs.baseCodeTree
    ? []
    : [`its recorded inputs are not those of ${review.baseSha}..${review.reviewedSha}`]
}

/** Appends a review to its reviewed SHA's note in `ref`, through `append`, once the ref is known to be a notes ref. */
const appendReview = <R>(
  cwd: string,
  ref: string,
  append: (target: NoteTarget<Review>, check: (review: Review) => readonly string[]) => Validated<R>
): Validated<R> => {
  const notes = checkNotesRef(ref)
  return notes.ok ? append({ cwd, kind: reviewNotes, ref }, commitsExist(cwd)) : notes
}

/** Validates a review, records its inputs, and appends it to the note on its reviewed SHA in `ref`. */
export const recordReview = (cwd: string, ref: string, json: string): Validated<Review> =>
  appendReview(
    cwd,
    ref,
    (target, check) =>
      recordEntry(
        target,
        json,
        check,
        (review) => commitsExist(cwd)(review).length === 0 ? { ...review, inputs: inputsOf(cwd, review) } : review
      )
  )

/**
 * Validates a review recorded in another clone and appends it in `ref` unless its ID is already there. Recorded
 * inputs must match its commits.
 */
export const importReview = (
  cwd: string,
  ref: string,
  json: string
): Validated<{ readonly entry: Review; readonly written: boolean }> =>
  appendReview(cwd, ref, (target) => importEntry(target, json, inputsMatch(cwd)))

/** The latest review on `revision` in `ref`. */
export const latestReview = (cwd: string, ref: string, revision: string): Validated<Review> => {
  const notes = checkNotesRef(ref)
  if (!notes.ok) return notes
  const latest = latestEntry({ cwd, kind: reviewNotes, ref }, revision)
  if (!latest.ok) return latest
  return latest.value === undefined ? fail(`no review on ${revision} in ${ref}`) : { ok: true, value: latest.value }
}

/** The nearest commit at or below `head` with a review note in `ref`, and its latest review. */
export const nearestReview = (cwd: string, ref: string, head: string): Validated<Review> => {
  const reviewed = nearestAnnotated(cwd, ref, head)
  return reviewed === undefined
    ? fail(`no review on HEAD or its last ${String(ancestorLimit)} ancestors`)
    : latestReview(cwd, ref, reviewed)
}

/** The latest review in `ref` that `matches` accepts, from the commit whose note was written most recently. */
export const latestReviewMatching = (
  cwd: string,
  ref: string,
  matches: (review: Review) => boolean
): Validated<Review | undefined> => {
  const notes = checkNotesRef(ref)
  return notes.ok ? latestMatching({ cwd, kind: reviewNotes, ref }, matches) : notes
}

/** Why a review does not let the slice be marked ready: open blocking findings and escalations. Empty passes. */
export const reviewProblems = (review: Review): readonly string[] => [
  ...openBlocking(review).map((entry) => `${entry.id} is blocking at ${entry.file}:${String(entry.line)}`),
  ...review.escalations.map((entry) => `open escalation (${entry.kind}): ${entry.detail}`)
]

/** A review's counts and one line per open blocking finding, for the implementation session. */
export const blockingSummary = (review: Review): string => {
  const blocking = openBlocking(review)
  const head =
    `Review ${review.reviewId} (round ${String(review.round)}) of slice ${review.sliceId} at ${review.reviewedSha}: `
    + `${String(blocking.length)} blocking, ${String(review.findings.length - blocking.length)} advisory, `
    + `${String(review.escalations.length)} escalations.\n`
  return head + blocking.map((entry) => `  ${entry.id} ${entry.file}:${String(entry.line)} ${entry.summary}\n`).join("")
}
