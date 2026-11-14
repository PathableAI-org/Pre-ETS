/**
 * Verification handoff commands. Run through the `verify:*` package scripts:
 *
 *   pnpm verify:request --slice A1 [--feature specs/383-x] [--sha <rev>]   print the slice's request as JSON
 *   pnpm verify:record <report.json | ->                                   validate a report and add it to notes
 *   pnpm verify:show [<rev>]                                               print the latest report on a commit
 *   pnpm verify:gate                                                       check the branch against the gate
 *   pnpm verify:render [<rev>] [--write]                                   render quickstart execution results
 */
import { readFileSync, writeFileSync } from "node:fs"
import { parseArgs } from "node:util"

import {
  featureForBranch,
  generateRequest,
  notesRef,
  type Outcome,
  recordReport,
  renderResults,
  reportAt,
  runGate
} from "./verification.ts"

const cwd = process.cwd()

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    feature: { type: "string" },
    sha: { default: "HEAD", type: "string" },
    slice: { type: "string" },
    write: { default: false, type: "boolean" }
  }
})

const [command, argument] = positionals

const print = (value: unknown): void => {
  process.stdout.write(typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`)
}

const finish = <T>(outcome: Outcome<T>, onSuccess: (value: T) => void, heading: string): number => {
  if (outcome.ok) {
    onSuccess(outcome.value)
    return 0
  }
  process.stderr.write(`${heading}\n${outcome.problems.map((problem) => `  - ${problem}`).join("\n")}\n`)
  return 1
}

const request = (): number => {
  const featureDir = values.feature ?? featureForBranch(cwd)
  if (featureDir === undefined || values.slice === undefined) {
    return finish(
      { ok: false, problems: ["pass --slice, and --feature unless on an implementation branch"] },
      print,
      "Usage"
    )
  }
  return finish(generateRequest(cwd, { featureDir, revision: values.sha, sliceId: values.slice }), print, "No request")
}

const record = (): number => {
  const json = readFileSync(argument === undefined || argument === "-" ? 0 : argument, "utf8")
  return finish(recordReport(cwd, json), (report) => {
    print(
      `Recorded run ${report.runId} for slice ${report.sliceId} on ${report.verifiedSha} in ${notesRef}.\n`
        + `Pointer for the implementation session: ${notesRef} @ ${report.verifiedSha} (run ${report.runId}).\n`
    )
  }, "Report not recorded")
}

const gate = (): number =>
  finish(runGate(cwd), (pass) => {
    const via = pass.report.verifiedSha === pass.head ? "HEAD" : `${pass.report.verifiedSha} plus evidence-only commits`
    print(
      `Verification gate passed for ${pass.branch}: slice ${pass.report.sliceId}, run ${pass.report.runId}, via ${via}.\n`
    )
  }, "Verification gate failed:")

const render = (): number =>
  finish(renderResults(cwd, argument ?? "HEAD"), (value) => {
    if (!values.write) print(value.rendered)
    else if (value.updated === undefined) process.stderr.write(`${value.path} has no Execution results section\n`)
    else writeFileSync(value.path, value.updated)
  }, "Nothing rendered")

const commands: Readonly<Record<string, () => number>> = {
  gate,
  record,
  render,
  request,
  show: () =>
    finish(reportAt(cwd, argument ?? "HEAD"), (report) => {
      print(report ?? "No report on that commit.\n")
    }, "No report")
}

const run = commands[command ?? ""]
if (run === undefined) {
  process.stderr.write("Usage: verify.ts request|record|show|gate|render (see the header of scripts/verify.ts)\n")
  process.exitCode = 2
} else process.exitCode = run()
