import { type Attributes, type Context, context, ROOT_CONTEXT, trace } from "@opentelemetry/api"

/**
 * One harness fact: a contract span name, closed-set attributes, and its start time in `performance.now()`
 * milliseconds. A root fact never has a parent.
 */
export interface Fact {
  readonly attributes: Attributes
  readonly name: string
  readonly root: boolean
  readonly startTime: number
}

/** Runs `task` synchronously with a record's span as the active context and returns its result. */
export type FactScope = <A>(task: () => A) => A

const tracer = () => trace.getTracer("@pathableai/pre-ets-frontend")

/** Records `fact` as a zero-duration span under `parent` and answers the scope that makes it the parent. */
const recordUnder = (fact: Fact, parent: Context): FactScope => {
  const span = tracer().startSpan(fact.name, { attributes: fact.attributes, startTime: fact.startTime }, parent)
  span.end(fact.startTime)
  const scoped = trace.setSpan(context.active(), span)
  return (task) => context.with(scoped, task)
}

/** Records `fact` under the active context, or as a root when it is a root fact (T-004–T-007, T-009, T-010). */
export const recordFact = (fact: Fact): FactScope => recordUnder(fact, fact.root ? ROOT_CONTEXT : context.active())

/**
 * Replays facts buffered before the SDK registered as root spans with their original start times, then one
 * `BrowserTracing.buffer` record when facts were dropped (plan PL-1, T-011).
 */
export function replayFacts(facts: readonly Fact[], dropped: number): void {
  for (const fact of facts) recordUnder(fact, ROOT_CONTEXT)
  if (dropped === 0) return
  recordUnder({
    attributes: { "preets.outcome": "overflowed", "preets.tracing.dropped_count": dropped },
    name: "BrowserTracing.buffer",
    root: true,
    startTime: performance.now()
  }, ROOT_CONTEXT)
}
