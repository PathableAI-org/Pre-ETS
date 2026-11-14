/** A throwaway Git repository holding the sample feature, for verification tooling tests. */
import { execFileSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures")
export const featureDir = "specs/900-sample"

export const fixture = (name: string): string => readFileSync(join(fixtures, name), "utf8")

export interface SampleRepo {
  readonly commit: (message: string, files: Readonly<Record<string, string>>) => string
  readonly dir: string
  readonly git: (...args: readonly string[]) => string
  readonly remove: () => void
}

export const sampleRepo = (branch = "900-sample-impl"): SampleRepo => {
  const dir = mkdtempSync(join(tmpdir(), "verification-test-"))
  const git = (...args: readonly string[]): string =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  const commit = (message: string, files: Readonly<Record<string, string>>): string => {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), content)
    }
    git("add", "--all")
    git("commit", "--quiet", "--message", message)
    return git("rev-parse", "HEAD")
  }
  git("init", "--quiet", "--initial-branch", "main")
  git("config", "user.email", "verifier@example.test")
  git("config", "user.name", "Verifier")
  git("config", "commit.gpgsign", "false")
  git("config", "core.hooksPath", "/dev/null")
  mkdirSync(join(dir, featureDir), { recursive: true })
  for (const name of ["plan.md", "research.md", "verification.md", "quickstart.md"]) {
    cpSync(join(fixtures, name), join(dir, featureDir, name))
  }
  commit("plan", { "src/app.ts": "export const app = 1\n" })
  git("checkout", "--quiet", "-b", branch)
  return {
    commit,
    dir,
    git,
    remove: () => {
      rmSync(dir, { force: true, recursive: true })
    }
  }
}

/** The A1 sample report for `sha`, optionally changed by `edit`. */
export const sampleReport = (
  sha: string,
  edit: (report: Record<string, unknown>) => void = () => undefined
): string => {
  const report = JSON.parse(fixture("report-a1.json")) as Record<string, unknown>
  report.verifiedSha = sha
  edit(report)
  return JSON.stringify(report)
}

/** A passing round-one review of slice A1 from `base` to `sha`, optionally changed by `edit`. */
export const sampleReview = (
  base: string,
  sha: string,
  edit: (review: Record<string, unknown>) => void = () => undefined
): string => {
  const review = JSON.parse(fixture("review-a1.json")) as Record<string, unknown>
  Object.assign(review, { baseSha: base, findings: [], reviewedSha: sha })
  edit(review)
  return JSON.stringify(review)
}
