/** Git access for verification tooling. Every call runs in `cwd` and reads committed content only. */
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { FeatureArtifacts } from "./request.ts"

export const notesRef = "refs/notes/verification"

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] })

const gitOrUndefined = (cwd: string, args: readonly string[]): string | undefined => {
  try {
    return git(cwd, args)
  } catch {
    return undefined
  }
}

export const resolveSha = (cwd: string, revision: string): string =>
  git(cwd, ["rev-parse", "--verify", `${revision}^{commit}`]).trim()

export const repositoryRoot = (cwd: string): string => git(cwd, ["rev-parse", "--show-toplevel"]).trim()

export const currentBranch = (cwd: string): string | undefined =>
  gitOrUndefined(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"])?.trim()

/** A file's content at a revision, or undefined when it does not exist there. */
export const readAtSha = (cwd: string, sha: string, path: string): string | undefined =>
  gitOrUndefined(cwd, ["show", `${sha}:${path}`])

/** The artifacts the request is built from, read at `sha` rather than from the working tree. */
export const featureArtifactsAt = (cwd: string, sha: string, featureDir: string): FeatureArtifacts | string => {
  const read = (name: string): string | undefined => readAtSha(cwd, sha, `${featureDir}/${name}`)
  const plan = read("plan.md")
  const verification = read("verification.md")
  const quickstart = read("quickstart.md")
  if (plan === undefined || verification === undefined || quickstart === undefined) {
    return `${featureDir} at ${sha.slice(0, 12)} lacks plan.md, verification.md, or quickstart.md`
  }
  return { plan, quickstart, research: read("research.md"), verification }
}

/** Paths that differ between two revisions. */
export const changedPaths = (cwd: string, from: string, to: string): readonly string[] =>
  git(cwd, ["diff", "--name-only", from, to]).split("\n").filter((line) => line.length > 0)

/** HEAD and its ancestors, nearest first, stopping after `limit` commits. */
export const ancestry = (cwd: string, head: string, limit: number): readonly string[] =>
  git(cwd, ["rev-list", `--max-count=${String(limit)}`, head]).split("\n").filter((line) => line.length > 0)

/** Every commit that carries a verification note. */
export const annotatedCommits = (cwd: string): ReadonlySet<string> =>
  new Set(
    (gitOrUndefined(cwd, ["notes", `--ref=${notesRef}`, "list"]) ?? "")
      .split("\n")
      .map((line) => line.split(" ")[1])
      .filter((sha): sha is string => sha !== undefined)
  )

export const readNote = (cwd: string, sha: string): string | undefined =>
  gitOrUndefined(cwd, ["notes", `--ref=${notesRef}`, "show", sha])

/** Replaces the note on `sha`. Git keeps the previous note in the notes ref's own history. */
export const writeNote = (cwd: string, sha: string, content: string): void => {
  const directory = mkdtempSync(join(tmpdir(), "verification-note-"))
  try {
    const file = join(directory, "note.json")
    writeFileSync(file, content)
    git(cwd, ["notes", `--ref=${notesRef}`, "add", "--force", "--file", file, sha])
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
}
