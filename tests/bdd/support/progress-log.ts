import type { CoordinatorEventValues, Plugin } from "@cucumber/cucumber/api"
import type { Writable } from "node:stream"

import { Status } from "@cucumber/cucumber"
import os from "node:os"
import path from "node:path"

/**
 * A Cucumber plugin that writes the run's progress to stderr while it happens: each scenario's start, each step it
 * enters, and its result, plus a periodic heartbeat naming the scenarios still running, their current step, and the
 * machine's load. The `summary` formatter on stdout only reports at the end, which leaves a long, mostly waiting run
 * silent. It changes no evidence; the nightly workflow loads it with `--plugin`.
 */

type Envelope = CoordinatorEventValues["message"]
type Pickle = NonNullable<Envelope["pickle"]>
interface ProgressState {
  readonly failed: string[]
  finished: number
  readonly pickles: Map<string, { readonly label: string; readonly steps: ReadonlyMap<string, string> }>
  readonly running: Map<string, Running>
  readonly runStartedAt: number
  readonly stderr: Writable
  readonly testCases: Map<string, TestCase>
}
interface Running {
  readonly startedAt: number
  step: string
  readonly testCase: TestCase
}

interface TestCase {
  readonly label: string
  /** Each test step's Gherkin text, by test step ID; hooks have none. */
  readonly steps: ReadonlyMap<string, string>
}

type TestStep = NonNullable<Envelope["testCase"]>["testSteps"][number]

type TestStepResult = NonNullable<Envelope["testStepFinished"]>["testStepResult"]

const HEARTBEAT_MS = 120_000
const NAME_LENGTH = 70
const QUIET: ReadonlySet<string> = new Set([Status.PASSED, Status.SKIPPED])
const FAILING: ReadonlySet<string> = new Set([Status.AMBIGUOUS, Status.FAILED, Status.UNDEFINED])

const truncate = (text: string, length: number): string =>
  text.length <= length ? text : `${text.slice(0, length - 1)}…`

const pad = (value: number) => String(value).padStart(2, "0")

