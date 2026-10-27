import { Effect, Result } from "effect"
import { forbidden } from "next/navigation"

import { HttpError, httpErrorPage } from "./error.js"
import { parseRequestHost } from "./request-host.js"
import { Runtime } from "./runtime.js"
import {
  type NoUsableSession,
  SessionService,
  SessionServiceUnavailable,
  SessionTenantMismatch,
  type UsableSession
} from "./session.js"
import { type TenantAlias, TenantConfigService } from "./tenant.js"

export const SESSION_COOKIE = "pathable-session"

export interface ReadSessionRequestInput {
  readonly host: string
  readonly reference?: string
}

export interface ResolvedSessionRequest {
  readonly session: NoUsableSession | UsableSession
  readonly tenantAlias: TenantAlias
}

const selectedAlias = (
  tenant: TenantConfigService["Service"],
  host: string
): Effect.Effect<TenantAlias, HttpError> => {
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
  HttpError | SessionServiceUnavailable | SessionTenantMismatch,
  SessionService | TenantConfigService
> {
  const tenant = yield* TenantConfigService
  const tenantAlias = yield* selectedAlias(tenant, input.host)
  yield* tenant.getConfigFromAlias(tenantAlias).pipe(Effect.mapError((error): HttpError => error))
  const sessions = yield* SessionService
  const session = yield* sessions.readForTenant(
    input.reference === undefined ? { tenantAlias } : { reference: input.reference, tenantAlias }
  )
  return { session, tenantAlias }
})

const errorTag = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "_tag" in error && typeof error._tag === "string" ?
    error._tag :
    undefined

const httpStatus = (error: unknown): 404 | 500 | undefined => {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined
  return error.status === 404 || error.status === 500 ? error.status : undefined
}

const rejectSessionRequest = (error: unknown): never => {
  if (error instanceof SessionTenantMismatch || errorTag(error) === SessionTenantMismatch.tag) forbidden()
  if (error instanceof SessionServiceUnavailable || errorTag(error) === SessionServiceUnavailable.tag) {
    throw error
  }
  if (error instanceof HttpError || httpStatus(error) !== undefined) httpErrorPage(error as HttpError)
  throw error instanceof Error ? error : new Error("The session request could not be completed")
}

export const readSessionRequest = async (input: ReadSessionRequestInput): Promise<ResolvedSessionRequest> => {
  const outcome = await Runtime.runPromise(readSession(input).pipe(Effect.result))
  if (Result.isSuccess(outcome)) return outcome.success
  return rejectSessionRequest(outcome.failure)
}
