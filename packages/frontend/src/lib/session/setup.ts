import type { TenantConfig } from "../tenant/types.ts"

import { signSessionCookie, verifySessionCookie } from "./cookie.ts"
import { classifyAccessEnd } from "./idle.ts"
import { type SessionStore, SessionStoreError } from "./store.ts"
import {
  absoluteExpirySeconds,
  generateSessionId,
  getSessionConfig,
  type SessionConfig,
  SessionConfigError,
  type SessionContext,
  sessionContextFromRecord,
  type SessionCookieClaims,
  type SessionOutcomeClass,
  type SessionRecord
} from "./types.ts"

export interface SetupSessionDependencies {
  readonly config?: SessionConfig
  readonly createId?: () => string
  readonly nowSeconds?: () => number
  readonly readCookie?: (request: Request) => string | undefined
  readonly resolveTenant: (request: Request) => Promise<TenantResolveResult>
  readonly signCookie?: (
    claims: SessionCookieClaims,
    config: SessionConfig
  ) => Promise<string>
  readonly store: SessionStore
  readonly verifyCookie?: (
    token: string,
    config: SessionConfig,
    nowSeconds: number
  ) => Promise<SessionCookieClaims | undefined>
}

export type SetupSessionResult =
  | {
    readonly config: TenantConfig
    readonly context: SessionContext
    readonly cookieValue?: string
    readonly kind: "ready"
    readonly origin: "host-associated" | "local-static"
    readonly outcome: Extract<SessionOutcomeClass, "create" | "reuse">
  }
  | {
    readonly config: TenantConfig
    readonly context: SessionContext
    readonly kind: "inactivity-recovery"
    readonly origin: "host-associated" | "local-static"
    readonly sessionEndGeneration: number
  }
  | {
    readonly kind: "terminal"
    readonly message?: string
    readonly outcome: Extract<SessionOutcomeClass, "403" | "500" | "503">
    readonly status: 403 | 500 | 503
  }

export type TenantResolveResult =
  | {
    readonly config: TenantConfig
    readonly kind: "ok"
    readonly origin: "host-associated" | "local-static"
    readonly tenantId: string
  }
  | {
    readonly kind: "config-error"
    readonly message: string
  }
  | {
    readonly kind: "unknown"
  }

interface ReuseSessionInput {
  readonly candidate: SessionCookieClaims
  readonly clock: () => number
  readonly origin: "host-associated" | "local-static"
  readonly store: SessionStore
  readonly stored: SessionRecord
  readonly tenantConfig: TenantConfig
  readonly tenantId: string
}

type ReuseSessionResult =
  | Extract<SetupSessionResult, { kind: "inactivity-recovery" | "ready" }>
  | Extract<SetupSessionResult, { kind: "terminal" }>
  | undefined

export async function setupSession(
  request: Request,
  deps: SetupSessionDependencies
): Promise<SetupSessionResult> {
  const config = resolveConfig(deps)
  if (config.kind === "terminal") {
    return config
  }

  const clock = deps.nowSeconds ?? defaultNowSeconds
  const nowSeconds = clock()
  const readCookie = deps.readCookie ?? defaultReadCookie
  const verifyCookie = deps.verifyCookie ?? verifySessionCookie
  const signCookie = deps.signCookie ?? signSessionCookie
  const createId = deps.createId ?? generateSessionId

  const loaded = await loadPresentedSession({
    config: config.value,
    nowSeconds,
    readCookie,
    request,
    store: deps.store,
    verifyCookie
  })
  if (loaded.kind !== "loaded") {
    return loaded
  }

  const tenant = await resolveTenantResult(deps, request)
  if (tenant.kind !== "ok") {
    return tenant
  }

  if (
    loaded.candidate !== undefined
    && loaded.stored !== undefined
    && structuralCookieMatches(
      loaded.candidate,
      loaded.stored,
      tenant.tenantId,
      loaded.legacyAuthenticated
    )
  ) {
    const reused = await tryReuseLoadedSession({
      candidate: loaded.candidate,
      clock,
      origin: tenant.origin,
      store: deps.store,
      stored: loaded.stored,
      tenantConfig: tenant.config,
      tenantId: tenant.tenantId
    })
    if (reused !== undefined) {
      return reused
    }
  }

  return await createFreshSession({
    config: config.value,
    createId,
    nowSeconds: clock(),
    origin: tenant.origin,
    signCookie,
    store: deps.store,
    tenantConfig: tenant.config,
    tenantId: tenant.tenantId
  })
}

