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

/**
 * Rotate a new anonymous session id + cookie, leave the old Redis tombstone intact,
 * then start OIDC initiation targeting only the new sid.
 */
// fallow-ignore-next-line complexity -- rotate + create retry + initiate outcome mapping
export async function loginAgain(
  input: LoginAgainInput,
  deps: LoginAgainDependencies
): Promise<LoginAgainResult> {
  if (input.cookieValue === undefined || input.cookieValue === "") {
    return { kind: "unavailable" }
  }

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

  const createId = deps.createId ?? generateSessionId
  const signCookie = deps.signCookie ?? signSessionCookie

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const sessionId = createId()
    const record: SessionRecord = {
      expiresAt: sessionExpiresAt,
      tenantId: input.tenantId
    }

    let sessionCookieValue: string
    try {
      sessionCookieValue = await signCookie(
        {
          exp: sessionExpiresAt,
          sid: sessionId,
          tenant: input.tenantId
        },
        config
      )
    } catch {
      return { kind: "process-config" }
    }

    try {
      const created = await deps.store.create(sessionId, record)
      if (created.kind !== "created") {
        continue
      }
    } catch (error) {
      if (error instanceof SessionStoreError) {
        return { kind: "unavailable" }
      }
      throw error
    }

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

  return { kind: "unavailable" }
}
