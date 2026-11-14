/**
 * Git access for the agent workflow tooling. Every call runs in `cwd` and reads committed content or notes only.
 * Notes stay local: nothing here fetches or pushes a notes ref.
 */
import { execFileSync } from "node:child_process"

import type { Validated } from "./schema-checks.ts"

const git = (cwd: string, args: readonly string[], input?: string): string =>
  execFileSync("git", args, { cwd, encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024, stdio: "pipe" })

const gitOrUndefined = (cwd: string, args: readonly string[]): string | undefined => {
  try {
    return git(cwd, args)
  } catch {
    return undefined
  }
}

const lines = (output: string): readonly string[] => output.split("\n").filter((line) => line.length > 0)

export const resolveSha = (cwd: string, revision: string): string =>
  git(cwd, ["rev-parse", "--verify", `${revision}^{commit}`]).trim()

/** Whether `sha` is the full SHA of a commit in the repository. */
export const isCommit = (cwd: string, sha: string): boolean =>
  gitOrUndefined(cwd, ["rev-parse", "--verify", "--quiet", `${sha}^{commit}`])?.trim() === sha

export const repositoryRoot = (cwd: string): string => git(cwd, ["rev-parse", "--show-toplevel"]).trim()

export const currentBranch = (cwd: string): string | undefined =>
  gitOrUndefined(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"])?.trim()

/** A file's content at a revision, or undefined when it does not exist there. */
export const readAtSha = (cwd: string, sha: string, path: string): string | undefined =>
  gitOrUndefined(cwd, ["show", `${sha}:${path}`])

/** Paths that differ between two revisions. */
export const changedPaths = (cwd: string, from: string, to: string): readonly string[] =>
  lines(git(cwd, ["diff", "--name-only", from, to]))

/** A notes ref under refs/notes/, so a mistyped option cannot write a branch or tag. */
export const checkNotesRef = (ref: string): Validated<string> =>
  /^refs\/notes\/[\w./-]+$/.test(ref) && !ref.includes("..")
    ? { ok: true, value: ref }
    : { ok: false, problems: [`${ref} is not a ref under refs/notes/`] }

/** How far below HEAD the gate looks for a note. */
export const ancestorLimit = 200

/** The nearest commit at or below `head`, within `ancestorLimit` commits, that carries a note in `ref`. */
export const nearestAnnotated = (cwd: string, ref: string, head: string): string | undefined => {
  const annotated = new Set(
    lines(gitOrUndefined(cwd, ["notes", `--ref=${ref}`, "list"]) ?? "").map((line) => line.split(" ")[1])
  )
  return lines(git(cwd, ["rev-list", `--max-count=${String(ancestorLimit)}`, head])).find((sha) => annotated.has(sha))
}

export const readNote = (cwd: string, ref: string, sha: string): string | undefined =>
  gitOrUndefined(cwd, ["notes", `--ref=${ref}`, "show", sha])

/** Replaces the note on `sha` in `ref`. Git keeps the previous note in the notes ref's own history. */
export const writeNote = (cwd: string, ref: string, sha: string, content: string): void => {
  git(cwd, ["notes", `--ref=${ref}`, "add", "--force", "--file=-", sha], content)
}
