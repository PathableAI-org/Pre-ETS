/**
 * Moves note entries between clones through pull request comments. Each session keeps its own clone, so a
 * verification report or code review recorded in one clone reaches the others only through GitHub: recording also
 * posts the entry as a marked comment on the pull request, and sync imports marked comments back into the local notes
 * the gate reads. See docs/engineering/code-review.md#storage.
 *
 * Trust: sync imports only comments by the account `gh` is authenticated as, because every session posts as the
 * person who runs it. That is as strong as notes anyone with the clone can write, not stronger: any session or tool
 * holding that login, and a repository maintainer editing the comment, can change what is imported.
 */
import type { Validated } from "./schema-checks.ts"

import { branchesAt, currentBranch, isCommit } from "./git-access.ts"
import {
  authenticatedLogin,
  issueComments,
  openPullForBranch,
  postIssueComment,
  type PullRequest,
  type RestAccess
} from "./github-access.ts"
import { type ChannelName, formatComment, parseComment } from "./note-sync/comment.ts"
import {
  blockingSummary,
  defaultNotesRef,
  importReview,
  latestReview,
  type Review,
  validateReview
} from "./review-findings.ts"
import { importReport, reportAt, validateReport, type VerificationReport } from "./verification.ts"

export { type ChannelName, channelNames } from "./note-sync/comment.ts"

/** The review notes ref, which trials may change. Verification reports always use refs/notes/verification. */
export interface NoteRefs {
  readonly review: string
}

interface Channel<T> {
  readonly id: (entry: T) => string
  readonly import: (cwd: string, refs: NoteRefs, json: string) => Validated<{ readonly written: boolean }>
  readonly latest: (cwd: string, refs: NoteRefs, revision: string) => Validated<T>
  readonly name: ChannelName
  readonly sha: (entry: T) => string
  readonly summary: (entry: T) => string
  readonly validate: (value: unknown) => Validated<T>
}

const fail = (...problems: readonly string[]): { readonly ok: false; readonly problems: readonly string[] } => ({
  ok: false,
  problems
})

const count = (entries: readonly unknown[], noun: string): string => `${String(entries.length)} ${noun}`

/** A `--pr` option: absent, or a pull request number. */
const pullRequestOption = (value: string | undefined): Validated<number | undefined> => {
  if (value === undefined) return { ok: true, value: undefined }
  return /^\d+$/.test(value) ? { ok: true, value: Number(value) } : fail(`${value} is not a pull request number`)
}

const reportSummary = (report: VerificationReport): string => {
  const results = ["established", "violated", "not established", "blocked"].flatMap((result) => {
    const matching = report.claims.filter((claim) => claim.result === result)
    return matching.length > 0 ? [count(matching, result)] : []
  })
  return `**Verification report** run \`${report.runId}\` of slice ${report.sliceId} at \`${report.verifiedSha}\`: ${
    results.length > 0 ? results.join(", ") : "no claims"
  }; ${count(report.telemetryRows.filter((row) => row.status !== "present"), "telemetry rows not present")}; ${
    count(report.forbiddenData, "forbidden-data findings")
  }; ${count(report.escalations, "escalations")}.`
}

const verification: Channel<VerificationReport> = {
  id: (report) => report.runId,
  import: (cwd, _refs, json) => importReport(cwd, json),
  latest: (cwd, _refs, revision) => {
    const report = reportAt(cwd, revision)
    if (!report.ok) return report
    return report.value === undefined
      ? fail(`no verification report on ${revision}`)
      : { ok: true, value: report.value }
  },
  name: "verification",
  sha: (report) => report.verifiedSha,
  summary: reportSummary,
  validate: validateReport
}

const review: Channel<Review> = {
  id: (entry) => entry.reviewId,
  import: (cwd, refs, json) => importReview(cwd, refs.review, json),
  latest: (cwd, refs, revision) => latestReview(cwd, refs.review, revision),
  name: "review",
  sha: (entry) => entry.reviewedSha,
  summary: (entry) => `**Code review** ${blockingSummary(entry).trimEnd().replaceAll("\n", "\n\n")}`,
  validate: validateReview
}