const duration = (milliseconds: number): string => {
  const seconds = Math.round(milliseconds / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const rest = `${pad(minutes % 60)}m${pad(seconds % 60)}s`
  return hours > 0 ? `${String(hours)}h${rest}` : rest
}

const machineLoad = (): string => {
  const [oneMinute = 0] = os.loadavg()
  const freeGiB = (os.freemem() / 1024 ** 3).toFixed(1)
  return `load ${oneMinute.toFixed(2)} on ${String(os.availableParallelism())} CPUs, ${freeGiB} GiB free`
}

/** The first non-blank line of a failed step's message, indented on its own line, or nothing. */
const indentedFirstLine = (text: string): string => {
  const line = text.split("\n").find((candidate) => candidate.trim() !== "")
  return line === undefined ? "" : `\n    ${line}`
}

const failureReason = (result: TestStepResult): string =>
  indentedFirstLine(result.exception?.message ?? result.message ?? "")

const progress = (state: ProgressState): string => `${String(state.finished)}/${String(state.testCases.size)}`

const log = (state: ProgressState, message: string) => {
  state.stderr.write(`[+${duration(Date.now() - state.runStartedAt)}] ${message}\n`)
}

const heartbeat = (state: ProgressState) => {
  if (state.running.size === 0) return
  log(state, `heartbeat: ${String(state.running.size)} running, ${progress(state)} done, ${machineLoad()}`)
  for (const scenario of state.running.values()) {
    log(state, `  ${scenario.testCase.label} for ${duration(Date.now() - scenario.startedAt)}, at: ${scenario.step}`)
  }
}

const recordPickle = (state: ProgressState, pickle: Pickle) => {
  const label = `${path.basename(pickle.uri, ".feature")} › ${truncate(pickle.name, NAME_LENGTH)}`
  state.pickles.set(pickle.id, { label, steps: new Map(pickle.steps.map((step) => [step.id, step.text])) })
}

const stepText = (pickleSteps: ReadonlyMap<string, string>, step: TestStep): string | undefined =>
  step.pickleStepId === undefined ? undefined : pickleSteps.get(step.pickleStepId)

const recordTestCase = (state: ProgressState, testCase: NonNullable<Envelope["testCase"]>) => {
  const pickle = state.pickles.get(testCase.pickleId)
  if (pickle === undefined) return
  const steps = new Map<string, string>()
  for (const step of testCase.testSteps) {
    const text = stepText(pickle.steps, step)
    if (text !== undefined) steps.set(step.id, text)
  }
  state.testCases.set(testCase.id, { label: pickle.label, steps })
}

const startCase = (state: ProgressState, event: NonNullable<Envelope["testCaseStarted"]>) => {
  const testCase = state.testCases.get(event.testCaseId)
  if (testCase === undefined) return
  state.running.set(event.id, { startedAt: Date.now(), step: "before hooks", testCase })
  log(state, `start  ${testCase.label} on worker ${event.workerId ?? "main"} (${String(state.running.size)} running)`)
}

const enterStep = (state: ProgressState, event: NonNullable<Envelope["testStepStarted"]>) => {
  const scenario = state.running.get(event.testCaseStartedId)
  const text = scenario?.testCase.steps.get(event.testStepId)
  if (scenario === undefined || text === undefined) return
  scenario.step = text
  log(state, `  step ${scenario.testCase.label}: ${text}`)
}

const finishStep = (state: ProgressState, event: NonNullable<Envelope["testStepFinished"]>) => {
  const { status } = event.testStepResult
  const scenario = state.running.get(event.testCaseStartedId)
  if (QUIET.has(status) || scenario === undefined) return
  if (FAILING.has(status)) state.failed.push(scenario.testCase.label)
  log(state, `${status} ${scenario.testCase.label} at: ${scenario.step}${failureReason(event.testStepResult)}`)
}

const finishCase = (state: ProgressState, event: NonNullable<Envelope["testCaseFinished"]>) => {
  const scenario = state.running.get(event.testCaseStartedId)
  state.running.delete(event.testCaseStartedId)
  if (scenario === undefined || event.willBeRetried) return
  state.finished++
  log(state, `done   ${scenario.testCase.label} in ${duration(Date.now() - scenario.startedAt)} (${progress(state)})`)
}

const finishRun = (state: ProgressState, event: NonNullable<Envelope["testRunFinished"]>) => {
  const failures = state.failed.length === 0 ? "no failures" : `failed:\n  ${state.failed.join("\n  ")}`
  log(state, `run finished (success: ${String(event.success)}) after ${String(state.finished)} scenarios, ${failures}`)
}

const recordDefinitions = (state: ProgressState, envelope: Envelope) => {
  if (envelope.pickle) recordPickle(state, envelope.pickle)
  if (envelope.testCase) recordTestCase(state, envelope.testCase)
}

const reportSteps = (state: ProgressState, envelope: Envelope) => {
  if (envelope.testStepStarted) enterStep(state, envelope.testStepStarted)
  if (envelope.testStepFinished) finishStep(state, envelope.testStepFinished)
}

const reportCases = (state: ProgressState, envelope: Envelope) => {
  if (envelope.testCaseStarted) startCase(state, envelope.testCaseStarted)
  if (envelope.testCaseFinished) finishCase(state, envelope.testCaseFinished)
  if (envelope.testRunFinished) finishRun(state, envelope.testRunFinished)
}

const progressLog: Plugin = {
  coordinator({ environment, on, operation }) {
    if (operation !== "runCucumber") return
    const state: ProgressState = {
      failed: [],
      finished: 0,
      pickles: new Map(),
      running: new Map(),
      runStartedAt: Date.now(),
      stderr: environment.stderr,
      testCases: new Map()
    }
    const timer = setInterval(() => {
      heartbeat(state)
    }, HEARTBEAT_MS)
    timer.unref()
    on("message", (envelope) => {
      recordDefinitions(state, envelope)
      reportCases(state, envelope)
      reportSteps(state, envelope)
    })
    return () => {
      clearInterval(timer)
    }
  },
  type: "plugin"
}

export default progressLog
