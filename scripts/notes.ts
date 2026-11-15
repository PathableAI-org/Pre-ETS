/**
 * Note transport commands. Run through the `notes:*` package scripts:
 *
 *   pnpm notes:sync [<pr>] [--review-ref <ref>]          import the pull request's note comments into the local
 *                                                        notes; the checked-out branch's pull request by default.
 *                                                        Exits 1 when a marked comment is rejected
 *   pnpm notes:publish verification|review [<rev>]       post the latest local entry on a commit as a comment, for a
 *     [--pr <n>] [--review-ref <ref>]                    record whose posting failed
 *
 * `--review-ref` defaults to refs/notes/review; verification reports always use refs/notes/verification. See
 * docs/engineering/code-review.md#storage.
 */
import { parseArgs } from "node:util"

import { failed, runCommand } from "./cli.ts"
import { ghRest } from "./github-access.ts"
import {
  type ChannelName,
  channelNames,
  describePublish,
  describeSync,
  publishLatest,
  pullRequestToSync,
  syncPullNotes
} from "./note-sync.ts"
import { defaultNotesRef } from "./review-findings.ts"

const cwd = process.cwd()
const rest = ghRest(cwd)

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { pr: { type: "string" }, "review-ref": { default: defaultNotesRef, type: "string" } }
})

const [command, first, second] = positionals
const refs = { review: values["review-ref"] }

const sync = (): number => {
  const pr = pullRequestToSync({ cwd, rest }, first)
  if (!pr.ok) return failed("Not synced:", pr.problems)
  const result = syncPullNotes({ cwd, refs, rest }, pr.value)
  if (!result.ok) return failed("Not synced:", result.problems)
  process.stderr.write(describeSync(pr.value, result.value))
  return result.value.rejected.length === 0 ? 0 : 1
}

const isChannel = (value: string | undefined): value is ChannelName => channelNames.some((name) => name === value)

const publish = (): number => {
  if (!isChannel(first)) return failed("Not published:", [`name the note kind: ${channelNames.join(" or ")}`])
  const revision = second ?? "HEAD"
  const published = publishLatest({ cwd, pr: values.pr, refs, rest }, first, revision)
  if (!published.ok) return failed("Not published:", published.problems)
  process.stdout.write(describePublish(first, revision, published).message)
  return 0
}

const commands: Readonly<Record<string, () => number>> = { publish, sync }

runCommand(commands, command, "Usage: notes.ts sync|publish (see the header of scripts/notes.ts)")
