/**
 * Claude Code PreToolUse hook for Bash and the GitHub MCP pull request tools. It reads the tool call from stdin and
 * blocks (exit 2) an attempt to mark a pull request ready when the verification and code review gate fails, and
 * approves an MCP ready attempt the gate lets through; see scripts/ready-hook.ts. Every other tool call passes through
 * without touching git or GitHub.
 */
import { readFileSync } from "node:fs"

import { ghRest } from "./github-access.ts"
import { type HookInput, hookOutput, readyDecision } from "./ready-hook.ts"

const input = JSON.parse(readFileSync(0, "utf8")) as HookInput
const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd()
const output = hookOutput(readyDecision(input, ghRest(cwd)))
process.stdout.write(output.stdout)
process.stderr.write(output.stderr)
process.exitCode = output.exitCode
