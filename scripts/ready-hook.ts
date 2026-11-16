/**
 * Decisions for the Claude Code PreToolUse hook that gates marking a pull request ready for review, however a session
 * attempts it: `gh pr ready`, a `gh api` call that clears `draft` or posts to the `ccr/ready_for_review` route, or the
 * GitHub MCP tool's `update_pull_request` with `draft: false`. An implementation-slice branch or a High fix (labelled
 * risk:high, and not a Spec Kit specification or plan branch) must pass the verification and code review gate, judged
 * at the pull request's head after syncing its note comments. Paths the gate cannot judge are refused with the gated
 * way to do the same thing. Once the gate passes or does not apply, marking ready needs no person's confirmation. See
 * docs/engineering/verification-harness.md#gate-and-escalation.
 */
import type { Validated } from "./schema-checks.ts"

import { currentBranch, isCommit } from "./git-access.ts"
import { openPullForBranch, type PullRequest, pullRequest, type RestAccess } from "./github-access.ts"
import { syncNotice } from "./note-sync.ts"
import { defaultNotesRef } from "./review-findings.ts"
import { checkedOut, gateApplies, isImplementationBranch, runGate } from "./verification.ts"

export type Decision =
  | { readonly kind: "allow" }
  | { readonly kind: "approve"; readonly reason: string }
  | { readonly kind: "block"; readonly reason: string }

export interface HookInput {
  readonly cwd?: unknown
  readonly tool_input?: unknown
  readonly tool_name?: unknown
}

export type ReadyAttempt =
  | { readonly approveHere: boolean; readonly kind: "gate"; readonly target: ReadyTarget }
  | { readonly kind: "refuse"; readonly reason: string }

export type ReadyTarget =
  | { readonly kind: "branch"; readonly name: string }
  | { readonly kind: "checked-out" }
  | { readonly kind: "pull"; readonly number: number; readonly repository?: string | undefined }

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined

/** Where a command segment starts: the start of the line or after a shell separator. */
const segmentStart = String.raw`(?:^|[\s;&|(])`

/** The target named by `gh pr ready`'s arguments: a number, a pull request URL, a branch, or the checked-out branch. */
const prReadyTarget = (args: readonly string[]): ReadyTarget => {
  const positional = args.find((arg, index) =>
    !arg.startsWith("-") && !["--repo", "-R"].includes(args[index - 1] ?? "")
  )
  if (positional === undefined) return { kind: "checked-out" }
  const number = /^(?:\d+|.*\/pull\/(\d+)\/?)$/.exec(positional)
  if (number !== null) return { kind: "pull", number: Number(number[1] ?? positional) }
  return { kind: "branch", name: positional }
}

/** A REST call to the pull request's ready-for-review route, through `gh api` or another HTTP client. */
const restReadyRoute = new RegExp(`${segmentStart}(?:gh\\s+api|curl)\\b.*\\bpulls/(\\d+)/ccr/ready_for_review\\b`)

/** A `gh api` call that sets `draft` false on a pull request, as a field or in a JSON body. */
const restClearDraft = new RegExp(
  `${segmentStart}gh\\s+api\\b.*\\bpulls/(\\d+)\\b.*(?:\\bdraft=false\\b|"draft"\\s*:\\s*false\\b)`
)

const bashAttempt = (command: string): ReadyAttempt | undefined => {
  const ready = new RegExp(`${segmentStart}gh\\s+pr\\s+ready\\b([^;&|)]*)`).exec(command)
  if (ready !== null) {
    const args = (ready[1] ?? "").trim().split(/\s+/).filter((arg) => arg.length > 0)
    return args.includes("--undo") ? undefined : { approveHere: false, kind: "gate", target: prReadyTarget(args) }
  }
  if (new RegExp(`${segmentStart}gh\\s+stack\\s+submit\\b[^;&|]*\\s--open\\b`).test(command)) {
    return {
      kind: "refuse",
      reason: "`gh stack submit --open` marks every pull request in the stack ready without the gate. Submit without "
        + "--open, then mark each pull request ready on its own."
    }
  }
  if (new RegExp(`${segmentStart}gh\\s+api\\b`).test(command) && command.includes("markPullRequestReadyForReview")) {
    return {
      kind: "refuse",
      reason: "A GraphQL ready-for-review mutation names no branch the gate can judge. Use `gh pr ready`, the REST "
        + "ccr/ready_for_review route, or the GitHub MCP tool's update_pull_request with draft: false."
    }
  }
  const rest = restReadyRoute.exec(command) ?? restClearDraft.exec(command)
  return rest === null
    ? undefined
    : { approveHere: false, kind: "gate", target: { kind: "pull", number: Number(rest[1]) } }
}

const mcpUpdateAttempt = (input: unknown): ReadyAttempt | undefined => {
  const number = field(input, "pullNumber")
  if (field(input, "draft") !== false || typeof number !== "number") return undefined
  const owner = field(input, "owner")
  const repo = field(input, "repo")
  const repository = typeof owner === "string" && typeof repo === "string" ? `${owner}/${repo}` : undefined
  return { approveHere: true, kind: "gate", target: { kind: "pull", number, repository } }
}

