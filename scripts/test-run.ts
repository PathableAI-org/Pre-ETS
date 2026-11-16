/**
 * The environment of a test run with telemetry on, for `pnpm test:telemetry` (scripts/test-telemetry.ts). Requirements
 * BDD's owned application inherits it, and a test process that starts telemetry of its own reads `TEST_TELEMETRY` from
 * it, so the local defaults have this one owner (docs/observability.md).
 */

export type TestRun =
  | { readonly env: NodeJS.ProcessEnv; readonly runId: string; readonly telemetry: "on" }
  | { readonly env: NodeJS.ProcessEnv; readonly telemetry: "off" }

/** The values the application's off switch, `OTEL_SDK_DISABLED`, decodes as true (docs/observability.md). */
const trueLiterals: ReadonlySet<string> = new Set(["1", "on", "true", "y", "yes"])

/** The local stack's defaults, used only where a setting is absent or empty. */
const localDefaults = {
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318/",
  OTEL_SERVICE_NAME: "pre-ets-frontend",
  TELEMETRY_EXPORT_TIMING: "immediate"
} as const

const instanceKey = "service.instance.id"

/** A setting's value, with an empty one read as absent, as the application reads it. */
const supplied = (value: string | undefined): string | undefined => value === "" ? undefined : value

/** The Node SDK's limit on a resource attribute's key and value. */
const maxLength = 255

/** One entry as the Node SDK's environment detector reads it, or `undefined` for an entry it rejects. */
const attribute = (entry: string): readonly [string, string] | undefined => {
  const pair = entry.split("=")
  const [rawKey = "", rawValue = ""] = pair
  if (pair.length !== 2 || rawKey.trim() === "") return undefined
  try {
    const key = decodeURIComponent(rawKey.trim())
    const value = decodeURIComponent(rawValue.trim())
    return key.length > maxLength || value.length > maxLength ? undefined : [key, value]
  } catch {
    return undefined
  }
}

/**
 * The run identifier the Node SDK reads from the list: the last `service.instance.id` entry wins, and a list with any
 * entry it rejects contributes nothing. An empty value counts as none.
 */
const suppliedRunId = (entries: readonly string[]): string | undefined => {
  const pairs = entries.map(attribute)
  if (pairs.includes(undefined)) return undefined
  return supplied(pairs.filter((pair) => pair?.[0] === instanceKey).at(-1)?.[1])
}

/**
 * The environment a test command runs with. `telemetry` is `off`, with `env` unchanged, when `OTEL_SDK_DISABLED` holds
 * a true literal. Otherwise absent or empty settings get the local defaults and `TEST_TELEMETRY` is `true`. Existing
 * `OTEL_RESOURCE_ATTRIBUTES` entries are kept, and one `service.instance.id` entry is appended only when the list, as
 * the Node SDK reads it, has none; `runId` is that entry's value, supplied or generated. A list the SDK rejects is the
 * caller's error: the SDK then ignores it, appended entry included. The input is not mutated.
 */
export function testRunEnvironment(env: NodeJS.ProcessEnv, generateRunId: () => string): TestRun {
  if (trueLiterals.has(env.OTEL_SDK_DISABLED ?? "")) return { env, telemetry: "off" }
  const entries = (env.OTEL_RESOURCE_ATTRIBUTES ?? "").split(",").filter((entry) => entry.trim() !== "")
  const existingRunId = suppliedRunId(entries)
  const runId = existingRunId ?? generateRunId()
  const attributes = existingRunId === undefined ? [...entries, `${instanceKey}=${runId}`] : entries
  const filled = Object.fromEntries(
    Object.entries(localDefaults).map(([name, value]) => [name, supplied(env[name]) ?? value])
  )
  return {
    env: { ...env, ...filled, OTEL_RESOURCE_ATTRIBUTES: attributes.join(","), TEST_TELEMETRY: "true" },
    runId,
    telemetry: "on"
  }
}
