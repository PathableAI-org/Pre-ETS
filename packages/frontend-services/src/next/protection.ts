import { Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

import { type NoUsableSession, type QualifyingSessionActivity, SessionService, type UsableSession } from "../session.js"
import { effectiveSessionPolicy } from "../tenant.js"
import { PRIVATE_NO_STORE, toNext } from "./handler.js"
import { navigationStatus, resolveRequestTenant } from "./request.js"
import { SESSION_COOKIE } from "./session.js"
import { type TenantFailureResponse, tenantFailureStatus } from "./tenant-failure.js"

/** Responses the Next host presents for protection outcomes it owns. */
export interface ProtectionResponses {
  /**
   * A tenant mismatch on a document entry. The response MUST carry HTTP 403 and the accessible forbidden
   * presentation, and no protected content. The Next app renders it as the response body (no rewrite; research D4).
   * The gate sets `Cache-Control: private, no-store` on the returned response, so it is never cacheable.
   */
  readonly forbiddenDocument: (request: NextRequest) => Promise<NextResponse>
  /** The host's existing tenant-failure presentation (404 missing page, 500). */
  readonly tenantFailure: TenantFailureResponse
}

/**
 * The closed public designation. `/_test` and `/_test/…` are public for every method; the other exact paths for
 * `GET`/`HEAD` only. A Server Action candidate is never public. #157 adds its recovery path here.
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
  readonly entry: "application" | "document"
  readonly renewal: QualifyingSessionActivity | undefined
}

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
  const { method } = request
  const { pathname } = request.nextUrl
  if (isPublic(method, pathname, request.headers)) return undefined
  if (NON_RENEWING_PATHS.has(pathname)) return { entry: "application", renewal: undefined }
  const action = request.headers.has("next-action")
  const document = PUBLIC_METHODS.has(method) && !action && navigationStatus(request.headers) === "navigation"
  if (document) return { entry: "document", renewal: "deliberate-page-request" }
  return { entry: "application", renewal: undefined }
}

const denial = (status: 401 | 403 | 503) =>
  new NextResponse(null, { headers: { "cache-control": PRIVATE_NO_STORE }, status })

const privately = (response: NextResponse): NextResponse => {
  response.headers.set("cache-control", PRIVATE_NO_STORE)
  return response
}

const fromHost = (respond: () => Promise<NextResponse>) => Effect.promise(respond).pipe(Effect.map(privately))

/** A renewal sets no cookie: only establishment writes `pathable-session` (research D15). */
const admit = () => privately(NextResponse.next())

const respondToSession = (
  request: NextRequest,
  classified: ProtectedRequest,
  session: NoUsableSession | UsableSession
) => {
  if (session._tag === "UsableSession") return Effect.succeed(admit())
  if (classified.entry === "application") return Effect.succeed(denial(401))
  const login = NextResponse.redirect(new URL("/auth/login", request.nextUrl), 307)
  return Effect.succeed(privately(login))
}

/** One store operation: renewal for a deliberate request, otherwise a read. The request tenant is resolved first. */
const protectRequest = Effect.fn("protectRequest")(
  function*(_responses: ProtectionResponses, request: NextRequest, classified: ProtectedRequest) {
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
              return Effect.succeed(denial(503))
            case "SessionTenantMismatch":
              return classified.entry === "document" ?
                fromHost(() => responses.forbiddenDocument(request)) :
                Effect.succeed(denial(403))
            case "TenantNotFound":
            case "TenantReadError":
              return fromHost(() => responses.tenantFailure(tenantFailureStatus(failure)))
          }
        },
        onSuccess: (session) => respondToSession(request, classified, session)
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
