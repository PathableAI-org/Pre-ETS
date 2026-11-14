/**
 * Code review handoff commands. Run through the `review:*` package scripts:
 *
 *   pnpm review:record <review.json | -> [--notes-ref <ref>]   validate a review and add it to the reviewed SHA's note
 *   pnpm review:show [<rev>] [--notes-ref <ref>]               print the latest review on a commit and its blocking
 *                                                              findings; exits 1 while a blocking finding or an
 *                                                              escalation is open
 *
 * `--notes-ref` defaults to refs/notes/review. Notes are local and never pushed. See docs/engineering/code-review.md.
 */
import { readFileSync } from "node:fs"
import { parseArgs } from "node:util"

import { blockingSummary, defaultNotesRef, latestReview, passes, recordReview } from "./review-findings.ts"

const cwd = process.cwd()

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { "notes-ref": { default: defaultNotesRef, type: "string" } }
})

const [command, argument] = positionals
const ref = values["notes-ref"]

const failed = (heading: string, problems: readonly string[]): number => {
  process.stderr.write(`${heading}\n${problems.map((problem) => `  - ${problem}`).join("\n")}\n`)
  return 1
}

const record = (): number => {
  const json = readFileSync(argument === undefined || argument === "-" ? 0 : argument, "utf8")
  const outcome = recordReview(cwd, ref, json)
  if (!outcome.ok) return failed("Review not recorded:", outcome.problems)
  const review = outcome.value
  process.stdout.write(
    `Recorded review ${review.reviewId} for slice ${review.sliceId} on ${review.reviewedSha} in ${ref}.\n`
      + `Pointer for the implementation session: ${ref} @ ${review.reviewedSha} (review ${review.reviewId}).\n`
      + blockingSummary(review)
  )
  return 0
}

const show = (): number => {
  const outcome = latestReview(cwd, ref, argument ?? "HEAD")
  if (!outcome.ok) return failed("No review:", outcome.problems)
  process.stdout.write(`${JSON.stringify(outcome.value, null, 2)}\n`)
  process.stderr.write(blockingSummary(outcome.value))
  return passes(outcome.value) ? 0 : 1
}

const commands: Readonly<Record<string, () => number>> = { record, show }

const run = commands[command ?? ""]
if (run === undefined) {
  process.stderr.write("Usage: review.ts record|show (see the header of scripts/review.ts)\n")
  process.exitCode = 2
} else process.exitCode = run()