export function toTenantResolveResult(
  resolved:
    | {
      readonly config: TenantConfig
      readonly kind: "ok"
      readonly origin: "host-associated" | "local-static"
      readonly tenantId: string
    }
    | {
      readonly kind: "config-error"
      readonly message: string
    }
    | {
      readonly kind: "unknown"
    }
): TenantResolveResult {
  if (resolved.kind === "ok") {
    return {
      config: resolved.config,
      kind: "ok",
      origin: resolved.origin,
      tenantId: resolved.tenantId
    }
  }

  if (resolved.kind === "config-error") {
    return {
      kind: "config-error",
      message: resolved.message
    }
  }

  return { kind: "unknown" }
}

async function clearIdleForReuseRecovery(
  input: ReuseSessionInput,
  freshNow: number
): Promise<ReuseSessionResult> {
  try {
    const cleared = await input.store.clearForInactivity(
      input.candidate.sid,
      freshNow,
      input.tenantId
    )
    if (cleared.kind !== "cleared" && cleared.kind !== "already_cleared") {
      // Clearance denied / lost race — fail closed without authenticated reuse.
      return undefined
    }
    if (cleared.record.sessionEndGeneration === undefined) {
      return undefined
    }
    return {
      config: input.tenantConfig,
      context: sessionContextFromRecord(input.candidate.sid, cleared.record),
      kind: "inactivity-recovery",
      origin: input.origin,
      sessionEndGeneration: cleared.record.sessionEndGeneration
    }
  } catch (error) {
    if (error instanceof SessionStoreError) {
      return {
        kind: "terminal",
        message: "Service unavailable.",
        outcome: "503",
        status: 503
      }
    }
    throw error
  }
}

async function createFreshSession(input: {
  readonly config: SessionConfig
  readonly createId: () => string
  readonly nowSeconds: number
  readonly origin: "host-associated" | "local-static"
  readonly signCookie: (
    claims: SessionCookieClaims,
    config: SessionConfig
  ) => Promise<string>
  readonly store: SessionStore
  readonly tenantConfig: TenantConfig
  readonly tenantId: string
}): Promise<SetupSessionResult> {
  let expiresAt: number
  try {
    expiresAt = absoluteExpirySeconds(input.nowSeconds, input.config.ttlSeconds)
  } catch {
    return { kind: "terminal", outcome: "500", status: 500 }
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const sessionId = input.createId()
    // Phase A: anonymous create only — do not write idle-shaped authenticated records.
    const record: SessionRecord = {
      expiresAt,
      tenantId: input.tenantId
    }

    let cookieValue: string
    try {
      cookieValue = await input.signCookie(
        {
          exp: expiresAt,
          sid: sessionId,
          tenant: input.tenantId
        },
        input.config
      )
    } catch {
      return { kind: "terminal", outcome: "500", status: 500 }
    }

    try {
      const created = await input.store.create(sessionId, record)
      if (created.kind === "created") {
        return {
          config: input.tenantConfig,
          context: {
            expiresAt,
            sessionId,
            tenantId: input.tenantId
          },
          cookieValue,
          kind: "ready",
          origin: input.origin,
          outcome: "create"
        }
      }
    } catch (error) {
      if (error instanceof SessionStoreError) {
        return {
          kind: "terminal",
          message: "Service unavailable.",
          outcome: "503",
          status: 503
        }
      }

      throw error
    }
  }

  return {
    kind: "terminal",
    message: "Service unavailable.",
    outcome: "503",
    status: 503
  }
}

function defaultNowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function defaultReadCookie(request: Request): string | undefined {
  const header = request.headers.get("cookie")
  if (header === null || header === "") {
    return undefined
  }

  const parts = header.split(";")
  let found: string | undefined
  for (const part of parts) {
    const trimmed = part.trim()
    const separator = trimmed.indexOf("=")
    if (separator <= 0) {
      continue
    }

    const name = trimmed.slice(0, separator)
    if (name !== "pathable-session") {
      continue
    }

    if (found !== undefined) {
      return undefined
    }

    found = trimmed.slice(separator + 1)
  }

  return found
}

async function loadPresentedSession(input: {
  readonly config: SessionConfig
  readonly nowSeconds: number
  readonly readCookie: (request: Request) => string | undefined
  readonly request: Request
  readonly store: SessionStore
  readonly verifyCookie: (
    token: string,
    config: SessionConfig,
    nowSeconds: number
  ) => Promise<SessionCookieClaims | undefined>
}): Promise<
  | SetupSessionResult
  | {
    readonly candidate: SessionCookieClaims | undefined
    readonly kind: "loaded"
    readonly legacyAuthenticated: boolean
    readonly stored: SessionRecord | undefined
  }
