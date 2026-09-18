import type { TenantConfig } from "../tenant/types.ts"
import type { SessionStore } from "./store.ts"

import { getCurrentTenantConfig } from "../tenant/index.ts"
import { assertGuardedSession, type GuardAuthenticatedAccessDependencies } from "./guard.ts"
import { parseSessionContextJson, type SessionContext } from "./types.ts"

export interface RequestSession {
  readonly context: SessionContext
  readonly tenantConfig: TenantConfig
}

export interface ResolveRequestSessionDependencies {
  readonly createStore?: () => SessionStore
  readonly nowSeconds?: () => number
  readonly store?: SessionStore
}

/**
 * Parse Proxy-forwarded session context header (throws when missing/invalid).
 */
export function parseRequestSessionContext(rawHeader: null | string): SessionContext {
  if (rawHeader === null || rawHeader === "") {
    throw new Error("Session context is required.")
  }
  const context = parseSessionContextJson(rawHeader)
  if (context === undefined) {
    throw new Error("Session context is invalid.")
  }
  return context
}

/**
 * Header → guarded session resolution (store + tenant config).
 */
export async function resolveRequestSession(
  rawHeader: null | string,
  deps: ResolveRequestSessionDependencies & {
    readonly defaultStore: () => SessionStore
  }
): Promise<RequestSession> {
  const context = parseRequestSessionContext(rawHeader)
  const store = deps.store ?? deps.createStore?.() ?? deps.defaultStore()
  const guardDeps: GuardAuthenticatedAccessDependencies = deps.nowSeconds === undefined
    ? { store }
    : { nowSeconds: deps.nowSeconds, store }
  const guarded = await assertGuardedSession(context, guardDeps)
  const tenantConfig = await getCurrentTenantConfig(guarded.tenantId)
  return { context: guarded, tenantConfig }
}
