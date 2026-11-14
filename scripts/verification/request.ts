/**
 * Builds a slice's verification request from its feature artifacts at one revision. The request is derived, never
 * hand-picked: claims and telemetry rows come from the slice's `plan.md` row, sections from `quickstart.md`, and
 * approved limitations from `verification.md` and the plan.
 */
import { anchor, bullets, headings, plain, sectionBullets, type Table, tables, topLevelItems } from "./markdown.ts"

export interface ApprovedLimitation {
  readonly id: string
  readonly source: string
  readonly text: string
}

export type ClaimScope = "full" | "partial"

export interface FeatureArtifacts {
  readonly plan: string
  readonly quickstart: string
  /** Plan limitations may live in `research.md`, which the plan links. */
  readonly research?: string | undefined
  readonly verification: string
}

export interface RequestedClaim {
  readonly id: string
  readonly scope: ClaimScope
  /** The plan's qualifier for a partial claim, such as "HTTP part". */
  readonly scopeNote?: string | undefined
}

export interface RequestTarget {
  readonly featureDir: string
  readonly sha: string
  readonly sliceId: string
}

export interface SectionRef {
  readonly anchor: string
  readonly heading: string
}

export interface VerificationRequest {
  readonly approvedLimitations: readonly ApprovedLimitation[]
  readonly claims: readonly RequestedClaim[]
  readonly featureDir: string
  readonly quickstartSections: readonly SectionRef[]
  readonly schemaVersion: 1
  readonly sha: string
  readonly sliceId: string
  /** `structured` reads the ID-only slice columns; `legacy-table` reads the older prose "Claim IDs advanced" cell. */
  readonly source: "legacy-table" | "structured"
  readonly telemetryRows: readonly string[]
  /** Anything the parser could not read. A request with warnings does not pass the gate. */
  readonly warnings: readonly string[]
}

interface Parsed<T> {
  readonly value: T
  readonly warnings: readonly string[]
}

const idItemPattern = (prefix: string): RegExp =>
  new RegExp(`^(?:(partial)\\s+)?(${prefix}-\\d+)(?:\\s*[–—-]\\s*(${prefix}-\\d+))?(?:\\s*\\((.+)\\))?$`, "i")

/** Expands `V-009–V-018` into each ID, keeping the zero padding of the first. */
const expandRange = (first: string, last: string | undefined): readonly string[] => {
  if (last === undefined) return [first]
  const [prefix, from = ""] = first.split("-")
  const to = Number(last.split("-")[1])
  const ids: string[] = []
  for (let n = Number(from); n <= to; n += 1) ids.push(`${prefix ?? ""}-${String(n).padStart(from.length, "0")}`)
  return ids
}

const isNone = (cell: string): boolean => /^(none\b|—|-|n\/a\b)/i.test(plain(cell))

/** One claim item such as `V-001 (gate)`, `partial V-002`, `V-009–V-018`, or `V-006 (full)`. */
const claimItem = (item: string, defaultScope: ClaimScope): readonly RequestedClaim[] | undefined => {
  const match = idItemPattern("V").exec(item)
  if (match?.[2] === undefined) return undefined
  const note = match[4]?.trim()
  const qualified = note !== undefined && note !== "full"
  const scope: ClaimScope = defaultScope === "partial" || match[1] !== undefined || qualified ? "partial" : "full"
  const scopeNote = qualified ? note : undefined
  return expandRange(match[2], match[3]).map((id) => ({ id, scope, scopeNote }))
}

const claimsFrom = (cell: string, defaultScope: ClaimScope, label: string): Parsed<readonly RequestedClaim[]> => {
  if (isNone(cell)) return { value: [], warnings: [] }
  const items = topLevelItems(plain(cell)).map((item) => ({ claims: claimItem(item, defaultScope), item }))
  return {
    value: items.flatMap((entry) => entry.claims ?? []),
    warnings: items.flatMap((entry) =>
      entry.claims === undefined ? [`${label}: cannot read "${entry.item}" as a claim ID`] : []
    )
  }
}

const telemetryFrom = (cell: string, label: string): Parsed<readonly string[]> => {
  if (isNone(cell)) return { value: [], warnings: [] }
  const rows: string[] = []
  const warnings: string[] = []
  for (const item of topLevelItems(plain(cell))) {
    const match = idItemPattern("T").exec(item)
    if (match?.[2] === undefined || match[1] !== undefined) warnings.push(`${label}: cannot read "${item}" as a row ID`)
    else rows.push(...expandRange(match[2], match[3]))
  }
  return { value: rows, warnings }
}

const column = (table: Table, name: RegExp): number => table.header.findIndex((cell) => name.test(plain(cell)))

const sliceTable = (plan: string): Table | undefined =>
  tables(plan).find((table) =>
    /^slice$/i.test(plain(table.header[0] ?? ""))
    && (column(table, /^claim ids advanced$/i) >= 0 || column(table, /^full claims$/i) >= 0)
  )

const sliceRow = (table: Table, sliceId: string): readonly string[] | undefined =>
  table.rows.find((row) => plain(row[0] ?? "").toLowerCase() === sliceId.toLowerCase())

