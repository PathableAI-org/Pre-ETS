import "server-only"
import { headers } from "next/headers"

import {
  type RequestSession,
  resolveRequestSession,
  type ResolveRequestSessionDependencies
} from "./request-session.ts"
import { RedisSessionStore, type SessionStore } from "./store.ts"
import { getSessionConfig, SESSION_CONTEXT_HEADER } from "./types.ts"

export type { RequestSession }
export type GetRequestSessionDependencies = ResolveRequestSessionDependencies

let cachedStore: SessionStore | undefined

/**
 * Server-only session accessor. When forwarded context carries `userId`, re-reads Redis
 * via guard — does not trust the Proxy header alone.
 */
export async function getRequestSession(
  deps: GetRequestSessionDependencies = {}
): Promise<RequestSession> {
  const raw = (await headers()).get(SESSION_CONTEXT_HEADER)
  return await resolveRequestSession(raw, {
    ...deps,
    defaultStore: defaultSessionStore
  })
}

export { recordQualifyingActivity } from "./activity.ts"
export type {
  RecordQualifyingActivityDenyReason,
  RecordQualifyingActivityDependencies,
  RecordQualifyingActivityInput,
  RecordQualifyingActivityResult
} from "./activity.ts"
export { confirmSessionAccess, hasConsumableInactivityLatch } from "./confirm.ts"
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
export { parseRequestSessionContext, resolveRequestSession } from "./request-session.ts"
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

function defaultSessionStore(): SessionStore {
  cachedStore ??= new RedisSessionStore(getSessionConfig())
  return cachedStore
}
