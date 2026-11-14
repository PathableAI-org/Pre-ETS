import type { ClaimReport, VerificationReport } from "./report.ts"
import type { VerificationRequest } from "./request.ts"

/**
 * The verification gate from docs/engineering/verification-harness.md#gate-and-escalation, applied to a report and
 * the request regenerated at the report's verified SHA.
 */
import { withoutSection } from "./markdown.ts"

export interface ImplementationBranch {
  readonly featureDir: string
  /** The `-impl-<slice>` suffix, or undefined for the first slice's `-impl` branch. */
  readonly sliceSuffix?: string | undefined
}

/** `{number}-{slug}-impl` or `{number}-{slug}-impl-<slice>`; anything else is not an implementation slice. */
export const implementationBranch = (branch: string | undefined): ImplementationBranch | undefined => {
  const match = /^(\d+-[a-z0-9-]+?)-impl(?:-([a-z0-9]+))?$/i.exec(branch ?? "")
  return match?.[1] === undefined ? undefined : { featureDir: `specs/${match[1]}`, sliceSuffix: match[2] }
}

const sliceMatchesBranch = (report: VerificationReport, branch: ImplementationBranch): readonly string[] => {
  if (report.featureDir !== branch.featureDir) {
    return [`the report is for ${report.featureDir}, but this branch belongs to ${branch.featureDir}`]
  }
  const expected = branch.sliceSuffix
  return expected !== undefined && expected.toLowerCase() !== report.sliceId.toLowerCase()
    ? [`the report is for slice ${report.sliceId}, but this branch is slice ${expected}`]
    : []
}

const claimFindings = (claim: ClaimReport, request: VerificationRequest): readonly string[] => {
  if (claim.result === "violated") return [`${claim.id} is violated`]
  if (claim.result === "established") return []
  // A limitation can excuse only a claim the slice asserts in part; a full claim must be established.
  if (claim.scope === "full") return [`${claim.id} is asserted in full but ${claim.result}`]
  const approved = request.approvedLimitations.some((limitation) => limitation.id === claim.limitationId)
  return approved
    ? []
    : [`${claim.id} is ${claim.result} under ${claim.limitationId ?? "no limitation"}, which is not approved`]
}

/** Each requested ID's reported entry, or a finding when the report has none. */
const eachRequested = <T extends { readonly id: string }>(
  ids: readonly string[],
  reported: readonly T[],
  missing: (id: string) => string,
  check: (entry: T) => readonly string[]
): readonly string[] =>
  ids.flatMap((id) => {
    const entry = reported.find((candidate) => candidate.id === id)
    return entry === undefined ? [missing(id)] : check(entry)
  })

const claimsCoverRequest = (report: VerificationReport, request: VerificationRequest): readonly string[] =>
  eachRequested(request.claims.map((claim) => claim.id), report.claims, (id) => `${id} has no result`, (reported) => {
    const scope = request.claims.find((claim) => claim.id === reported.id)?.scope
    return reported.scope === scope
      ? claimFindings(reported, request)
      : [`${reported.id} is reported as ${reported.scope} but the plan assigns it ${scope ?? "nothing"}`]
  })

const unrequestedClaims = (report: VerificationReport, request: VerificationRequest): readonly string[] =>
  report.claims
    .filter((claim) => !request.claims.some((requested) => requested.id === claim.id))
    .map((claim) => `${claim.id} is reported but not assigned to slice ${request.sliceId}`)

const telemetryFindings = (report: VerificationReport, request: VerificationRequest): readonly string[] =>
  eachRequested(
    request.telemetryRows,
    report.telemetryRows,
    (id) => `telemetry row ${id} has no status`,
    (row) => row.status === "present" ? [] : [`telemetry row ${row.id} is ${row.status}`]
  )

/** Every reason the report fails the gate for the request. An empty list passes. */
const evaluateGate = (report: VerificationReport, request: VerificationRequest): readonly string[] => [
  ...request.warnings.map((warning) => `the request cannot be generated reliably: ${warning}`),
  ...(report.verifiedSha === request.sha ? [] : [`the report covers ${report.verifiedSha}, not ${request.sha}`]),
  ...(report.sliceId.toLowerCase() === request.sliceId.toLowerCase()
    ? []
    : [`the report is for slice ${report.sliceId}`]),
  ...claimsCoverRequest(report, request),
  ...unrequestedClaims(report, request),
  ...telemetryFindings(report, request),
  ...report.unrequestedViolations.map((claim) => `${claim.id} was observed violated outside the request`),
  ...report.forbiddenData.map((finding) => `forbidden data in ${finding.signal} field ${finding.field}`),
  ...report.escalations.map((escalation) => `open escalation (${escalation.kind}): ${escalation.detail}`)
]

export const gateForBranch = (
  report: VerificationReport,
  request: VerificationRequest,
  branch: ImplementationBranch
): readonly string[] => [...sliceMatchesBranch(report, branch), ...evaluateGate(report, request)]

const executionResults = /^execution results$/i

/**
 * Whether the commits from the verified SHA to HEAD are evidence-only: they change nothing but the feature's
 * `quickstart.md` execution results.
 */
export const evidenceOnlyFindings = (
  featureDir: string,
  paths: readonly string[],
  quickstartAt: { readonly head: string | undefined; readonly verified: string | undefined }
): readonly string[] => {
  const quickstart = `${featureDir}/quickstart.md`
  const other = paths.filter((path) => path !== quickstart)
  if (other.length > 0) return [`commits after the verified SHA change ${other.join(", ")}`]
  if (!paths.includes(quickstart)) return []
  const outside = (content: string | undefined): string => withoutSection(content ?? "", executionResults)
  return outside(quickstartAt.verified) === outside(quickstartAt.head)
    ? []
    : [`commits after the verified SHA change ${quickstart} outside its execution results`]
}
