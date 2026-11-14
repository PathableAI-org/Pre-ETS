/**
 * The verification report the verifier writes to git notes. `validateReport` is the schema: it accepts unknown JSON
 * and returns either the typed report or every problem found, each with its JSON path.
 */
import type { ClaimScope } from "./request.ts"

const claimResults = ["established", "violated", "not established", "blocked"] as const
export type ClaimResult = (typeof claimResults)[number]

const telemetryStatuses = ["present", "missing", "unusable"] as const
export type TelemetryStatus = (typeof telemetryStatuses)[number]

const escalationKinds = ["specification", "plan", "disagreement", "third round"] as const

export interface ClaimReport {
  readonly conditions: string
  readonly evidence: Evidence
  readonly id: string
  /** Required for `not established` and `blocked`: an approved limitation ID from the request. */
  readonly limitationId?: string | undefined
  readonly observed: string
  readonly result: ClaimResult
  readonly scope: ClaimScope
}

export interface Escalation {
  readonly detail: string
  readonly kind: (typeof escalationKinds)[number]
}

export interface Evidence {
  /** Quickstart steps, BDD run IDs, or browser observations, for channels other than telemetry. */
  readonly procedure?: string | undefined
  /** Verifier queries, from `contracts/telemetry.md`, with the run filter. */
  readonly queries?: readonly string[] | undefined
  readonly traceIds?: readonly string[] | undefined
}

export interface ForbiddenDataFinding {
  /** The attribute, log field, or metric label name. Never its value. */
  readonly field: string
  readonly signal: string
}

export interface TelemetryRowReport {
  readonly detail?: string | undefined
  readonly id: string
  readonly status: TelemetryStatus
}

export interface VerificationReport {
  readonly claims: readonly ClaimReport[]
  readonly cleanup: { readonly complete: boolean; readonly remaining?: string | undefined }
  /** Instances, ports, services, and OTEL settings, without header values or credentials. */
  readonly environment: string
  readonly escalations: readonly Escalation[]
  readonly featureDir: string
  readonly forbiddenData: readonly ForbiddenDataFinding[]
  readonly runId: string
  readonly schemaVersion: 1
  readonly sliceId: string
  /** The run ID of the report on the same SHA that this retry replaces. */
  readonly supersedesRunId?: string | undefined
  readonly telemetryRows: readonly TelemetryRowReport[]
  readonly timeRange: { readonly end: string; readonly start: string }
  /** Claims the request did not name that the run happened to show as violated. */
  readonly unrequestedViolations: readonly ClaimReport[]
  readonly verifiedSha: string
}

type Check = (value: unknown, path: string) => readonly string[]

const ok: readonly string[] = []

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Values that look like credentials or tokens. A report names forbidden fields; it never carries values. */
const secretPatterns: readonly RegExp[] = [
  /\beyJ[\w-]{8,}\.[\w-]{8,}\./,
  /\bbearer\s+[\w.~+/-]{8,}/i,
  /\b(password|passwd|secret|token|cookie|authorization|api[_-]?key)\s*[=:]\s*\S/i
]

const text: Check = (value, path) => {
  if (typeof value !== "string" || value.trim().length === 0) return [`${path}: expected non-empty text`]
  return secretPatterns.some((pattern) => pattern.test(value)) ? [`${path}: looks like it holds a credential`] : ok
}

const matching = (pattern: RegExp, description: string): Check => (value, path) =>
  typeof value === "string" && pattern.test(value) ? ok : [`${path}: expected ${description}`]

const oneOf = (allowed: readonly string[]): Check => (value, path) =>
  typeof value === "string" && allowed.includes(value) ? ok : [`${path}: expected one of ${allowed.join(", ")}`]

const isoTime = matching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/, "an ISO 8601 time")
const sha = matching(/^[0-9a-f]{40}$/, "a full 40-character commit SHA")
const uuid = matching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "a UUID")
const claimId = matching(/^V-\d+$/, "a claim ID such as V-001")
const rowId = matching(/^T-\d+$/, "a telemetry row ID such as T-001")
const fieldName = matching(/^[\w.:@/-]{1,128}$/, "a field name without spaces, never a value")

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

const evidence: Check = (value, path) => {
  const shape = object({ procedure: optional(text), queries: optional(list(text)), traceIds: optional(list(text)) })(
    value,
    path
  )
  if (shape.length > 0 || !isRecord(value)) return shape
  const given = [value.procedure, value.queries, value.traceIds].some((entry) =>
    Array.isArray(entry) ? entry.length > 0 : entry !== undefined
  )
  return given ? ok : [`${path}: give trace IDs, queries, or the procedure`]
}

const claimShape = object({
  conditions: text,
  evidence,
  id: claimId,
  limitationId: optional(matching(/^[A-Z]+-\d+$/, "a limitation ID such as L-1")),
  observed: text,
  result: oneOf(claimResults),
  scope: oneOf(["full", "partial"])
})

const claim: Check = (value, path) => {
  const shape = claimShape(value, path)
  if (shape.length > 0 || !isRecord(value)) return shape
  const needsLimitation = value.result === "not established" || value.result === "blocked"
  return needsLimitation && value.limitationId === undefined
    ? [`${path}.limitationId: required for a ${String(value.result)} result`]
    : ok
}

const report = object({
  claims: list(claim),
  cleanup: object({
    complete: (value, path) => typeof value === "boolean" ? ok : [`${path}: expected true or false`],
    remaining: optional(text)
  }),
  environment: text,
  escalations: list(object({ detail: text, kind: oneOf(escalationKinds) })),
  featureDir: matching(/^specs\/\d+-[a-z0-9-]+$/, "specs/{number}-{slug}"),
  forbiddenData: list(object({ field: fieldName, signal: text })),
  runId: uuid,
  schemaVersion: (value, path) => value === 1 ? ok : [`${path}: expected 1`],
  sliceId: matching(/^[A-Za-z0-9]+$/, "a slice ID such as A1"),
  supersedesRunId: optional(uuid),
  telemetryRows: list(object({ detail: optional(text), id: rowId, status: oneOf(telemetryStatuses) })),
  timeRange: object({ end: isoTime, start: isoTime }),
  unrequestedViolations: list(claim),
  verifiedSha: sha
})

export type Validated<T> = { readonly ok: false; readonly problems: readonly string[] } | {
  readonly ok: true
  readonly value: T
}

export const validateReport = (value: unknown): Validated<VerificationReport> => {
  const problems = report(value, "$")
  // The checks above establish every field of VerificationReport.
  return problems.length === 0 ? { ok: true, value: value as VerificationReport } : { ok: false, problems }
}
