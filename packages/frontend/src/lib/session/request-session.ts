import { redirect, unauthorized } from "next/navigation"

import type { TenantConfig } from "../tenant/types.ts"
import type { SessionStore } from "./store.ts"

import { getCurrentTenantConfig } from "../tenant/index.ts"
import { guardAuthenticatedAccess, type GuardAuthenticatedAccessDependencies } from "./guard.ts"
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
 * Authenticated header that fails Redis re-validation fail-closes via auth interrupts
 * (not an opaque Error) so a stale cookie cannot crash SSR.
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

  if (context.userId === undefined) {
    const tenantConfig = await getCurrentTenantConfig(context.tenantId)
    return { context, tenantConfig }
  }

  const result = await guardAuthenticatedAccess(
    {
      sessionId: context.sessionId,
      tenantId: context.tenantId
    },
    guardDeps
  )

  if (result.kind !== "allow") {
    // Stale/mismatched cookie: Proxy forwarded userId but Redis no longer grants access.
    // Document re-entry goes through Proxy → fresh anonymous sid + OIDC (login), not a
    // Modal shell. Open tabs will use confirm + Modal in a later PR.
    if (result.inactivity) {
      redirect("/")
    }
    unauthorized()
  }

  const tenantConfig = await getCurrentTenantConfig(result.context.tenantId)
  return { context: result.context, tenantConfig }
}
