import { Clock, Effect, Option, Schema } from "effect"
import { type NextRequest, NextResponse } from "next/server"

import {
  decodeSessionReference,
  type NoUsableSession,
  SessionService,
  type SessionServiceUnavailable,
  type SessionTenantMismatch,
  type UsableSession
} from "../session.js"
import { effectiveSessionPolicy, type TenantAlias, type TenantFailure } from "../tenant.js"
import { coordinationSnapshot, isCoordinationTagOf, type SessionCoordinationSnapshot } from "./coordination-snapshot.js"
import { PRIVATE_NO_STORE, toNext } from "./handler.js"
import { resolveRequestTenant } from "./request.js"
import { runSessionRequest, SESSION_COOKIE } from "./session.js"
import { tenantFailureStatus } from "./tenant-failure.js"

/** In-page qualifying kinds a tab may communicate. Deliberate requests renew at the gate; `continue-session` is #156's. */
const InPageActivity = Schema.Literals([
  "intentional-control-activation",
  "keyboard-interaction",
  "text-entry",
  "touch-interaction",
  "user-driven-meaningful-input-focus"
])

export type InPageSessionActivity = typeof InPageActivity.Type

const SessionActivityBody = Schema.Struct({ activity: InPageActivity, coordinationTag: Schema.String })
const LogoutBody = Schema.Struct({ coordinationTag: Schema.String, notAfter: Schema.Finite })

/** `POST /auth/logout` JSON body. */
export type LogoutRequestBody = typeof LogoutBody.Type

/** `POST /session/activity` JSON body. */
export type SessionActivityRequestBody = typeof SessionActivityBody.Type

const decodeActivityBody = Schema.decodeUnknownEffect(Schema.fromJsonString(SessionActivityBody), {
  onExcessProperty: "error"
})
const decodeLogoutBody = Schema.decodeUnknownEffect(Schema.fromJsonString(LogoutBody), { onExcessProperty: "error" })

class CoordinationTagMismatch extends Schema.TaggedError<CoordinationTagMismatch>()("CoordinationTagMismatch", {}) {}
class CrossOriginRequest extends Schema.TaggedError<CrossOriginRequest>()("CrossOriginRequest", {}) {}
class LateLogoutAttempt extends Schema.TaggedError<LateLogoutAttempt>()("LateLogoutAttempt", {}) {}
class UnsupportedContentType extends Schema.TaggedError<UnsupportedContentType>()("UnsupportedContentType", {}) {}

const emptyResponse = (status: number) =>
  new NextResponse(null, { headers: { "cache-control": PRIVATE_NO_STORE }, status })

const snapshotResponse = (snapshot: SessionCoordinationSnapshot) =>
  NextResponse.json(snapshot, { headers: { "cache-control": PRIVATE_NO_STORE } })

/** Fetch Metadata decides when present; otherwise the `Origin` header must equal the request origin. */
const isSameOrigin = (request: NextRequest): boolean => {
  const site = request.headers.get("sec-fetch-site")
  if (site !== null) return site === "same-origin"
  return request.headers.get("origin") === request.nextUrl.origin
}

const isJson = (contentType: null | string): boolean =>
  contentType?.split(";")[0]?.trim().toLowerCase() === "application/json"

/** Same-origin and content type precede every session operation. */
const readJsonBody = Effect.fnUntraced(function*(request: NextRequest) {
  if (!isSameOrigin(request)) return yield* new CrossOriginRequest({})
  if (!isJson(request.headers.get("content-type"))) return yield* new UnsupportedContentType({})
  return yield* Effect.promise(() => request.text())
})

const requestTenant = (request: NextRequest) => resolveRequestTenant(request.headers.get("host") ?? "")

const requireTag = (reference: string, claimed: string) =>
  isCoordinationTagOf(reference, claimed) ? Effect.void : Effect.fail(new CoordinationTagMismatch({}))

type CoordinationFailure =
  | CoordinationTagMismatch
  | CrossOriginRequest
  | LateLogoutAttempt
  | Schema.SchemaError
  | SessionServiceUnavailable
  | SessionTenantMismatch
  | TenantFailure
  | UnsupportedContentType

const FAILURE_STATUS = {
  CoordinationTagMismatch: 409,
  CrossOriginRequest: 403,
  LateLogoutAttempt: 408,
  SchemaError: 400,
  SessionServiceUnavailable: 503,
  SessionTenantMismatch: 403,
  UnsupportedContentType: 415
} as const satisfies Record<Exclude<CoordinationFailure["_tag"], TenantFailure["_tag"]>, number>

/** Branches on `_tag`, not `instanceof`: Turbopack can evaluate a module once per chunk. */
const failureResponse = (failure: CoordinationFailure) => {
  switch (failure._tag) {
    case "TenantNotFound":
    case "TenantReadError":
      return Effect.succeed(emptyResponse(tenantFailureStatus(failure)))
    default:
      return Effect.succeed(emptyResponse(FAILURE_STATUS[failure._tag]))
  }
}

/** Every handler answers its failures with an empty, private response. */
const respondToFailures = <R>(effect: Effect.Effect<NextResponse, CoordinationFailure, R>) =>
  effect.pipe(Effect.catch(failureResponse))

