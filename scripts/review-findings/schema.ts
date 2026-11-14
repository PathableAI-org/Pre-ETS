/**
 * The code review the reviewer session writes to git notes. `validateReview` is the schema: it accepts unknown JSON
 * and returns either the typed review or every problem found, each with its JSON path. See
 * docs/engineering/code-review.md for what each field means.
 */

const severities = ["blocking", "advisory"] as const
const categories = [
  "correctness",
  "module-ownership",
  "duplication",
  "readability",
  "complexity",
  "test-meaningfulness",
  "contract-drift"
] as const
const confidences = ["high", "medium"] as const
const closures = ["fixed", "justified", "withdrawn"] as const
const escalationKinds = ["specification", "plan", "disagreement", "third round"] as const

/** The most findings one review may report. A longer list hides the findings that matter. */
const findingLimit = 10

/** The round from which an open blocking finding must be escalated. */
const escalationRound = 3

export interface ClosedFinding {
  readonly closure: (typeof closures)[number]
  readonly id: string
  /** The fixing SHA, the implementation session's justification, or why the reviewer withdrew it. */
  readonly note: string
}

export interface Escalation {
  readonly detail: string
  /** Finding IDs the escalation concerns. */
  readonly findingIds: readonly string[]
  readonly kind: (typeof escalationKinds)[number]
}

export interface Finding {
  readonly category: (typeof categories)[number]
  readonly confidence: (typeof confidences)[number]
  /** Concrete inputs or state, and the wrong outcome they produce. */
  readonly failureScenario: string
  /** Repository-relative path at the reviewed SHA. */
  readonly file: string
  /** A stable ID such as R-001. A finding keeps its ID across rounds until it is closed. */
  readonly id: string
  readonly line: number
  readonly severity: (typeof severities)[number]
  readonly summary: string
  /** How the reviewer confirmed the finding before reporting it: what was read, traced, or run. */
  readonly verification: string
}

export interface Review {
  /** The slice's base: the parent branch tip the diff was taken from. */
  readonly baseSha: string
  /** Findings from earlier rounds that this review closes. */
  readonly closed: readonly ClosedFinding[]
  readonly escalations: readonly Escalation[]
  readonly featureDir: string
  /** Every finding still open at the reviewed SHA, carried-forward findings included. */
  readonly findings: readonly Finding[]
  readonly reviewedSha: string
  readonly reviewId: string
  /** 1 for the first review of a slice; each re-review after a fix adds one. */
  readonly round: number
  readonly schemaVersion: 1
  readonly sliceId: string
  /** The review ID on the same SHA that this review replaces. */
  readonly supersedesReviewId?: string | undefined
}

type Check = (value: unknown, path: string) => readonly string[]

const ok: readonly string[] = []

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const text: Check = (value, path) =>
  typeof value === "string" && value.trim().length > 0 ? ok : [`${path}: expected non-empty text`]

const matching = (pattern: RegExp, description: string): Check => (value, path) =>
  typeof value === "string" && pattern.test(value) ? ok : [`${path}: expected ${description}`]

const oneOf = (allowed: readonly string[]): Check => (value, path) =>
  typeof value === "string" && allowed.includes(value) ? ok : [`${path}: expected one of ${allowed.join(", ")}`]

const positiveInteger: Check = (value, path) =>
  Number.isInteger(value) && Number(value) > 0 ? ok : [`${path}: expected a positive integer`]

const sha = matching(/^[0-9a-f]{40}$/, "a full 40-character commit SHA")
const uuid = matching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "a UUID")
const findingId = matching(/^R-\d{3,}$/, "a finding ID such as R-001")
const repoPath = matching(/^(?!\/)(?!.*(^|\/)\.\.(\/|$))[^\s]+$/, "a repository-relative path")

const optional = (check: Check): Check => (value, path) => value === undefined ? ok : check(value, path)

const list = (item: Check): Check => (value, path) =>
  Array.isArray(value) ? value.flatMap((entry, index) => item(entry, `${path}[${String(index)}]`)) : [
    `${path}: expected a list`
  ]

const object = (fields: Readonly<Record<string, Check>>): Check => (value, path) => {
  if (!isRecord(value)) return [`${path}: expected an object`]
  const unknown = Object.keys(value).filter((key) => !(key in fields)).map((key) => `${path}.${key}: unknown field`)
  return [...unknown, ...Object.entries(fields).flatMap(([key, check]) => check(value[key], `${path}.${key}`))]
}

const finding = object({
  category: oneOf(categories),
  confidence: oneOf(confidences),
  failureScenario: text,
  file: repoPath,
  id: findingId,
  line: positiveInteger,
  severity: oneOf(severities),
  summary: text,
  verification: text
})

const shape = object({
  baseSha: sha,
  closed: list(object({ closure: oneOf(closures), id: findingId, note: text })),
  escalations: list(object({ detail: text, findingIds: list(findingId), kind: oneOf(escalationKinds) })),
  featureDir: matching(/^specs\/\d+-[a-z0-9-]+$/, "specs/{number}-{slug}"),
  findings: list(finding),
  reviewedSha: sha,
  reviewId: uuid,
  round: positiveInteger,
  schemaVersion: (value, path) => value === 1 ? ok : [`${path}: expected 1`],
  sliceId: matching(/^[A-Za-z0-9]+$/, "a slice ID such as A1"),
  supersedesReviewId: optional(uuid)
})

const duplicates = (ids: readonly string[]): readonly string[] => ids.filter((id, index) => ids.indexOf(id) !== index)

/** Rules across fields, checked once the shape is valid. */
const consistency = (review: Review): readonly string[] => {
  const open = review.findings.map((entry) => entry.id)
  const closed = review.closed.map((entry) => entry.id)
  const known = new Set([...open, ...closed])
  const blocking = review.findings.filter((entry) => entry.severity === "blocking")
  return [
    ...(open.length > findingLimit ? [`$.findings: report at most ${String(findingLimit)} findings`] : []),
    ...duplicates([...open, ...closed]).map((id) => `$: ${id} appears more than once`),
    ...review.escalations.flatMap((entry, index) =>
      entry.findingIds.filter((id) => !known.has(id)).map((id) =>
        `$.escalations[${String(index)}].findingIds: ${id} is not a finding in this review`
      )
    ),
    ...(review.round >= escalationRound && blocking.length > 0
        && !review.escalations.some((entry) => entry.kind === "third round")
      ? [`$.escalations: round ${String(review.round)} with open blocking findings needs a third round escalation`]
      : []),
    ...(review.baseSha === review.reviewedSha ? ["$.baseSha: must differ from reviewedSha"] : [])
  ]
}

export type Validated<T> = { readonly ok: false; readonly problems: readonly string[] } | {
  readonly ok: true
  readonly value: T
}

export const validateReview = (value: unknown): Validated<Review> => {
  const problems = shape(value, "$")
  if (problems.length > 0) return { ok: false, problems }
  // The shape check above establishes every field of Review.
  const review = value as Review
  const rules = consistency(review)
  return rules.length === 0 ? { ok: true, value: review } : { ok: false, problems: rules }
}

/** The blocking findings still open in a review. */
export const openBlocking = (review: Review): readonly Finding[] =>
  review.findings.filter((entry) => entry.severity === "blocking")

/** Whether a review lets the slice be marked ready: no open blocking finding and no escalation. */
export const passes = (review: Review): boolean => openBlocking(review).length === 0 && review.escalations.length === 0
