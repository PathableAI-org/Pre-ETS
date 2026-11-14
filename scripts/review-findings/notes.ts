/**
 * Review notes in git. The note on a reviewed commit keeps every review recorded on that SHA in order, so a repeat
 * review supersedes the earlier one without erasing it. The latest review is the last one. Notes stay local: no
 * command here fetches or pushes a notes ref.
 */
import { execFileSync } from "node:child_process"

import { type Review, type Validated, validateReview } from "./schema.ts"

export const defaultNotesRef = "refs/notes/review"

export interface NoteDocument {
  readonly reviews: readonly Review[]
  readonly schemaVersion: 1
}

const git = (cwd: string, args: readonly string[], input?: string): string =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    input,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"]
  })

/** A notes ref under refs/notes/, so a mistyped option cannot write a branch or tag. */
export const checkNotesRef = (ref: string): Validated<string> =>
  /^refs\/notes\/[\w./-]+$/.test(ref) && !ref.includes("..")
    ? { ok: true, value: ref }
    : { ok: false, problems: [`${ref} is not a ref under refs/notes/`] }

export const resolveSha = (cwd: string, revision: string): string =>
  git(cwd, ["rev-parse", "--verify", `${revision}^{commit}`]).trim()

export const readNote = (cwd: string, ref: string, sha: string): string | undefined => {
  try {
    return git(cwd, ["notes", `--ref=${ref}`, "show", sha])
  } catch {
    return undefined
  }
}

/** Replaces the note on `sha`. Git keeps the previous note in the notes ref's own history. */
export const writeNote = (cwd: string, ref: string, sha: string, content: string): void => {
  git(cwd, ["notes", `--ref=${ref}`, "add", "--force", "--file=-", sha], content)
}

export const parseNote = (content: string | undefined): Validated<NoteDocument> => {
  if (content === undefined || content.trim().length === 0) {
    return { ok: true, value: { reviews: [], schemaVersion: 1 } }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { ok: false, problems: ["the review note is not JSON"] }
  }
  const reviews: unknown = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "reviews") : undefined
  if (!Array.isArray(reviews)) return { ok: false, problems: ["the review note has no reviews list"] }
  const checked = reviews.map((entry) => validateReview(entry))
  const problems = checked.flatMap((entry, index) =>
    entry.ok ? [] : entry.problems.map((p) => `reviews[${String(index)}] ${p}`)
  )
  const valid = checked.flatMap((entry) => entry.ok ? [entry.value] : [])
  return problems.length > 0 ? { ok: false, problems } : { ok: true, value: { reviews: valid, schemaVersion: 1 } }
}

/**
 * Adds a review to the note on its reviewed SHA. A repeat review names the review it supersedes; when it does not,
 * the previous latest review on that SHA is the one superseded.
 */
export const appendReview = (note: NoteDocument, review: Review): Validated<NoteDocument> => {
  if (note.reviews.some((entry) => entry.reviewId === review.reviewId)) {
    return { ok: false, problems: [`review ${review.reviewId} is already recorded on this SHA; use a new UUID`] }
  }
  const supersedes = review.supersedesReviewId ?? note.reviews.at(-1)?.reviewId
  if (supersedes !== undefined && !note.reviews.some((entry) => entry.reviewId === supersedes)) {
    return { ok: false, problems: [`supersedesReviewId ${supersedes} is not a review on this SHA`] }
  }
  return {
    ok: true,
    value: { reviews: [...note.reviews, { ...review, supersedesReviewId: supersedes }], schemaVersion: 1 }
  }
}

export const serializeNote = (note: NoteDocument): string => `${JSON.stringify(note, null, 2)}\n`
