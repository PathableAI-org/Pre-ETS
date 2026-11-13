import { Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

import { annotateOutcome } from "../observability.js"
import { type NoUsableSession, type QualifyingSessionActivity, SessionService, type UsableSession } from "../session.js"
import { effectiveSessionPolicy } from "../tenant.js"
import { PRIVATE_NO_STORE, toNext } from "./handler.js"
import { navigationStatus, resolveRequestTenant } from "./request.js"
import { SESSION_COOKIE } from "./session.js"
import { type TenantFailureResponse, tenantFailureStatus } from "./tenant-failure.js"

/** Responses the Next host presents for protection outcomes it owns. */
export interface ProtectionResponses {
  /**
   * A denied fetch Server Action (`next-action` present). The body is the host's closed-set `text/plain` token for
   * `cause`, which Next's client throws as the action's rejection message. The gate sends it with HTTP 401 and
   * `Cache-Control: private, no-store`, whatever status or cache headers the host sets (#157 research D3).
   */
  readonly actionDenial: (input: { readonly cause: SessionEndCause }) => Promise<NextResponse>
  /**
   * A tenant mismatch on a document entry. The response MUST carry HTTP 403 and the accessible forbidden
   * presentation, and no protected content. The Next app renders it as the response body (no rewrite; research D4).
   * The gate sets `Cache-Control: private, no-store` on the returned response, so it is never cacheable.
   */
  readonly forbiddenDocument: (request: NextRequest) => Promise<NextResponse>
  /**
   * A denied Server Action candidate submitted as a browser navigation without `next-action` (scripts disabled or
   * not yet running). The body is the accessible recovery document for `cause`. The gate sends it with HTTP 401 and
   * `Cache-Control: private, no-store`, whatever status or cache headers the host sets (#157 research D1).
   */
  readonly recoveryDocument: (input: { readonly cause: SessionEndCause }) => Promise<NextResponse>
  /** The host's existing tenant-failure presentation (404 missing page, 500). */
  readonly tenantFailure: TenantFailureResponse
}

/** Why a session is not usable, as far as the server or the tab can tell. */
export type SessionEndCause = "expired" | "unknown"

/**
 * The closed public designation. `/_test` and `/_test/…` are public for every method; the other exact paths for
 * `GET`/`HEAD` only. A Server Action candidate is never public. #157 answers a denied candidate in place, so it adds
 * no public recovery path.
 */
const PUBLIC_DOCUMENT_PATHS: ReadonlySet<string> = new Set(["/auth/callback", "/auth/login", "/login-unavailable"])
const PUBLIC_ROOT = "/_test"
const PUBLIC_PREFIX = "/_test/"
const PUBLIC_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"])

/**
 * Next may decode the path again when routing, so an encoded `/`, `\`, or `.` under the public prefix could reach a
 * protected resource. Such spellings are protected.
 */
const ENCODED_PATH_SEPARATOR = /%(?:2f|5c|2e)/i

interface ProtectedRequest {
  readonly candidate: boolean
  readonly entry: "application" | "document"
  readonly renewal: QualifyingSessionActivity | undefined
  readonly serverAction: ServerActionTransport
}

/**
 * How a Server Action candidate arrived: `fetch` carries `next-action` (a script submitted it), `document` is a
 * form-encoded navigation without it (a no-script submission), and `none` is every other request.
 */
type ServerActionTransport = "document" | "fetch" | "none"

/**
 * Next's own possible-action predicate (`isPossibleServerAction`): a form-encoded `POST`, which Next decodes as an
 * action even without the header, or an action header. Next treats the header as a fetch action only on `POST`; the
 * gate protects every method that carries it, because a Server Action candidate must never be public.
 */
const isServerActionCandidate = (method: string, headers: Headers) => {
  if (headers.has("next-action")) return true
  if (method !== "POST") return false
  const contentType = headers.get("content-type")
  return contentType === "application/x-www-form-urlencoded" || contentType?.startsWith("multipart/form-data") === true
}

/**
 * The coordination endpoints. They are protected application requests that never renew at the gate, whatever their
 * method, Fetch Metadata, or `next-action` header: only the activity handler renews, after its tag check (research D1).
 */
const NON_RENEWING_PATHS: ReadonlySet<string> = new Set(["/auth/logout", "/session/activity", "/session/status"])

const isTestPath = (pathname: string) =>
  (pathname === PUBLIC_ROOT || pathname.startsWith(PUBLIC_PREFIX)) && !ENCODED_PATH_SEPARATOR.test(pathname)

const isPublic = (method: string, pathname: string, headers: Headers) =>
  !isServerActionCandidate(method, headers) &&
  (isTestPath(pathname) || (PUBLIC_METHODS.has(method) && PUBLIC_DOCUMENT_PATHS.has(pathname)))

/**
 * Only a `GET`/`HEAD` navigation without an action is a document entry; anything else, including a request without
 * Fetch Metadata, is an application request and never starts login. Only document entries renew at the gate: a
 * Server Action renews inside `authorizeSessionAction`, after its tag check (research D2, R17).
 */
const classify = (request: NextRequest): ProtectedRequest | undefined => {
  const { headers, method } = request
  const { pathname } = request.nextUrl
  if (isPublic(method, pathname, headers)) return undefined
  const action = headers.has("next-action")
  const navigation = navigationStatus(headers) === "navigation"
  const candidate = isServerActionCandidate(method, headers)
  const serverAction = serverActionTransport(candidate, action, navigation)
  if (NON_RENEWING_PATHS.has(pathname)) return { candidate, entry: "application", renewal: undefined, serverAction }
  if (PUBLIC_METHODS.has(method) && !action && navigation) {
    return { candidate, entry: "document", renewal: "deliberate-page-request", serverAction }
  }
  return { candidate, entry: "application", renewal: undefined, serverAction }
}

const serverActionTransport = (candidate: boolean, action: boolean, navigation: boolean): ServerActionTransport => {
  if (action) return "fetch"
  return candidate && navigation ? "document" : "none"
}

const denial = (status: 401 | 403 | 503) =>
  new NextResponse(null, { headers: { "cache-control": PRIVATE_NO_STORE }, status })

const privately = (response: NextResponse): NextResponse => {
  response.headers.set("cache-control", PRIVATE_NO_STORE)
  return response
}

const fromHost = (respond: () => Promise<NextResponse>) => Effect.promise(respond).pipe(Effect.map(privately))

/** Records the gate's decision on the `protectRequest` span (docs/session-state.md#verification-signals). */
const decided = (outcome: string, response: Effect.Effect<NextResponse>) =>
  annotateOutcome(outcome).pipe(Effect.andThen(response))

/** A renewal sets no cookie: only establishment writes `pathable-session` (research D15). */
const admit = () => privately(NextResponse.next())

/**
 * The gate owns a denial's status and headers: only the host's body and content type pass, so the response stays 401,
 * private and not storable, sets no cookie, and redirects nowhere, whatever the host returns.
 */
const unauthorizedFromHost = (respond: () => Promise<NextResponse>) =>
  Effect.promise(respond).pipe(
    Effect.map((response) => {
      const headers = new Headers({ "cache-control": PRIVATE_NO_STORE })
      const contentType = response.headers.get("content-type")
      if (contentType !== null) headers.set("content-type", contentType)
      return new NextResponse(response.body, { headers, status: 401 })
    })
  )

/**
 * A denied Server Action candidate starts no login. Its cause is what the session read observed (#157 research D2).
 * A script submission receives the host's cause token and a no-script submission the host's recovery document
 * (research D1, D3); every other denial stays an empty 401.
 */
const denyUnauthenticated = (
  responses: ProtectionResponses,
  classified: ProtectedRequest,
  session: NoUsableSession
) => {
  if (!classified.candidate) return decided("denied_unauthenticated", Effect.sync(() => denial(401)))
  const cause: SessionEndCause = session.expired === true ? "expired" : "unknown"
  return Effect.annotateCurrentSpan("preets.protection.denial_cause", cause).pipe(
    Effect.andThen(decided(
      "denied_unauthenticated",
      hostDenial(responses, classified.serverAction, cause)
    ))
  )
}

const hostDenial = (responses: ProtectionResponses, transport: ServerActionTransport, cause: SessionEndCause) => {
  if (transport === "fetch") return unauthorizedFromHost(() => responses.actionDenial({ cause }))
  if (transport === "document") return unauthorizedFromHost(() => responses.recoveryDocument({ cause }))
  return Effect.sync(() => denial(401))
}

const respondToSession = (
  responses: ProtectionResponses,
  request: NextRequest,
  classified: ProtectedRequest,
  session: NoUsableSession | UsableSession
) => {
  if (session._tag === "UsableSession") return decided("admitted", Effect.sync(admit))
  if (classified.entry === "application") return denyUnauthenticated(responses, classified, session)
  const login = NextResponse.redirect(new URL("/auth/login", request.nextUrl), 307)
  return decided("redirected_login", Effect.succeed(privately(login)))
}

/** One store operation: renewal for a deliberate request, otherwise a read. The request tenant is resolved first. */
const protectRequest = Effect.fn("protectRequest")(
  function*(_responses: ProtectionResponses, request: NextRequest, classified: ProtectedRequest) {
    yield* Effect.annotateCurrentSpan({
      "preets.protection.entry": classified.entry,
      "preets.protection.renewal": classified.renewal ?? "none",
      "preets.protection.server_action": classified.serverAction
    })
    const tenant = yield* resolveRequestTenant(request.headers.get("host") ?? "")
    const sessions = yield* SessionService
    const reference = request.cookies.get(SESSION_COOKIE)?.value
    if (classified.renewal === undefined) {
      return yield* sessions.readForTenant({ reference, tenantAlias: tenant.alias })
    }
    return yield* sessions.refreshForTenant({
      activity: classified.renewal,
      policy: effectiveSessionPolicy(tenant.config),
      reference,
      tenantAlias: tenant.alias
    })
  },
  (effect, responses, request, classified) =>
    effect.pipe(
      // Branches on `_tag`, not `instanceof`: Turbopack can evaluate a module once per chunk.
      Effect.matchEffect({
        onFailure: (failure) => {
          switch (failure._tag) {
            case "SessionServiceUnavailable":
              return decided("unavailable", Effect.sync(() => denial(503)))
            case "SessionTenantMismatch":
              return decided(
                "denied_forbidden",
                classified.entry === "document" ?
                  fromHost(() => responses.forbiddenDocument(request)) :
                  Effect.sync(() => denial(403))
              )
            case "TenantNotFound":
            case "TenantReadError":
              return decided("tenant_failure", fromHost(() => responses.tenantFailure(tenantFailureStatus(failure))))
          }
        },
        onSuccess: (session) => respondToSession(responses, request, classified, session)
      })
    )
)

/** Default protection gate for the Next.js proxy. */
export const createProtectionProxy =
  (
    responses: ProtectionResponses
  ): (request: NextRequest) => Promise<NextResponse> =>
  (request) => {
    const classified = classify(request)
    if (classified === undefined) return Promise.resolve(NextResponse.next())
    return toNext((incoming) => protectRequest(responses, incoming, classified))(request)
  }
