/**
 * Small composable checks for JSON the agent workflow tooling stores in git notes: verification reports and code
 * reviews. A check takes an unknown value and its JSON path and returns every problem found.
 */

export type Check = (value: unknown, path: string) => readonly string[]

export type Validated<T> = { readonly ok: false; readonly problems: readonly string[] } | {
  readonly ok: true
  readonly value: T
}

export const ok: readonly string[] = []

export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Values that look like credentials or tokens. Notes name fields and code; they never carry secret values. */
const secretPatterns: readonly RegExp[] = [
  /\beyJ[\w-]{8,}\.[\w-]{8,}\./,
  /\bbearer\s+[\w.~+/-]{8,}/i,
  /\b(password|passwd|secret|token|cookie|authorization|api[_-]?key)\s*[=:]\s*\S/i
]

/** Non-empty text that does not look like it holds a credential. */
export const text: Check = (value, path) => {
  if (typeof value !== "string" || value.trim().length === 0) return [`${path}: expected non-empty text`]
  return secretPatterns.some((pattern) => pattern.test(value)) ? [`${path}: looks like it holds a credential`] : ok
}

export const matching = (pattern: RegExp, description: string): Check => (value, path) =>
  typeof value === "string" && pattern.test(value) ? ok : [`${path}: expected ${description}`]

export const oneOf = (allowed: readonly string[]): Check => (value, path) =>
  typeof value === "string" && allowed.includes(value) ? ok : [`${path}: expected one of ${allowed.join(", ")}`]

export const optional = (check: Check): Check => (value, path) => value === undefined ? ok : check(value, path)

export const list = (item: Check): Check => (value, path) =>
  Array.isArray(value) ? value.flatMap((entry, index) => item(entry, `${path}[${String(index)}]`)) : [
    `${path}: expected a list`
  ]

/** An object with exactly these fields; an unknown field is a problem. */
export const object = (fields: Readonly<Record<string, Check>>): Check => (value, path) => {
  if (!isRecord(value)) return [`${path}: expected an object`]
  const unknown = Object.keys(value).filter((key) => !(key in fields)).map((key) => `${path}.${key}: unknown field`)
  return [...unknown, ...Object.entries(fields).flatMap(([key, check]) => check(value[key], `${path}.${key}`))]
}

export const sha = matching(/^[0-9a-f]{40}$/, "a full 40-character commit SHA")
export const uuid = matching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "a UUID")
export const featureDir = matching(/^specs\/\d+-[a-z0-9-]+$/, "specs/{number}-{slug}")
export const sliceId = matching(/^[A-Za-z0-9]+$/, "a slice ID such as A1")
export const schemaVersion1: Check = (value, path) => value === 1 ? ok : [`${path}: expected 1`]
