/**
 * Code review findings from the reviewer session, stored as git notes on the reviewed SHA, and the review half of
 * the ready gate. See docs/engineering/code-review.md.
 */
import type { Validated } from "./schema-checks.ts"

import { ancestorLimit, checkNotesRef, isCommit, nearestAnnotated } from "./git-access.ts"
import { latestEntry, recordEntry } from "./note-store.ts"
import { reviewNotes } from "./review-findings/notes.ts"
import { openBlocking, type Review } from "./review-findings/schema.ts"

export { defaultNotesRef } from "./review-findings/notes.ts"
export { type Review, validateReview } from "./review-findings/schema.ts"

const fail = (...problems: readonly string[]): { readonly ok: false; readonly problems: readonly string[] } => ({
  ok: false,
  problems
})

/** Validates a review and appends it to the note on its reviewed SHA in `ref`. */
export const recordReview = (cwd: string, ref: string, json: string): Validated<Review> => {
  const notes = checkNotesRef(ref)
  if (!notes.ok) return notes
  return recordEntry(
    { cwd, kind: reviewNotes, ref },
    json,
    (review) =>
      [review.reviewedSha, review.baseSha].filter((sha) => !isCommit(cwd, sha)).map((sha) =>
        `${sha} is not a commit in this repository`
      )
  )
}

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