> {
  const rawCookie = input.readCookie(input.request)
  const candidate = rawCookie === undefined
    ? undefined
    : await input.verifyCookie(rawCookie, input.config, input.nowSeconds)

  if (candidate === undefined) {
    return {
      candidate: undefined,
      kind: "loaded",
      legacyAuthenticated: false,
      stored: undefined
    }
  }

  try {
    const readResult = await input.store.read(candidate.sid)
    if (readResult.kind !== "record") {
      return {
        candidate,
        kind: "loaded",
        legacyAuthenticated: false,
        stored: undefined
      }
    }

    return {
      candidate,
      kind: "loaded",
      legacyAuthenticated: readResult.legacyAuthenticated,
      stored: readResult.record
    }
  } catch (error) {
    if (error instanceof SessionStoreError) {
      return {
        kind: "terminal",
        message: "Service unavailable.",
        outcome: "503",
        status: 503
      }
    }

    throw error
  }
}

function resolveConfig(
  deps: SetupSessionDependencies
): Extract<SetupSessionResult, { kind: "terminal" }> | { kind: "config"; value: SessionConfig } {
  try {
    return { kind: "config", value: deps.config ?? getSessionConfig() }
  } catch (error) {
    if (error instanceof SessionConfigError) {
      return { kind: "terminal", outcome: "500", status: 500 }
    }

    throw error
  }
}

async function resolveTenantResult(
  deps: SetupSessionDependencies,
  request: Request
): Promise<Extract<TenantResolveResult, { kind: "ok" }> | SetupSessionResult> {
  let tenant: TenantResolveResult
  try {
    tenant = await deps.resolveTenant(request)
  } catch {
    return { kind: "terminal", outcome: "500", status: 500 }
  }

  if (tenant.kind === "unknown") {
    return {
      kind: "terminal",
      message: "Access denied.",
      outcome: "403",
      status: 403
    }
  }

  if (tenant.kind === "config-error") {
    return {
      kind: "terminal",
      message: tenant.message,
      outcome: "500",
      status: 500
    }
  }

  return tenant
}

/**
 * Structural cookie↔record bind. Rejects legacy four-key authenticated records so
 * callers force reauth / fresh anonymous. Absolute and idle deadlines for
 * authenticated reuse are checked separately with a fresh clock after Redis load
 * (including the equality pin when `idleExpiresAt === expiresAt`).
 */
function structuralCookieMatches(
  candidate: SessionCookieClaims,
  stored: SessionRecord,
  tenantId: string,
  legacyAuthenticated: boolean
): boolean {
  if (legacyAuthenticated) {
    return false
  }

  return candidate.tenant === tenantId
    && stored.tenantId === tenantId
    && candidate.exp === stored.expiresAt
}

function tryReuseAnonymousSession(input: ReuseSessionInput): ReuseSessionResult {
  if (input.clock() >= input.stored.expiresAt) {
    return undefined
  }

  return {
    config: input.tenantConfig,
    context: sessionContextFromRecord(input.candidate.sid, input.stored),
    kind: "ready",
    origin: input.origin,
    outcome: "reuse"
  }
}

async function tryReuseAuthenticatedSession(
  input: ReuseSessionInput
): Promise<ReuseSessionResult> {
  // Fresh clock after Redis load before authenticated success or clearance.
  const freshNow = input.clock()
  const classification = classifyAccessEnd(freshNow, input.stored)

  if (classification === "still-valid") {
    return {
      config: input.tenantConfig,
      context: sessionContextFromRecord(input.candidate.sid, input.stored),
      kind: "ready",
      origin: input.origin,
      outcome: "reuse"
    }
  }

  if (classification === "idle") {
    return await clearIdleForReuseRecovery(input, freshNow)
  }

  // Absolute-only (or missing idle shape) — no inactivity claim; force fresh.
  return undefined
}

function tryReuseInactivityLatch(input: ReuseSessionInput): ReuseSessionResult {
  const { stored } = input
  if (
    stored.userId !== undefined
    || stored.accessEndedCause !== "inactivity"
    || stored.sessionEndGeneration === undefined
  ) {
    return undefined
  }

  // Absolute cookie/record may still be live for latch retention.
  if (input.clock() >= stored.expiresAt) {
    return undefined
  }

  return {
    config: input.tenantConfig,
    context: sessionContextFromRecord(input.candidate.sid, stored),
    kind: "inactivity-recovery",
    origin: input.origin,
    sessionEndGeneration: stored.sessionEndGeneration
  }
}

/**
 * Reuse path after structural cookie match. Authenticated success samples a fresh
 * clock after Redis load. When idle binds (including equality pin), atomically clear
 * for inactivity and return the typed recovery signal. Consumable anonymous
 * inactivity evidence yields the same signal (not stuffed into SessionContext).
 */
async function tryReuseLoadedSession(input: ReuseSessionInput): Promise<ReuseSessionResult> {
  const latch = tryReuseInactivityLatch(input)
  if (latch !== undefined) {
    return latch
  }

  if (input.stored.userId !== undefined) {
    return await tryReuseAuthenticatedSession(input)
  }

  return tryReuseAnonymousSession(input)
}
