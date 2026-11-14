/** Code reviews as git notes on the reviewed SHA, in refs/notes/review unless a trial names another ref. */
import type { NoteKind } from "../note-store.ts"

import { type Review, validateReview } from "./schema.ts"

export const defaultNotesRef = "refs/notes/review"

export const reviewNotes: NoteKind<Review> = {
  entry: "review",
  id: (review) => review.reviewId,
  idLabel: "review",
  listKey: "reviews",
  note: "review",
  sha: (review) => review.reviewedSha,
  supersedes: { field: "supersedesReviewId", of: (review) => review.supersedesReviewId },
  validate: validateReview,
  withSupersedes: (review, supersedesReviewId) => ({ ...review, supersedesReviewId })
}