/** The open pull request whose head branch has `sha` at its tip, or `pr` when the caller names one. */
const pullForSha = (cwd: string, rest: RestAccess, sha: string, pr: number | undefined): Validated<number> => {
  if (pr !== undefined) return { ok: true, value: pr }
  const branches = branchesAt(cwd, sha)
  if (branches.length === 0) return fail(`no local or fetched branch has ${sha} at its tip; pass --pr <number>`)
  const numbers = new Set<number>()
  for (const branch of branches) {
    const pull = openPullForBranch(rest, branch)
    if (!pull.ok) return pull
    if (pull.value !== undefined) numbers.add(pull.value.number)
  }
  const found = [...numbers]
  if (found.length === 1 && found[0] !== undefined) return { ok: true, value: found[0] }
  return found.length === 0
    ? fail(`no open pull request has ${branches.join(", ")} as its head; pass --pr <number>`)
    : fail(`open pull requests ${found.map((number) => `#${String(number)}`).join(", ")} all have ${sha}; pass --pr`)
}

/** The IDs of entries of `kind` already posted on the pull request by `login`. */
const postedIds = (rest: RestAccess, pr: number, login: string, kind: ChannelName): Validated<ReadonlySet<string>> => {
  const comments = issueComments(rest, pr)
  if (!comments.ok) return comments
  return {
    ok: true,
    value: new Set(comments.value.flatMap((comment) => {
      const parsed = comment.author === login ? parseComment(comment.body) : undefined
      return parsed?.ok === true && parsed.value.kind === kind ? [parsed.value.id] : []
    }))
  }
}

export interface Published {
  /** False when the pull request already had a comment for this entry, so nothing was posted. */
  readonly posted: boolean
  readonly pr: number
  readonly url: string | undefined
}

const publish = <T>(
  channel: Channel<T>,
  target: { readonly cwd: string; readonly pr?: number | undefined; readonly rest: RestAccess },
  entry: T
): Validated<Published> => {
  const { cwd, rest } = target
  const pr = pullForSha(cwd, rest, channel.sha(entry), target.pr)
  if (!pr.ok) return pr
  const login = authenticatedLogin(rest)
  if (!login.ok) return login
  const posted = postedIds(rest, pr.value, login.value, channel.name)
  if (!posted.ok) return posted
  if (posted.value.has(channel.id(entry))) return { ok: true, value: { posted: false, pr: pr.value, url: undefined } }
  const marker = { id: channel.id(entry), kind: channel.name, sha: channel.sha(entry) }
  const url = postIssueComment(rest, pr.value, formatComment(marker, channel.summary(entry), entry))
  return url.ok ? { ok: true, value: { posted: true, pr: pr.value, url: url.value } } : url
}

/** Posts a recorded report on the pull request for its verified SHA, unless that pull request already has it. */
export const publishReport = (
  target: { readonly cwd: string; readonly pr?: number | undefined; readonly rest: RestAccess },
  report: VerificationReport
): Validated<Published> => publish(verification, target, report)

/** Posts a recorded review on the pull request for its reviewed SHA, unless that pull request already has it. */
export const publishReview = (
  target: { readonly cwd: string; readonly pr?: number | undefined; readonly rest: RestAccess },
  entry: Review
): Validated<Published> => publish(review, target, entry)

/** Posts the latest local entry of `kind` on `revision`, for a record whose posting failed. */
export const publishLatest = (
  target: {
    readonly cwd: string
    readonly pr?: string | undefined
    readonly refs: NoteRefs
    readonly rest: RestAccess
  },
  kind: ChannelName,
  revision: string
): Validated<Published> => {
  const pr = pullRequestOption(target.pr)
  if (!pr.ok) return pr
  const options = { ...target, pr: pr.value }
  if (kind === "review") {
    const latest = review.latest(target.cwd, target.refs, revision)
    return latest.ok ? publish(review, options, latest.value) : latest
  }
  const latest = verification.latest(target.cwd, target.refs, revision)
  return latest.ok ? publish(verification, options, latest.value) : latest
}

/** Publishes an entry a record command just recorded and writes the outcome. Returns the command's exit code. */
const publishAndWrite = <T>(
  channel: Channel<T>,
  target: { readonly cwd: string; readonly pr?: string | undefined; readonly rest: RestAccess },
  entry: T
): number => {
  const pr = pullRequestOption(target.pr)
  const published = pr.ok ? publish(channel, { ...target, pr: pr.value }, entry) : pr
  const outcome = describePublish(channel.name, channel.sha(entry), published)
  ;(outcome.ok ? process.stdout : process.stderr).write(outcome.message)
  return outcome.ok ? 0 : 1
}

/**
 * Publishes a report `verify:record` just recorded, on the pull request `--pr` names or else the one for its SHA, and
 * writes the outcome. Returns the command's exit code: 1 when the report stays local only.
 */
export const publishRecordedReport = (
  target: { readonly cwd: string; readonly pr?: string | undefined; readonly rest: RestAccess },
  report: VerificationReport
): number => publishAndWrite(verification, target, report)

/**
 * Publishes a review `review:record` just recorded, like `publishRecordedReport`. A review recorded in a trial ref is
 * not posted, because sync would import it into every other clone's real review ref.
 */
export const publishRecordedReview = (
  target: { readonly cwd: string; readonly pr?: string | undefined; readonly ref: string; readonly rest: RestAccess },
  entry: Review
): number => {
  if (target.ref === defaultNotesRef) return publishAndWrite(review, target, entry)
  process.stdout.write(`Not published: ${target.ref} is a trial ref, and only ${defaultNotesRef} entries are posted.\n`)
  return 0
}

/**
 * What a record command prints about publishing its entry. A failure keeps the local record and says how to post it
 * once the cause is fixed, so a missing pull request or network is never silent.
 */
export const describePublish = (
  kind: ChannelName,
  sha: string,
  published: Validated<Published>
): { readonly message: string; readonly ok: boolean } => {
  if (!published.ok) {
    return {
      message: `Recorded locally, but NOT published to a pull request, so other clones cannot see it:\n${
        published.problems.map((problem) => `  - ${problem}`).join("\n")
      }\nOnce fixed, post it with: pnpm notes:publish ${kind} ${sha} [--pr <number>]\n`,
      ok: false
    }
  }
  const { posted, pr, url } = published.value
  return {
    message: posted
      ? `Published on pull request #${String(pr)}: ${url ?? ""}\n`
      : `Pull request #${String(pr)} already has this ${kind} entry; nothing posted.\n`,
    ok: true
  }
}

export interface SyncResult {
  readonly imported: number
  readonly present: number
  /** One reason per marked comment that was not imported. */
  readonly rejected: readonly string[]
}

type CommentOutcome = "imported" | "present" | { readonly rejected: string }

const importComment = <T>(
  channel: Channel<T>,
  target: { readonly cwd: string; readonly refs: NoteRefs },
  comment: { readonly entry: unknown; readonly id: string; readonly sha: string }
): Validated<{ readonly written: boolean }> => {
  const entry = channel.validate(comment.entry)
  if (!entry.ok) return entry
  if (channel.sha(entry.value) !== comment.sha || channel.id(entry.value) !== comment.id) {
    return fail("its marker does not match the entry's SHA and ID")
  }
  if (!isCommit(target.cwd, comment.sha)) return fail(`${comment.sha} is not in this clone; fetch the branch first`)
  return channel.import(target.cwd, target.refs, JSON.stringify(entry.value))
}

const syncComment = (
  target: { readonly cwd: string; readonly login: string; readonly refs: NoteRefs },
  comment: { readonly author: string; readonly body: string; readonly id: number }
): CommentOutcome | undefined => {
  const parsed = parseComment(comment.body)
  if (parsed === undefined) return undefined
  const label = `comment ${String(comment.id)} by ${comment.author}`
  if (comment.author !== target.login) {
    return { rejected: `${label}: only comments by ${target.login}, the authenticated account, are imported` }
  }
  if (!parsed.ok) return { rejected: `${label}: ${parsed.problems.join("; ")}` }
  const outcome = parsed.value.kind === "review"
    ? importComment(review, target, parsed.value)
    : importComment(verification, target, parsed.value)
  if (!outcome.ok) return { rejected: `${label}: ${outcome.problems.join("; ")}` }
  return outcome.value.written ? "imported" : "present"
}

/**
 * Imports every valid note comment on pull request `pr` by the authenticated account into the local notes, oldest
 * first, so entries keep the order they were recorded in. An entry whose ID is already on its SHA is left alone, so
 * syncing again changes nothing. A marked comment that fails validation is rejected with its reason and never written.
 */
export const syncPullNotes = (
  target: { readonly cwd: string; readonly refs: NoteRefs; readonly rest: RestAccess },
  pr: number
): Validated<SyncResult> => {
  const login = authenticatedLogin(target.rest)
  if (!login.ok) return login
  const comments = issueComments(target.rest, pr)
  if (!comments.ok) return comments
  const outcomes = comments.value.flatMap((comment) => {
    const outcome = syncComment({ ...target, login: login.value }, comment)
    return outcome === undefined ? [] : [outcome]
  })
  return {
    ok: true,
    value: {
      imported: outcomes.filter((outcome) => outcome === "imported").length,
      present: outcomes.filter((outcome) => outcome === "present").length,
      rejected: outcomes.flatMap((outcome) => typeof outcome === "string" ? [] : [outcome.rejected])
    }
  }
}

/** One line on a sync's result, then one line per rejected comment. */
export const describeSync = (pr: number, result: SyncResult): string =>
  [
    `Notes: synced pull request #${String(pr)}: ${String(result.imported)} imported, ${
      String(result.present)
    } already present, ${String(result.rejected.length)} rejected.`,
    ...result.rejected.map((reason) => `  - rejected ${reason}`)
  ].join("\n") + "\n"

const localOnly = (reason: string): string => `Notes: ${reason}; reading local notes only.\n`

export interface ReadingContext {
  /** What happened, for stderr: the sync result, or why the local notes are read as they are. */
  readonly notice: string
  /** The checked-out branch's open pull request, when GitHub could be reached and one exists. */
  readonly pull: PullRequest | undefined
}

/**
 * Syncs the checked-out branch's pull request into the local notes before they are read. Without a branch, a pull
 * request, or GitHub, the local notes are read as they are and the notice says why.
 */
export const syncCheckedOutBranch = (
  target: { readonly cwd: string; readonly refs: NoteRefs; readonly rest: RestAccess }
): ReadingContext => {
  const found = checkedOutPull(target)
  if (!found.ok) return { notice: localOnly(found.problems.join("; ")), pull: undefined }
  const { branch, pull } = found.value
  return pull === undefined
    ? { notice: localOnly(`${branch} has no open pull request`), pull: undefined }
    : { notice: syncNotice(target, pull.number), pull }
}

/** The checked-out branch and its open pull request, if any. A detached HEAD or an unreachable GitHub is a problem. */
const checkedOutPull = (
  target: { readonly cwd: string; readonly rest: RestAccess }
): Validated<{ readonly branch: string; readonly pull: PullRequest | undefined }> => {
  const branch = currentBranch(target.cwd)
  if (branch === undefined) return fail("HEAD is detached, so there is no pull request")
  const pull = openPullForBranch(target.rest, branch)
  return pull.ok
    ? { ok: true, value: { branch, pull: pull.value } }
    : fail(`GitHub is unreachable (${pull.problems.join("; ")})`)
}

/** The pull request `notes:sync` reads: the one named, or else the checked-out branch's open one. */
export const pullRequestToSync = (
  target: { readonly cwd: string; readonly rest: RestAccess },
  given: string | undefined
): Validated<number> => {
  const named = pullRequestOption(given)
  if (!named.ok || named.value !== undefined) return named.ok ? { ok: true, value: named.value ?? 0 } : named
  const found = checkedOutPull(target)
  if (!found.ok) return found
  const { branch, pull } = found.value
  return pull === undefined ? fail(`${branch} has no open pull request; name one`) : { ok: true, value: pull.number }
}

/** Syncs pull request `pr` and describes the result, or why the local notes are read as they are. */
export const syncNotice = (
  target: { readonly cwd: string; readonly refs: NoteRefs; readonly rest: RestAccess },
  pr: number
): string => {
  const synced = syncPullNotes(target, pr)
  return synced.ok
    ? describeSync(pr, synced.value)
    : localOnly(`pull request #${String(pr)} could not be synced (${synced.problems.join("; ")})`)
}
