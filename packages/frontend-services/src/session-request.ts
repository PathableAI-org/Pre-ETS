import { Effect, Result } from "effect"
import { forbidden } from "next/navigation"

import { tenantFailurePage } from "./error.js"
import { parseRequestHost } from "./request-host.js"
import { Runtime } from "./runtime.js"
import {
  type NoUsableSession,
  SessionService,
  type SessionServiceUnavailable,
  type SessionTenantMismatch,
  type UsableSession
} from "./session.js"
import { type TenantAlias, TenantConfigService, type TenantFailure } from "./tenant.js"

export const SESSION_COOKIE = "pathable-session"

export interface ReadSessionRequestInput {
  readonly host: string
  readonly reference?: string | undefined
}

export interface ResolvedSessionRequest {
  readonly session: NoUsableSession | UsableSession
  readonly tenantAlias: TenantAlias
}

type ReadSessionFailure = SessionServiceUnavailable | SessionTenantMismatch | TenantFailure

const selectedAlias = (
  tenant: TenantConfigService["Service"],
  host: string
): Effect.Effect<TenantAlias, TenantFailure> => {
  const direct = tenant.getAlias(host)
  if (Result.isSuccess(direct)) return Effect.succeed(direct.success)
  const hostname = parseRequestHost(host)?.hostname
  if (hostname === undefined) return Effect.fail(direct.failure)
  const retry = tenant.getAlias(hostname)
  if (Result.isFailure(retry)) return Effect.fail(direct.failure)
  return Effect.succeed(retry.success)
}

const readSession = Effect.fn("readSessionRequest")(function*(
  input: ReadSessionRequestInput
): Effect.fn.Return<
  ResolvedSessionRequest,
  ReadSessionFailure,
  SessionService | TenantConfigService
> {
  const tenant = yield* TenantConfigService
  const tenantAlias = yield* selectedAlias(tenant, input.host)
  yield* tenant.getConfigFromAlias(tenantAlias)
  const sessions = yield* SessionService
  const session = yield* sessions.readForTenant({ reference: input.reference, tenantAlias })
  return { session, tenantAlias }
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

export const readSessionRequest = async (input: ReadSessionRequestInput): Promise<ResolvedSessionRequest> => {
  const outcome = await Runtime.runPromise(readSession(input).pipe(Effect.result))
  if (Result.isSuccess(outcome)) return outcome.success
  return rejectSessionRequest(outcome.failure)
}
