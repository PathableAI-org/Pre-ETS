import "server-only"
import { headers } from "next/headers"

import type { TenantConfig } from "../tenant/types.ts"

import { getCurrentTenantConfig } from "../tenant/index.ts"
import { parseSessionContextJson, SESSION_CONTEXT_HEADER, type SessionContext } from "./types.ts"

export interface RequestSession {
  readonly context: SessionContext
  readonly tenantConfig: TenantConfig
}

export async function getRequestSession(): Promise<RequestSession> {
  const headerStore = await headers()
  const raw = headerStore.get(SESSION_CONTEXT_HEADER)
  if (raw === null || raw === "") {
    throw new Error("Session context is required.")
  }

  const context = parseSessionContextJson(raw)
  if (context === undefined) {
    throw new Error("Session context is invalid.")
  }

  const tenantConfig = await getCurrentTenantConfig(context.tenantId)
  return { context, tenantConfig }
}

export { setupSession } from "./setup.ts"
export type { SetupSessionResult } from "./setup.ts"
export {
  SESSION_CONTEXT_HEADER,
  SESSION_COOKIE_NAME,
  type SessionContext,
  type SessionOutcomeClass,
  TENANT_ORIGIN_HEADER,
  TENANT_SLUG_HEADER
} from "./types.ts"
