import { Clock, Effect, Result } from "effect"
import { forbidden } from "next/navigation"

import type { TenantAlias, TenantConfigService, TenantFailure } from "../tenant.js"

import { Runtime } from "../runtime.js"
import {
  type NoUsableSession,
  SessionService,
  type SessionServiceUnavailable,
  type SessionTenantMismatch,
  type UsableSession
} from "../session.js"
import { coordinationSnapshot, type SessionCoordinationSnapshot } from "./coordination-snapshot.js"
import { resolveRequestTenant } from "./request.js"
import { tenantFailurePage } from "./tenant-failure.js"

export const SESSION_COOKIE = "pathable-session"

export type ReadSessionFailure = SessionServiceUnavailable | SessionTenantMismatch | TenantFailure

export interface ReadSessionRequestInput {
  readonly host: string
  readonly reference?: string | undefined
}

export interface ResolvedSessionRequest {
  /** Defined exactly when `session` is a `UsableSession`. */
  readonly coordination: SessionCoordinationSnapshot | undefined
  readonly session: NoUsableSession | UsableSession
  readonly tenantAlias: TenantAlias
}

const readSession = Effect.fn("readSessionRequest")(function*(
  input: ReadSessionRequestInput
): Effect.fn.Return<
  ResolvedSessionRequest,
  ReadSessionFailure,
  SessionService | TenantConfigService
> {
  const { alias: tenantAlias } = yield* resolveRequestTenant(input.host)
  const sessions = yield* SessionService
  const session = yield* sessions.readForTenant({ reference: input.reference, tenantAlias })
  const coordination = session._tag === "UsableSession" && input.reference !== undefined ?
    coordinationSnapshot(input.reference, session, yield* Clock.currentTimeMillis) :
    undefined
  return { coordination, session, tenantAlias }
})

/** Branches on `_tag`, not `instanceof`: Turbopack can evaluate a module once per chunk, so class identity varies. */
const rejectSessionRequest = (failure: ReadSessionFailure): never => {
  switch (failure._tag) {
    case "SessionServiceUnavailable":
      throw failure
    case "TenantNotFound":
    case "TenantReadError":
      return tenantFailurePage(failure)
    case "SessionTenantMismatch":
      return forbidden()
  }
}

/** Runs a session request on the shared runtime and maps its failures as a protected page or action expects. */
export const runSessionRequest = async <A>(
  effect: Effect.Effect<A, ReadSessionFailure, SessionService | TenantConfigService>
): Promise<A> => {
  const outcome = await Runtime.runPromise(effect.pipe(Effect.result))
  if (Result.isSuccess(outcome)) return outcome.success
  return rejectSessionRequest(outcome.failure)
}

export const readSessionRequest = (input: ReadSessionRequestInput): Promise<ResolvedSessionRequest> =>
  runSessionRequest(readSession(input))
