import type { Validated } from "./schema-checks.ts"

/**
 * JSON documents in git notes, one per annotated commit. A document keeps every entry recorded on that SHA in order,
 * so a retry supersedes the earlier entry without erasing it; the latest entry is the last one. Verification reports
 * and code reviews are the two kinds.
 */
import { readNote, resolveSha, writeNote } from "./git-access.ts"

export interface NoteKind<T> {
  /** What one entry is called in messages: "report" or "review". */
  readonly entry: string
  readonly id: (entry: T) => string
  /** What an entry's ID names in messages: "run" or "review". */
  readonly idLabel: string
  /** The document field holding the entries: "reports" or "reviews". */
  readonly listKey: string
  /** What the note is called in messages: "verification" or "review". */
  readonly note: string
  /** The commit the entry belongs on. */
  readonly sha: (entry: T) => string
  /** The entry's field naming the entry it supersedes, and its value. */
  readonly supersedes: { readonly field: string; readonly of: (entry: T) => string | undefined }
  readonly validate: (value: unknown) => Validated<T>
  readonly withSupersedes: (entry: T, supersedes: string | undefined) => T
}

const fail = (...problems: readonly string[]): { readonly ok: false; readonly problems: readonly string[] } => ({
  ok: false,
  problems
})

const parseEntries = <T>(kind: NoteKind<T>, content: string | undefined): Validated<readonly T[]> => {
  if (content === undefined || content.trim().length === 0) return { ok: true, value: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return fail(`the ${kind.note} note is not JSON`)
  }
  const entries: unknown = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, kind.listKey) : undefined
  if (!Array.isArray(entries)) return fail(`the ${kind.note} note has no ${kind.listKey} list`)
  const checked = entries.map((entry) => kind.validate(entry))
  const problems = checked.flatMap((entry, index) =>
    entry.ok ? [] : entry.problems.map((problem) => `${kind.listKey}[${String(index)}] ${problem}`)
  )
  return problems.length > 0 ? fail(...problems) : { ok: true, value: checked.flatMap((e) => e.ok ? [e.value] : []) }
}

/**
 * Adds an entry after the existing ones. An entry may name the entry it supersedes; when it does not, the previous
 * latest entry on that SHA is the one superseded.
 */
const appendEntry = <T>(kind: NoteKind<T>, entries: readonly T[], entry: T): Validated<readonly T[]> => {
  const id = kind.id(entry)
  if (entries.some((existing) => kind.id(existing) === id)) {
    return fail(`${kind.idLabel} ${id} is already recorded on this SHA; each ${kind.idLabel} needs a new UUID`)
  }
  const previous = entries.at(-1)
  const supersedes = kind.supersedes.of(entry) ?? (previous === undefined ? undefined : kind.id(previous))
  if (supersedes !== undefined && !entries.some((existing) => kind.id(existing) === supersedes)) {
    return fail(`${kind.supersedes.field} ${supersedes} is not a ${kind.entry} on this SHA`)
  }
  return { ok: true, value: [...entries, kind.withSupersedes(entry, supersedes)] }
}

/**
 * Validates `json` as one entry, runs `check` on it, and appends it to the note on its SHA in `ref`. Returns the
 * entry as recorded, with the entry it supersedes filled in.
 */
export const recordEntry = <T>(
  target: { readonly cwd: string; readonly kind: NoteKind<T>; readonly ref: string },
  json: string,
  check: (entry: T) => readonly string[] = () => []
): Validated<T> => {
  const { cwd, kind, ref } = target
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return fail(`the ${kind.entry} is not JSON`)
  }
  const entry = kind.validate(parsed)
  if (!entry.ok) return entry
  const problems = check(entry.value)
  if (problems.length > 0) return fail(...problems)
  const sha = kind.sha(entry.value)
  const existing = parseEntries(kind, readNote(cwd, ref, sha))
  if (!existing.ok) return existing
  const next = appendEntry(kind, existing.value, entry.value)
  if (!next.ok) return next
  writeNote(cwd, ref, sha, `${JSON.stringify({ [kind.listKey]: next.value, schemaVersion: 1 }, null, 2)}\n`)
  return { ok: true, value: next.value.at(-1) ?? entry.value }
}

/** The latest entry on `revision` in `ref`, or undefined when the commit has no note. */
export const latestEntry = <T>(
  target: { readonly cwd: string; readonly kind: NoteKind<T>; readonly ref: string },
  revision: string
): Validated<T | undefined> => {
  const entries = parseEntries(target.kind, readNote(target.cwd, target.ref, resolveSha(target.cwd, revision)))
  return entries.ok ? { ok: true, value: entries.value.at(-1) } : entries
}
