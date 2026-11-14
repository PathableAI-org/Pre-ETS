/**
 * Claude Code PreToolUse hook for Bash. Before `gh pr ready` on an implementation-slice branch, it runs the
 * verification gate and blocks the command (exit 2) when the gate fails. Every other command and branch passes
 * through without touching git.
 */
import { readFileSync } from "node:fs"

import { featureForBranch, runGate } from "./verification.ts"

interface HookInput {
  readonly cwd?: unknown
  readonly tool_input?: undefined | { readonly command?: unknown }
}

const marksReady = (command: string): boolean =>
  /(^|[\s;&|(])gh\s+pr\s+ready\b/.test(command) && !/\s--undo\b/.test(command)

const input = JSON.parse(readFileSync(0, "utf8")) as HookInput
const command = typeof input.tool_input?.command === "string" ? input.tool_input.command : ""
const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd()

if (marksReady(command) && featureForBranch(cwd) !== undefined) {
  const gate = runGate(cwd)
  if (!gate.ok) {
    process.stderr.write(
      `Blocked: the verification and code review gate fails for this implementation slice, so it cannot be marked ready.\n${
        gate.problems.map((problem) => `  - ${problem}`).join("\n")
      }\nRequest verification or code review of the pushed SHA, or run \`pnpm verify:gate\` for details.\n`
    )
    process.exitCode = 2
  }
}
