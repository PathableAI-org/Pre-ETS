import "server-only"

import { selectTenantMode } from "./mode.ts"
import {
  type ApplicationRuntime,
  fail,
  type HostSuffix,
  type ModeDiagnostic,
  type ModeSelection,
  ok,
  parseTenantRecord,
  type TenantFailureReason,
  type TenantMode,
  type TenantRecord,
  type TenantResult
} from "./model.ts"
import { createStaticTenantSource, type TenantSource } from "./source.ts"

export interface TenantProcessEnv {
  readonly NODE_ENV?: string
  readonly TENANT_CONFIG_RECORDS_JSON?: string
  readonly TENANT_LOCAL_CONFIG_JSON?: string
  readonly TENANT_RESOLUTION?: string
}

export interface TenantSettings {
  readonly hostSuffix: HostSuffix
  readonly localRecord?: TenantRecord
  readonly mode: TenantMode
  readonly runtime: ApplicationRuntime
  readonly source: TenantSource
}

export type TenantSettingsLoad =
  | {
    readonly mode: TenantMode
    readonly ok: false
    readonly reason: TenantFailureReason
    readonly runtime: ApplicationRuntime
  }
  | {
    readonly ok: true
    readonly value: TenantSettings
  }

export type WarningSink = (diagnostic: ModeDiagnostic) => void

let processSettings: TenantSettingsLoad | undefined

export function getProcessTenantSettings(): TenantSettingsLoad {
  processSettings ??= loadTenantSettings(process.env, defaultWarningSink)
  return processSettings
}

export function loadTenantSettings(
  env: TenantProcessEnv,
  warn: WarningSink = defaultWarningSink
): TenantSettingsLoad {
  const runtime = runtimeFromNodeEnv(env.NODE_ENV)
  const selection = selectTenantMode(env.TENANT_RESOLUTION, runtime)
  emitModeWarning(selection, warn)
  const hostSuffix: HostSuffix = runtime === "production" ? "pathable.com" : "localhost"
  if (selection.mode === "static") {
    return loadStaticSettings(env, hostSuffix, runtime)
  }

  return loadHostSettings(env, hostSuffix, runtime, selection.mode)
}

function defaultWarningSink(diagnostic: ModeDiagnostic): void {
  console.error(JSON.stringify(diagnostic))
}

function emitModeWarning(selection: ModeSelection, warn: WarningSink): void {
  if (!("diagnostic" in selection)) {
    return
  }

  try {
    warn(selection.diagnostic)
  } catch {
    // Logging failure must not change tenant selection.
  }
}

function failedSettings(
  mode: TenantMode,
  runtime: ApplicationRuntime,
  reason: TenantFailureReason
): TenantSettingsLoad {
  return { mode, ok: false, reason, runtime }
}

function loadHostSettings(
  env: TenantProcessEnv,
  hostSuffix: HostSuffix,
  runtime: ApplicationRuntime,
  mode: TenantMode
): TenantSettingsLoad {
  const parsedRecords = parseJsonValue(env.TENANT_CONFIG_RECORDS_JSON ?? "[]")
  if (!parsedRecords.ok) {
    return failedSettings(mode, runtime, parsedRecords.reason)
  }

  const source = createStaticTenantSource(parsedRecords.value)
  if (!source.ok) {
    return failedSettings(mode, runtime, source.reason)
  }

  return {
    ok: true,
    value: {
      hostSuffix,
      mode,
      runtime,
      source: source.value
    }
  }
}

function loadStaticSettings(
  env: TenantProcessEnv,
  hostSuffix: HostSuffix,
  runtime: ApplicationRuntime
): TenantSettingsLoad {
  const mode = "static" as const
  if (env.TENANT_LOCAL_CONFIG_JSON === undefined || env.TENANT_LOCAL_CONFIG_JSON === "") {
    return failedSettings(mode, runtime, "invalid-config")
  }

  const parsed = parseJsonValue(env.TENANT_LOCAL_CONFIG_JSON)
  if (!parsed.ok) {
    return failedSettings(mode, runtime, parsed.reason)
  }

  const record = parseTenantRecord(parsed.value)
  if (!record.ok) {
    return failedSettings(mode, runtime, record.reason)
  }

  const source = createStaticTenantSource([record.value])
  if (!source.ok) {
    return failedSettings(mode, runtime, source.reason)
  }

  return {
    ok: true,
    value: {
      hostSuffix,
      localRecord: record.value,
      mode,
      runtime,
      source: source.value
    }
  }
}

function parseJsonValue(raw: string): TenantResult<unknown> {
  try {
    return ok(JSON.parse(raw) as unknown)
  } catch {
    return fail("invalid-settings")
  }
}

function runtimeFromNodeEnv(nodeEnv: string | undefined): ApplicationRuntime {
  return nodeEnv === "development" ? "development" : "production"
}
