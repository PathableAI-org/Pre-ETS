/**
 * Runs a test command with telemetry on (docs/observability.md):
 *
 *   pnpm test:telemetry <command> [args…]
 *
 * Absent or empty OTEL settings get the local stack's defaults, explicit ones win, and `OTEL_SDK_DISABLED` set to a
 * true literal keeps telemetry off. Prints the run identifier on stderr, forwards SIGINT and SIGTERM to the command,
 * and exits with its status.
 */
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { constants } from "node:os"

import { testRunEnvironment } from "./test-run.ts"

const [command, ...args] = process.argv.slice(2)

if (command === undefined) {
  process.stderr.write("Usage: pnpm test:telemetry <command> [args…]\n")
  process.exitCode = 2
} else {
  const run = testRunEnvironment(process.env, randomUUID)
  process.stderr.write(
    run.telemetry === "on"
      ? `test:telemetry: run ${run.runId}; select its records by service.instance.id="${run.runId}"\n`
      : "test:telemetry: OTEL_SDK_DISABLED is set, so telemetry stays off\n"
  )
  const child = spawn(command, args, { env: run.env, stdio: "inherit" })
  const forward = (signal: NodeJS.Signals) => {
    child.kill(signal)
  }
  process.on("SIGINT", forward)
  process.on("SIGTERM", forward)
  child.on("error", (error) => {
    process.stderr.write(`test:telemetry: could not run ${command}: ${error.message}\n`)
    process.exitCode = 1
  })
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? 128 + (signal === null ? 0 : constants.signals[signal])
  })
}
