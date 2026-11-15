/** A throwaway Git repository holding the sample feature, for verification tooling tests. */
import { execFileSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import type { RestAccess } from "../../scripts/github-access.ts"

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

/** A pull request as the REST API returns it, reduced to the fields the tooling reads. */
export const restPull = (
  number: number,
  head: { readonly ref: string; readonly sha: string },
  labels: readonly string[] = []
): Record<string, unknown> => ({ draft: true, head, labels: labels.map((name) => ({ name })), number })

export interface FakeGitHub extends RestAccess {
  /** Comments by pull request number, in the REST shape, oldest first. Posting appends here. */
  readonly comments: Map<number, Record<string, unknown>[]>
  /** Every path requested, in order. */
  readonly requests: string[]
}

/**
 * GitHub REST in memory, for tests that must not call the network. It serves the routes the tooling uses, and fails
 * every call like an unreachable network when `offline` is set.
 */
export const fakeGitHub = (
  options: {
    readonly comments?: Readonly<Record<number, readonly Record<string, unknown>[]>>
    readonly login?: string
    readonly offline?: boolean
    readonly pulls?: readonly Record<string, unknown>[]
  } = {}
): FakeGitHub => {
  const login = options.login ?? "person"
  const pulls = options.pulls ?? []
  const comments = new Map(Object.entries(options.comments ?? {}).map(([pr, list]) => [Number(pr), [...list]]))
  const requests: string[] = []
  const reach = (path: string): void => {
    requests.push(path)
    if (options.offline === true) {
      throw Object.assign(new Error("gh failed"), { stderr: "error connecting to api.github.com\n" })
    }
  }
  const headOf = (pull: Record<string, unknown>): Record<string, unknown> => pull.head as Record<string, unknown>
  const get = (path: string): unknown => {
    reach(path)
    if (path === "user") return { login }
    if (path === "repos/{owner}/{repo}") return { html_url: "https://github.test/owner/repo" }
    const byHead = /^repos\/\{owner\}\/\{repo\}\/pulls\?state=open&head=\{owner\}:(.+)$/.exec(path)
    if (byHead !== null) return pulls.filter((pull) => headOf(pull).ref === decodeURIComponent(byHead[1] ?? ""))
    const one = /^repos\/[^/]+\/[^/]+\/pulls\/(\d+)$/.exec(path)
    if (one !== null) {
      const pull = pulls.find((candidate) => candidate.number === Number(one[1]))
      if (pull === undefined) throw Object.assign(new Error("gh failed"), { stderr: "HTTP 404: Not Found\n" })
      return pull
    }
    const page = /^repos\/\{owner\}\/\{repo\}\/issues\/(\d+)\/comments\?per_page=(\d+)&page=(\d+)$/.exec(path)
    if (page !== null) {
      const size = Number(page[2])
      const start = (Number(page[3]) - 1) * size
      return (comments.get(Number(page[1])) ?? []).slice(start, start + size)
    }
    throw new Error(`unexpected GET ${path}`)
  }
  const post = (path: string, body: Readonly<Record<string, unknown>>): unknown => {
    reach(path)
    const target = /^repos\/\{owner\}\/\{repo\}\/issues\/(\d+)\/comments$/.exec(path)
    if (target === null) throw new Error(`unexpected POST ${path}`)
    const list = comments.get(Number(target[1])) ?? []
    const id = list.length + 1
    list.push({ body: body.body, id, user: { login } })
    comments.set(Number(target[1]), list)
    return { html_url: `https://github.test/pull/${target[1] ?? ""}#issuecomment-${String(id)}` }
  }
  return { comments, get, post, requests }
}

/** An issue comment in the REST shape. */
export const restComment = (id: number, author: string, body: string): Record<string, unknown> => ({
  body,
  id,
  user: { login: author }
})
