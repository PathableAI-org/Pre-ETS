/**
 * The pull request comment that carries one note entry between clones. Its first line is a hidden marker naming the
 * note kind, the annotated SHA, and the entry ID; a short summary follows for people; the entry itself is the only
 * fenced `json` block. Only the marker and the block are read back.
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
const entryBlock = /^(`{3,})json\n([\s\S]*?)\n\1$/m

const isChannelName = (value: string): value is ChannelName => channelNames.some((name) => name === value)

/** A fence longer than any backtick run in the entry, so the entry cannot close it early. */
const fenceFor = (json: string): string =>
  "`".repeat(Math.max(3, ...[...json.matchAll(/`+/g)].map((run) => run[0].length + 1)))

export const formatComment = (marker: Marker, summary: string, entry: unknown): string => {
  const json = JSON.stringify(entry, null, 2)
  const fence = fenceFor(json)
  return [
    `<!-- pre-ets-note kind=${marker.kind} sha=${marker.sha} id=${marker.id} -->`,
    summary,
    "",
    `Recorded in this pull request so other sessions can import it with \`pnpm notes:sync\`. Do not edit this comment.`,
    "",
    `${fence}json`,
    json,
    fence,
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
  const block = entryBlock.exec(text)
  if (block === null) return { ok: false, problems: ["no fenced json block holds the entry"] }
  try {
    return { ok: true, value: { entry: JSON.parse(block[2] ?? ""), id, kind, sha } }
  } catch {
    return { ok: false, problems: ["the fenced entry is not JSON"] }
  }
}
