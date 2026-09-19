import type { InitiateLoginDeps, InitiateLoginOutcome } from "../oidc/initiate.ts"
import type { TenantRecord } from "../tenant/types.ts"

import { initiateLogin } from "../oidc/initiate.ts"
import { signSessionCookie, verifySessionCookie } from "./cookie.ts"
import { type SessionStore, SessionStoreError } from "./store.ts"
import {
  absoluteExpirySeconds,
  generateSessionId,
  getSessionConfig,
  type SessionConfig,
  type SessionRecord
} from "./types.ts"

export interface LoginAgainDependencies {
  readonly config?: SessionConfig
  readonly createId?: () => string
  readonly initiate?: typeof initiateLogin
  readonly initiateDeps: InitiateLoginDeps
  readonly signCookie?: typeof signSessionCookie
  readonly store: SessionStore
  readonly verifyCookie?: typeof verifySessionCookie
}

export interface LoginAgainInput {
  readonly cookieValue: string | undefined
  readonly nowSeconds: number
  readonly origin: string
  readonly tenantId: string
  readonly tenantRecord: TenantRecord
}

export type LoginAgainResult =
  | {
    readonly expiresAt: number
    readonly kind: "redirect"
    readonly location: string
    readonly oidcCookieValue: string
    readonly sessionCookieValue: string
    readonly sessionExpiresAt: number
    readonly sessionId: string
  }
  | {
    readonly kind: "config-refusal"
  }
  | {
    readonly kind: "login-unavailable"
  }
  | {
    readonly kind: "process-config"
  }
  | {
    readonly kind: "unavailable"
  }

interface LoginAgainPrepared {
  readonly config: SessionConfig
  readonly kind: "ready"
  readonly sessionExpiresAt: number
}

/**
 * Rotate a new anonymous session id + cookie, leave the old Redis tombstone intact,
 * then start OIDC initiation targeting only the new sid.
 */
export async function loginAgain(
  input: LoginAgainInput,
  deps: LoginAgainDependencies
): Promise<LoginAgainResult> {
  if (input.cookieValue === undefined || input.cookieValue === "") {
    return { kind: "unavailable" }
  }

  const prepared = await prepareLoginAgain(
    { ...input, cookieValue: input.cookieValue },
    deps
  )
  if (prepared.kind !== "ready") {
    return prepared
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await rotateAndInitiate(input, deps, prepared)
    if (result !== "retry") {
      return result
    }
  }

  return { kind: "unavailable" }
}

/** Map OIDC initiation outcome onto login-again result (exported for unit coverage). */
export function mapInitiationToLoginAgain(
  initiation: InitiateLoginOutcome,
  sessionCookieValue: string,
  sessionExpiresAt: number,
  sessionId: string
): LoginAgainResult {
  if (initiation.kind === "redirect") {
    return {
      expiresAt: initiation.expiresAt,
      kind: "redirect",
      location: initiation.location,
      oidcCookieValue: initiation.oidcCookieValue,
      sessionCookieValue,
      sessionExpiresAt,
      sessionId
    }
  }
  if (initiation.kind === "config-refusal") {
    return { kind: "config-refusal" }
  }
  if (initiation.kind === "process-config") {
    return { kind: "process-config" }
  }
  return { kind: "login-unavailable" }
}

async function createRotatedSession(
  store: SessionStore,
  sessionId: string,
  record: SessionRecord
): Promise<"ok" | "retry" | Extract<LoginAgainResult, { kind: "unavailable" }>> {
  try {
    const created = await store.create(sessionId, record)
    if (created.kind !== "created") {
      return "retry"
    }
    return "ok"
  } catch (error) {
    if (error instanceof SessionStoreError) {
      return { kind: "unavailable" }
    }
    throw error
  }
}

async function initiateOnRotatedSession(
  input: LoginAgainInput,
  deps: LoginAgainDependencies,
  sessionId: string,
  sessionCookieValue: string,
  sessionExpiresAt: number
): Promise<LoginAgainResult> {
  const initiate = deps.initiate ?? initiateLogin
  let initiation: InitiateLoginOutcome
  try {
    initiation = await initiate(
      {
        nowSeconds: input.nowSeconds,
        origin: input.origin,
        sessionId,
        setupOutcome: "create",
        tenantId: input.tenantId,
        tenantRecord: input.tenantRecord
      },
      deps.initiateDeps
    )
  } catch {
    return { kind: "unavailable" }
  }

  return mapInitiationToLoginAgain(initiation, sessionCookieValue, sessionExpiresAt, sessionId)
}

async function prepareLoginAgain(
  input: LoginAgainInput & { readonly cookieValue: string },
  deps: LoginAgainDependencies
): Promise<Extract<LoginAgainResult, { kind: "process-config" | "unavailable" }> | LoginAgainPrepared> {
  let config: SessionConfig
  try {
    config = deps.config ?? getSessionConfig()
  } catch {
    return { kind: "process-config" }
  }

  const verifyCookie = deps.verifyCookie ?? verifySessionCookie
  const claims = await verifyCookie(input.cookieValue, config, input.nowSeconds)
  if (claims?.tenant !== input.tenantId) {
    return { kind: "unavailable" }
  }

  // Old key is intentionally left for tombstone handoff until its expiresAt.
  let sessionExpiresAt: number
  try {
    sessionExpiresAt = absoluteExpirySeconds(input.nowSeconds, config.ttlSeconds)
  } catch {
    return { kind: "process-config" }
  }

  return { config, kind: "ready", sessionExpiresAt }
}

async function rotateAndInitiate(
  input: LoginAgainInput,
  deps: LoginAgainDependencies,
  prepared: LoginAgainPrepared
): Promise<"retry" | LoginAgainResult> {
  const createId = deps.createId ?? generateSessionId
  const signCookie = deps.signCookie ?? signSessionCookie
  const sessionId = createId()
  const record: SessionRecord = {
    expiresAt: prepared.sessionExpiresAt,
    tenantId: input.tenantId
  }

  let sessionCookieValue: string
  try {
    sessionCookieValue = await signCookie(
      {
        exp: prepared.sessionExpiresAt,
        sid: sessionId,
        tenant: input.tenantId
      },
      prepared.config
    )
  } catch {
    return { kind: "process-config" }
  }

  const created = await createRotatedSession(deps.store, sessionId, record)
  if (created === "retry") {
    return "retry"
  }
  if (created !== "ok") {
    return created
  }

  return await initiateOnRotatedSession(
    input,
    deps,
    sessionId,
    sessionCookieValue,
    prepared.sessionExpiresAt
  )
}
