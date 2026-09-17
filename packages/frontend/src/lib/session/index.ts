import "server-only"
import { headers } from "next/headers"

import type { TenantConfig } from "../tenant/types.ts"

import { getCurrentTenantConfig } from "../tenant/index.ts"
import { assertGuardedSession } from "./guard.ts"
import { RedisSessionStore, type SessionStore } from "./store.ts"
import { getSessionConfig, parseSessionContextJson, SESSION_CONTEXT_HEADER, type SessionContext } from "./types.ts"

export interface GetRequestSessionDependencies {
  readonly createStore?: () => SessionStore
  readonly nowSeconds?: () => number
  readonly store?: SessionStore
}

export interface RequestSession {
  readonly context: SessionContext
  readonly tenantConfig: TenantConfig
}

let cachedStore: SessionStore | undefined

/**
 * Server-only session accessor. When forwarded context carries `userId`, re-reads Redis
 * via {@link assertGuardedSession} — does not trust the Proxy header alone.
 */
// fallow-ignore-next-line complexity -- request accessor: parse header + guard + tenant load
export async function getRequestSession(
  deps: GetRequestSessionDependencies = {}
): Promise<RequestSession> {
  const headerStore = await headers()
  const raw = headerStore.get(SESSION_CONTEXT_HEADER)
  if (raw === null || raw === "") {
    throw new Error("Session context is required.")
  }

  const context = parseSessionContextJson(raw)
  if (context === undefined) {
    throw new Error("Session context is invalid.")
  }

  const store = deps.store ?? deps.createStore?.() ?? defaultSessionStore()
  const guardDeps = deps.nowSeconds === undefined
    ? { store }
    : { nowSeconds: deps.nowSeconds, store }
  const guarded = await assertGuardedSession(context, guardDeps)

  const tenantConfig = await getCurrentTenantConfig(guarded.tenantId)
  return { context: guarded, tenantConfig }
}

export { recordQualifyingActivity } from "./activity.ts"
export type {
  RecordQualifyingActivityDenyReason,
  RecordQualifyingActivityDependencies,
  RecordQualifyingActivityInput,
  RecordQualifyingActivityResult
} from "./activity.ts"
export { confirmSessionAccess } from "./confirm.ts"
export type {
  ConfirmSessionAccessDependencies,
  ConfirmSessionAccessInput,
  ConfirmSessionAccessResult
} from "./confirm.ts"
export { assertGuardedSession, guardAuthenticatedAccess } from "./guard.ts"
export type {
  GuardAuthenticatedAccessDependencies,
  GuardAuthenticatedAccessInput,
  GuardAuthenticatedAccessResult,
  GuardDenyReason
} from "./guard.ts"
export {
  INACTIVITY_BROADCAST_CHANNEL,
  INACTIVITY_CONFIRMED_TYPE,
  inactivityConfirmedMessage,
  isInactivityConfirmedMessage
} from "./inactivity-channel.ts"
export type { InactivityConfirmedMessage } from "./inactivity-channel.ts"
export { loginAgain } from "./login-again.ts"
export type { LoginAgainDependencies, LoginAgainInput, LoginAgainResult } from "./login-again.ts"
export { setupSession } from "./setup.ts"
export type { SetupSessionResult } from "./setup.ts"
export {
  SESSION_CONTEXT_HEADER,
  SESSION_COOKIE_NAME,
  SESSION_END_GENERATION_HEADER,
  type SessionContext,
  type SessionOutcomeClass,
  TENANT_ORIGIN_HEADER,
  TENANT_SLUG_HEADER
} from "./types.ts"

function defaultSessionStore(): SessionStore {
  cachedStore ??= new RedisSessionStore(getSessionConfig())
  return cachedStore
}
