import { Clock, Effect, Option, Schema } from "effect"
import { type NextRequest, NextResponse } from "next/server"
import { createHash, timingSafeEqual } from "node:crypto"

import {
  decodeSessionReference,
  SessionService,
  type SessionServiceUnavailable,
  type SessionTenantMismatch,
  type UsableSession
} from "../session.js"
import { effectiveSessionPolicy, type TenantFailure } from "../tenant.js"
import { clearSessionCookie, remainingIdleSeconds, SESSION_COOKIE, setSessionCookie } from "./cookies.js"
import { PRIVATE_NO_STORE, toNext } from "./handler.js"
import { resolveRequestTenant } from "./request.js"
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

/** What a tab may know about its usable session. Contains no reference, identity, token, or store key. */
export interface SessionCoordinationSnapshot {
  /** One-way, domain-separated digest of the session reference. Not a credential. */
  readonly coordinationTag: string
  readonly idleDeadlineEpochMilliseconds: number
  /** Server clock when the snapshot was produced; lets the tab convert the deadline to its own clock. */
  readonly serverTimeEpochMilliseconds: number
  readonly warningLeadMinutes: number
}

const SessionActivityBody = Schema.Struct({ activity: InPageActivity, coordinationTag: Schema.String })
const LogoutBody = Schema.Struct({ coordinationTag: Schema.String })

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
class UnsupportedContentType extends Schema.TaggedError<UnsupportedContentType>()("UnsupportedContentType", {}) {}

/** The store key hashes the bare reference; the domain prefix keeps the tag distinct from it. */
const TAG_DOMAIN = "preets:session-coordination:v1\0"

const coordinationTagFor = (reference: string): string =>
  createHash("sha256").update(TAG_DOMAIN).update(reference).digest("base64url")

const sameTag = (expected: string, claimed: string): boolean => {
  const left = Buffer.from(expected)
  const right = Buffer.from(claimed)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** The snapshot for a usable session read with `reference`. */
export const coordinationSnapshot = (
  reference: string,
  session: UsableSession,
  serverTimeEpochMilliseconds: number
): SessionCoordinationSnapshot => ({
  coordinationTag: coordinationTagFor(reference),
  idleDeadlineEpochMilliseconds: session.idleDeadlineEpochMilliseconds,
  serverTimeEpochMilliseconds,
  warningLeadMinutes: session.warningLeadMinutes
})

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
  sameTag(coordinationTagFor(reference), claimed) ? Effect.void : Effect.fail(new CoordinationTagMismatch({}))

type CoordinationFailure =
  | CoordinationTagMismatch
  | CrossOriginRequest
  | Schema.SchemaError
  | SessionServiceUnavailable
  | SessionTenantMismatch
  | TenantFailure
  | UnsupportedContentType

const FAILURE_STATUS = {
  CoordinationTagMismatch: 409,
  CrossOriginRequest: 403,
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
  const now = yield* Clock.currentTimeMillis
  const maxAge = remainingIdleSeconds(session.idleDeadlineEpochMilliseconds, now)
  const response = snapshotResponse(coordinationSnapshot(reference.value, session, now))
  return setSessionCookie(response, request, reference.value, maxAge)
}, respondToFailures)

const sessionStatus = Effect.fn("sessionStatus")(function*(request: NextRequest) {
  const current = yield* currentSession(request)
  if (Option.isNone(current)) return emptyResponse(401)
  const { reference, session } = current.value
  return snapshotResponse(coordinationSnapshot(reference, session, yield* Clock.currentTimeMillis))
}, respondToFailures)

/** Ends the application session only; no identity-provider logout (research F-2). */
const logout = Effect.fn("logout")(function*(request: NextRequest) {
  const body = yield* decodeLogoutBody(yield* readJsonBody(request))
  const current = yield* currentSession(request)
  if (Option.isNone(current)) return emptyResponse(401)
  yield* requireTag(current.value.reference, body.coordinationTag)
  yield* (yield* SessionService).invalidate({ reference: current.value.reference })
  return clearSessionCookie(emptyResponse(204), request)
}, respondToFailures)

/** `POST /session/activity`: renews the tab's session for one in-page qualifying activity. */
export const createSessionActivityHandler = (): (request: NextRequest) => Promise<NextResponse> =>
  toNext(sessionActivity)

/** `GET /session/status`: reads the session without renewing it. */
export const createSessionStatusHandler = (): (request: NextRequest) => Promise<NextResponse> => toNext(sessionStatus)

/** `POST /auth/logout`: ends the tab's session and expires its cookie. */
export const createLogoutHandler = (): (request: NextRequest) => Promise<NextResponse> => toNext(logout)