const mcpCreateAttempt = (input: unknown): ReadyAttempt | undefined => {
  const head = field(input, "head")
  if (field(input, "draft") === true || typeof head !== "string") return undefined
  return !isImplementationBranch(head) ? undefined : {
    kind: "refuse",
    reason: `Create the pull request for ${head} as a draft (draft: true), then mark it ready once the gate passes.`
  }
}

/** The ready-for-review attempt a tool call makes, or undefined when it makes none. */
export const readyAttempt = (toolName: unknown, toolInput: unknown): ReadyAttempt | undefined => {
  if (toolName === "Bash") {
    const command = field(toolInput, "command")
    return typeof command === "string" ? bashAttempt(command) : undefined
  }
  if (toolName === "mcp__github__update_pull_request") return mcpUpdateAttempt(toolInput)
  return toolName === "mcp__github__create_pull_request" ? mcpCreateAttempt(toolInput) : undefined
}

const blocked = (problems: readonly string[]): Decision => ({
  kind: "block",
  reason: `Blocked: the verification and code review gate fails, so this pull request cannot be marked ready.\n${
    problems.map((problem) => `  - ${problem}`).join("\n")
  }\nRequest verification or code review of the pushed SHA, or run \`pnpm verify:gate\` on the branch for details.\n`
})

/** The gate at a pull request's head, after importing its note comments. */
const gatePull = (cwd: string, rest: RestAccess, pull: PullRequest): readonly string[] | undefined => {
  const target = { branch: pull.headRef, head: pull.headSha, labels: pull.labels }
  if (!gateApplies(cwd, target)) return undefined
  if (!isCommit(cwd, pull.headSha)) {
    return [`the head ${pull.headSha} of ${pull.headRef} is not in this clone; fetch the branch first`]
  }
  const notice = syncNotice({ cwd, refs: { review: defaultNotesRef }, rest }, pull.number)
  const gate = runGate(cwd, target)
  return gate.ok ? undefined : [...notice.trimEnd().split("\n"), ...gate.problems]
}

/** The pull request a number names, gated at its head. */
const pullProblems = (
  cwd: string,
  rest: RestAccess,
  target: { readonly number: number; readonly repository?: string | undefined }
): readonly string[] | undefined => {
  const pull = pullRequest(rest, target.number, target.repository)
  return pull.ok ? gatePull(cwd, rest, pull.value) : [`cannot read the pull request: ${pull.problems.join("; ")}`]
}

/**
 * A branch's open pull request, gated at its head. Offline or before the pull request exists, a checked-out slice
 * branch is still gated on its local notes; any other branch GitHub cannot answer for is refused.
 */
const branchProblems = (
  cwd: string,
  rest: RestAccess,
  target: { readonly checkedOut: boolean; readonly name: string }
): readonly string[] | undefined => {
  const pull: Validated<PullRequest | undefined> = openPullForBranch(rest, target.name)
  if (pull.ok && pull.value !== undefined) return gatePull(cwd, rest, pull.value)
  if (target.checkedOut && isImplementationBranch(target.name)) {
    const gate = runGate(cwd, checkedOut(cwd))
    return gate.ok ? undefined : gate.problems
  }
  return pull.ok ? undefined : [`cannot tell whether ${target.name} needs the gate: ${pull.problems.join("; ")}`]
}

/** Problems that block the attempt, or undefined when it may go ahead. */
const targetProblems = (cwd: string, rest: RestAccess, target: ReadyTarget): readonly string[] | undefined => {
  if (target.kind === "pull") return pullProblems(cwd, rest, target)
  if (target.kind === "branch") return branchProblems(cwd, rest, { checkedOut: false, name: target.name })
  const branch = currentBranch(cwd)
  return branch === undefined ? undefined : branchProblems(cwd, rest, { checkedOut: true, name: branch })
}

/** What the hook does with a tool call. */
export const readyDecision = (input: HookInput, rest: RestAccess): Decision => {
  const attempt = readyAttempt(input.tool_name, input.tool_input)
  if (attempt === undefined) return { kind: "allow" }
  if (attempt.kind === "refuse") return { kind: "block", reason: `Blocked: ${attempt.reason}\n` }
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd()
  const problems = targetProblems(cwd, rest, attempt.target)
  if (problems !== undefined) return blocked(problems)
  // Once the gate passes, marking ready needs no person's confirmation. Shell commands defer to the project settings,
  // which allow the ready commands segment by segment; approving a whole command here would also approve whatever
  // else it chains. An MCP call is one action, so the hook approves it.
  return attempt.approveHere
    ? { kind: "approve", reason: "The verification and code review gate passes or does not apply." }
    : { kind: "allow" }
}

/** The hook's exit code, stdout, and stderr for a decision, as Claude Code reads them. */
export const hookOutput = (
  decision: Decision
): { readonly exitCode: number; readonly stderr: string; readonly stdout: string } => {
  if (decision.kind === "block") return { exitCode: 2, stderr: decision.reason, stdout: "" }
  if (decision.kind === "allow") return { exitCode: 0, stderr: "", stdout: "" }
  const output = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      permissionDecisionReason: decision.reason
    }
  }
  return { exitCode: 0, stderr: "", stdout: `${JSON.stringify(output)}\n` }
}