const quickstartHeadings = (quickstart: string): readonly SectionRef[] => {
  const all = headings(quickstart)
  const results = all.findIndex((heading) => /^execution results$/i.test(heading.text))
  return (results < 0 ? all : all.slice(0, results))
    .filter((heading) => heading.level <= 3)
    .map((heading) => ({ anchor: anchor(heading.text), heading: plain(heading.text) }))
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Legacy: headings whose parenthetical names the slice, as in "§A1 — … (slice A1)", plus "(every slice)". */
const legacySections = (quickstart: string, sliceId: string): Parsed<readonly SectionRef[]> => {
  const own = new RegExp(`\\([^)]*\\bslices?\\b[^)]*\\b${escapeRegExp(sliceId)}\\b[^)]*\\)`, "i")
  const value = quickstartHeadings(quickstart).filter((section) =>
    own.test(section.heading) || /\(every slice\)/i.test(section.heading)
  )
  const named = value.some((section) => own.test(section.heading))
  return { value, warnings: named ? [] : [`Slice ${sliceId}: no quickstart heading names "(slice ${sliceId})"`] }
}

const namedSections = (quickstart: string, cell: string, label: string): Parsed<readonly SectionRef[]> => {
  const available = quickstartHeadings(quickstart)
  const value: SectionRef[] = []
  const warnings: string[] = []
  for (const item of topLevelItems(plain(cell))) {
    const found = available.find((section) => section.heading.toLowerCase().startsWith(item.toLowerCase()))
    if (found === undefined) warnings.push(`${label}: no quickstart heading starts with "${item}"`)
    else value.push(found)
  }
  return { value, warnings }
}

const explicitId = /^\*\*([A-Z]+-\d+):\*\*\s*(.*)$/

/** Limitations from `verification.md`'s limitations section. Unnumbered bullets get positional `VL-n` IDs. */
const verificationLimitations = (verification: string): readonly ApprovedLimitation[] =>
  sectionBullets(verification, /^limitations/i).map((bullet, index) => {
    const match = explicitId.exec(bullet)
    return match?.[1] !== undefined
      ? { id: match[1], source: "verification.md", text: match[2] ?? "" }
      : {
        id: `VL-${String(index + 1)}`,
        source: `verification.md (unnumbered bullet ${String(index + 1)})`,
        text: bullet
      }
  })

/** Plan limitations defined as `- **L-n:** …` in `plan.md` or `research.md`. */
const planLimitations = (document: string | undefined, source: string): readonly ApprovedLimitation[] =>
  bullets(document ?? "").flatMap((bullet) => {
    const match = /^\*\*(L-\d+):\*\*\s*(.*)$/.exec(bullet)
    return match?.[1] === undefined ? [] : [{ id: match[1], source, text: match[2] ?? "" }]
  })

interface SliceFields {
  readonly claims: Parsed<readonly RequestedClaim[]>
  readonly sections: Parsed<readonly SectionRef[]>
  readonly source: VerificationRequest["source"]
  readonly telemetry: Parsed<readonly string[]>
}

const structuredFields = (table: Table, row: readonly string[], quickstart: string, label: string): SliceFields => {
  const cell = (name: RegExp): string => row[column(table, name)] ?? "—"
  const full = claimsFrom(cell(/^full claims$/i), "full", `${label} full claims`)
  const partial = claimsFrom(cell(/^partial claims$/i), "partial", `${label} partial claims`)
  return {
    claims: { value: [...full.value, ...partial.value], warnings: [...full.warnings, ...partial.warnings] },
    sections: namedSections(quickstart, cell(/^quickstart sections$/i), `${label} quickstart sections`),
    source: "structured",
    telemetry: telemetryFrom(cell(/^telemetry rows$/i), `${label} telemetry rows`)
  }
}

const legacyFields = (table: Table, row: readonly string[], quickstart: string, label: string, sliceId: string) => {
  const cell = (name: RegExp): string => row[column(table, name)] ?? "—"
  return {
    claims: claimsFrom(cell(/^claim ids advanced$/i), "full", `${label} claims`),
    sections: legacySections(quickstart, sliceId),
    source: "legacy-table",
    telemetry: telemetryFrom(cell(/^telemetry rows$/i), `${label} telemetry rows`)
  } satisfies SliceFields
}

const sliceFields = (plan: string, quickstart: string, sliceId: string): SliceFields | string => {
  const table = sliceTable(plan)
  if (table === undefined) return "plan.md has no implementation-slice table"
  const row = sliceRow(table, sliceId)
  if (row === undefined) return `plan.md has no slice "${sliceId}"`
  const label = `Slice ${sliceId}`
  return column(table, /^full claims$/i) >= 0
    ? structuredFields(table, row, quickstart, label)
    : legacyFields(table, row, quickstart, label, sliceId)
}

const empty: SliceFields = {
  claims: { value: [], warnings: [] },
  sections: { value: [], warnings: [] },
  source: "legacy-table",
  telemetry: { value: [], warnings: [] }
}

/** The request for one slice. It never throws on content; anything unreadable is a warning. */
export const buildRequest = (artifacts: FeatureArtifacts, target: RequestTarget): VerificationRequest => {
  const fields = sliceFields(artifacts.plan, artifacts.quickstart, target.sliceId)
  const found = typeof fields === "string" ? empty : fields
  const claimWarnings = found.claims.value.length === 0 ? [`Slice ${target.sliceId} advances no claim`] : []
  return {
    approvedLimitations: [
      ...verificationLimitations(artifacts.verification),
      ...planLimitations(artifacts.plan, "plan.md"),
      ...planLimitations(artifacts.research, "research.md")
    ],
    claims: found.claims.value,
    featureDir: target.featureDir,
    quickstartSections: found.sections.value,
    schemaVersion: 1,
    sha: target.sha,
    sliceId: target.sliceId,
    source: found.source,
    telemetryRows: found.telemetry.value,
    warnings: [
      ...(typeof fields === "string" ? [fields] : claimWarnings),
      ...found.claims.warnings,
      ...found.telemetry.warnings,
      ...found.sections.warnings
    ]
  }
}
