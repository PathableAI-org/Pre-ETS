/**
 * Code review findings from the reviewer session, stored as git notes on the reviewed SHA. See
 * docs/engineering/code-review.md.
 *
 * Planned consolidation: the verification handoff tooling keeps the same schema-check style and notes handling for
 * refs/notes/verification. When it lands on main, share one schema-check and notes module between the two instead
 * of keeping both copies.
 */
import {
  appendReview,
  checkNotesRef,
  parseNote,
  readNote,
  resolveSha,
  serializeNote,
  writeNote
} from "./review-findings/notes.ts"
import { openBlocking, type Review, type Validated, validateReview } from "./review-findings/schema.ts"

export { defaultNotesRef } from "./review-findings/notes.ts"
export { passes, type Review, validateReview } from "./review-findings/schema.ts"

const fail = (...problems: readonly string[]): { readonly ok: false; readonly problems: readonly string[] } => ({
  ok: false,
  problems
})

const commitExists = (cwd: string, sha: string): boolean => {
  try {
    return resolveSha(cwd, sha) === sha
  } catch {
    return false
  }
}

/** Validates a review and appends it to the note on its reviewed SHA in `ref`. */
export const recordReview = (cwd: string, ref: string, json: string): Validated<Review> => {
  const notes = checkNotesRef(ref)
  if (!notes.ok) return notes
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return fail("the review is not JSON")
  }
  const review = validateReview(parsed)
  if (!review.ok) return review
  const missing = [review.value.reviewedSha, review.value.baseSha].filter((sha) => !commitExists(cwd, sha))
  if (missing.length > 0) return fail(...missing.map((sha) => `${sha} is not a commit in this repository`))
  const note = parseNote(readNote(cwd, ref, review.value.reviewedSha))
  if (!note.ok) return note
  const next = appendReview(note.value, review.value)
  if (!next.ok) return next
  writeNote(cwd, ref, review.value.reviewedSha, serializeNote(next.value))
  return { ok: true, value: next.value.reviews.at(-1) ?? review.value }
}

/** The latest review on `revision` in `ref`. */
export const latestReview = (cwd: string, ref: string, revision: string): Validated<Review> => {
  const notes = checkNotesRef(ref)
  if (!notes.ok) return notes
  const note = parseNote(readNote(cwd, ref, resolveSha(cwd, revision)))
  if (!note.ok) return note
  const latest = note.value.reviews.at(-1)
  return latest === undefined ? fail(`no review on ${revision} in ${ref}`) : { ok: true, value: latest }
}

/** A review's counts and one line per open blocking finding, for the implementation session. */
export const blockingSummary = (review: Review): string => {
  const blocking = openBlocking(review)
  const head =
    `Review ${review.reviewId} (round ${String(review.round)}) of slice ${review.sliceId} at ${review.reviewedSha}: `
    + `${String(blocking.length)} blocking, ${String(review.findings.length - blocking.length)} advisory, `
    + `${String(review.escalations.length)} escalations.\n`
  return head + blocking.map((entry) => `  ${entry.id} ${entry.file}:${String(entry.line)} ${entry.summary}\n`).join("")
}
