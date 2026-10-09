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

function defaultSessionStore(): SessionStore {
  cachedStore ??= new RedisSessionStore(getSessionConfig())
  return cachedStore
}