/** The cookie's usable session for the request tenant, read without renewing. */
const currentSession = Effect.fnUntraced(function*(request: NextRequest) {
  const tenant = yield* requestTenant(request)
  const reference = request.cookies.get(SESSION_COOKIE)?.value
  const session = yield* (yield* SessionService).readForTenant({ reference, tenantAlias: tenant.alias })
  if (session._tag === "NoUsableSession" || reference === undefined) return Option.none()
  return Option.some({ reference, session })
})

const sessionActivity = Effect.fn("sessionActivity")(function*(request: NextRequest) {
  const body = yield* decodeActivityBody(yield* readJsonBody(request))
  const tenant = yield* requestTenant(request)
  const reference = decodeSessionReference(request.cookies.get(SESSION_COOKIE)?.value)
  if (Option.isNone(reference)) return emptyResponse(401)
  yield* requireTag(reference.value, body.coordinationTag)
  const session = yield* (yield* SessionService).refreshForTenant({
    activity: body.activity,
    policy: effectiveSessionPolicy(tenant.config),
    reference: reference.value,
    tenantAlias: tenant.alias
  })
  if (session._tag === "NoUsableSession") return emptyResponse(401)
  // No Set-Cookie: a delayed renewal must not overwrite a later session's cookie (research D15).
  return snapshotResponse(coordinationSnapshot(reference.value, session, yield* Clock.currentTimeMillis))
}, respondToFailures)

const sessionStatus = Effect.fn("sessionStatus")(function*(request: NextRequest) {
  const current = yield* currentSession(request)
  if (Option.isNone(current)) return emptyResponse(401)
  const { reference, session } = current.value
  return snapshotResponse(coordinationSnapshot(reference, session, yield* Clock.currentTimeMillis))
}, respondToFailures)

/**
 * Ends the application session only; no identity-provider logout (research F-2). Sets no cookie: a delayed response
 * must not delete a later session's cookie, and the remaining reference names a removed record (research R10).
 */
const logout = Effect.fn("logout")(function*(request: NextRequest) {
  const body = yield* decodeLogoutBody(yield* readJsonBody(request))
  // A keepalive attempt arriving after its watchers stopped must not end the session unseen (research D8, R21).
  if ((yield* Clock.currentTimeMillis) > body.notAfter) return yield* new LateLogoutAttempt({})
  const current = yield* currentSession(request)
  if (Option.isNone(current)) return emptyResponse(401)
  yield* requireTag(current.value.reference, body.coordinationTag)
  // The store enforces the cutoff atomically with the delete, so an admitted attempt cannot delete later (R27).
  const outcome = yield* (yield* SessionService).invalidate({
    notAfterEpochMilliseconds: body.notAfter,
    reference: current.value.reference
  })
  if (outcome._tag === "InvalidationExpired") return yield* new LateLogoutAttempt({})
  return emptyResponse(204)
}, respondToFailures)

export type AuthorizedSessionAction =
  | NoUsableSession
  | { readonly _tag: "Authorized"; readonly session: UsableSession; readonly tenantAlias: TenantAlias }
  | { readonly _tag: "SessionChanged" }

export interface AuthorizeSessionActionInput {
  /** The tag the submitting document observed, from its hidden form field. */
  readonly coordinationTag: string | undefined
  readonly host: string
  readonly reference?: string | undefined
}

const sessionChanged: AuthorizedSessionAction = { _tag: "SessionChanged" }

const authorizeAction = Effect.fn("authorizeSessionAction")(function*(input: AuthorizeSessionActionInput) {
  const tenant = yield* resolveRequestTenant(input.host)
  const reference = decodeSessionReference(input.reference)
  if (Option.isNone(reference)) return { _tag: "NoUsableSession" } satisfies AuthorizedSessionAction
  const claimed = input.coordinationTag
  if (claimed === undefined || !isCoordinationTagOf(reference.value, claimed)) return sessionChanged
  const session = yield* (yield* SessionService).refreshForTenant({
    activity: "deliberate-form-submission",
    policy: effectiveSessionPolicy(tenant.config),
    reference: reference.value,
    tenantAlias: tenant.alias
  })
  if (session._tag === "NoUsableSession") return session
  return { _tag: "Authorized", session, tenantAlias: tenant.alias } satisfies AuthorizedSessionAction
})

/**
 * Resolves the tenant, compares the submitted tag with the cookie's tag, and only on a match renews as
 * `deliberate-form-submission` with the tenant's effective policy. A missing or mismatched tag is `SessionChanged`
 * with no store write. Tenant failure renders the tenant page, a tenant mismatch calls `forbidden()`, and an
 * unavailable store throws, as `readSessionRequest` does (research D2, R17).
 */
export const authorizeSessionAction = (input: AuthorizeSessionActionInput): Promise<AuthorizedSessionAction> =>
  runSessionRequest(authorizeAction(input))

/** `POST /session/activity`: renews the tab's session for one in-page qualifying activity. */
export const createSessionActivityHandler = (): (request: NextRequest) => Promise<NextResponse> =>
  toNext(sessionActivity)

/** `GET /session/status`: reads the session without renewing it. */
export const createSessionStatusHandler = (): (request: NextRequest) => Promise<NextResponse> => toNext(sessionStatus)

/** `POST /auth/logout`: ends the tab's session. It leaves the cookie untouched (research D15). */
export const createLogoutHandler = (): (request: NextRequest) => Promise<NextResponse> => toNext(logout)
