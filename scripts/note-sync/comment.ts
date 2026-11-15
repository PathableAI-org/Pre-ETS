/**
 * The pull request comment that carries one note entry between clones. Its first line is a hidden marker naming the
 * note kind, the annotated SHA, and the entry ID; a markdown rendering of the entry follows for people; the entry
 * itself is the last fenced `json` block, inside a collapsed `<details>` block. Only the marker and that block are read
 * back. Comments posted before the rendering existed hold a one-line summary and the entry as their only fenced block,
 * and parse the same way.
 */
import type { Validated } from "../schema-checks.ts"

export const channelNames = ["review", "verification"] as const
export type ChannelName = (typeof channelNames)[number]

export interface Marker {
  readonly id: string
  readonly kind: ChannelName
  readonly sha: string
}

export interface ParsedComment extends Marker {
  readonly entry: unknown
}

const markerLine = /^<!-- pre-ets-note kind=(\S+) sha=(\S+) id=(\S+) -->$/
const entryBlocks = /^(`{3,})json\n([\s\S]*?)\n\1$/gm

const isChannelName = (value: string): value is ChannelName => channelNames.some((name) => name === value)

/** A fence longer than any backtick run in the entry, so the entry cannot close it early. */
const fenceFor = (json: string): string =>
  "`".repeat(Math.max(3, ...[...json.matchAll(/`+/g)].map((run) => run[0].length + 1)))

/** The comment for an entry: the marker, the entry's rendering for people, then the entry in a collapsed block. */
export const formatComment = (marker: Marker, rendered: string, entry: unknown): string => {
  const json = JSON.stringify(entry, null, 2)
  const fence = fenceFor(json)
  return [
    `<!-- pre-ets-note kind=${marker.kind} sha=${marker.sha} id=${marker.id} -->`,
    rendered,
    "",
    "<details><summary>Machine-readable note (do not edit)</summary>",
    "",
    "Generated from the git note so other sessions can import it with `pnpm notes:sync`. The text above is rendered "
    + "from this entry.",
    "",
    `${fence}json`,
    json,
    fence,
    "",
    "</details>",
    ""
  ].join("\n")
}

/**
 * The marker and entry of a note comment, or undefined when the comment does not start with a marker. A marked
 * comment whose marker or entry cannot be read is a problem, so a damaged note comment is reported, not skipped.
 */
export const parseComment = (body: string): undefined | Validated<ParsedComment> => {
  const text = body.replaceAll("\r\n", "\n")
  const marker = markerLine.exec(text.split("\n", 1)[0] ?? "")
  if (marker === null) return undefined
  const [, kind = "", sha = "", id = ""] = marker
  if (!isChannelName(kind)) return { ok: false, problems: [`unknown note kind ${kind}`] }
  const block = [...text.matchAll(entryBlocks)].at(-1)
  if (block === undefined) return { ok: false, problems: ["no fenced json block holds the entry"] }
  try {
    return { ok: true, value: { entry: JSON.parse(block[2] ?? ""), id, kind, sha } }
  } catch {
    return { ok: false, problems: ["the fenced entry is not JSON"] }
  }
}
