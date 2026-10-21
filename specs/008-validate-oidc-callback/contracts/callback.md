# HTTP and browser contract: recoverable OIDC callback validation

This feature changes initiation and callback adapters while leaving application-session creation and protected
access to #218.

## `GET /auth/login`

### Success

- Independently resolve the request tenant through the public authentication service.
- Create the recoverable attempt before issuing browser correlation or provider delegation.
- Return the existing temporary provider redirect (HTTP 307) and one opaque correlation cookie.
- Cookie attributes: host-only (no `Domain`), `HttpOnly`, `SameSite=Lax`, `Path=/auth/callback`, `Max-Age` aligned to
  the attempt lifetime, and `Secure` except in the explicitly permitted loopback HTTP profile.
- Preserve `Cache-Control: private, no-store` behavior and return no protected content, identity, token, verifier,
  raw provider payload or application session. The provider redirect necessarily carries generated OIDC protocol
  parameters such as `state`, nonce and code challenge; none is copied into the response body or correlation cookie.

### Expected failure

- Tenant selection/read/schema failures retain their existing real 404/500 distinction.
- Authentication/transaction/provider unavailability maps to the existing safe sign-in-failure presentation.
- A failed preparation emits neither a usable provider redirect nor a correlation cookie. A persisted record whose
  response is lost is unreachable and expires; it is not recovered through another browser identifier.

The predecessor BDD assertion that initiation emits no correlation state is revised. The durable statement retained
is that no authenticated application session or protected access exists after initiation.

## Correlation cookie

The cookie value is the opaque `BrowserCorrelation` only. Its name is an adapter detail selected during
implementation and tested through HTTP behavior. It is not the provider `state`, a bearer identity, a serialized
attempt or an application-session cookie.

The callback clears it using matching host/path semantics on every response where it can address the artifact,
including success, denial and expected unavailability. Cookie deletion does not determine whether the server record
was consumed; the public authentication outcome does.

## `GET /auth/callback`

### Input rules

The inbound browser callback URL necessarily carries `code` and `state`, or provider error parameters. These are
untrusted transient inputs. The application consumes them at this boundary; no contract claims that they are absent
from the request itself.

- Resolve the canonical request tenant from the callback host independently of initiation and require its exact
  registered callback authority.
- Read the correlation cookie and the original query parameter multiplicity.
- Before transaction storage, reject missing/invalid correlation, missing/duplicate/malformed state, duplicate
  security parameters, contradictory success/error shapes, mixed or malformed callback values, and authority
  mismatches. Only the validated tenant/correlation/state tuple may address an attempt.
- A wrong tenant or authority, invalid correlation, or missing/duplicate/wrong state must not consume the valid
  original attempt. A matching success or error/cancellation consumes once; later provider/exchange failure burns.
- Never accept a query-supplied tenant, prepared identity or return destination as authoritative.

### Validated callback response

Until #218 supplies a session consumer, a successful `TrustedIdentity` is mapped to an intentionally bounded HTTP
204 response:

- empty body;
- correlation cookie cleared;
- private/no-store caching;
- no application-session cookie;
- no redirect to protected content; and
- no identity, provider claim, token, verifier, credential or transaction material; and
- no re-emission of inbound `code`, `state`, or provider error parameters in the response body, response headers or
  redirect location, cookies, diagnostics, retained application state, or application-controlled telemetry.

The 204 is an intermediate slice contract that makes selection of the validated-success HTTP branch observable
without disclosing identity. It cannot prove the tenant, issuer, subject, or `auth_time` fields. Those exact values
are asserted at the public `AuthenticationService` boundary and combine with the HTTP outcome to establish the
requirement. #218 replaces this adapter mapping with session creation; the public authentication service's trusted
identity remains its handoff.

### Denied or unavailable response

Expected invalid/missing/expired/replayed/mismatched transaction outcomes, provider cancellation/failure and invalid
identity evidence produce no trusted handoff and no protected content. They use the existing safe public
sign-in-failure experience without automatically starting `/auth/login`. Operational authentication unavailability
after successful process startup also fails closed. Initial NodeRedis Layer acquisition failure prevents the whole
frontend process from becoming ready, so no route-level response is promised until a fresh process starts after
recovery. A Redis command rejected before send while disconnected/reconnecting cannot execute after recovery. An
in-flight disconnect is ambiguous, is never retried, and may already have consumed the attempt; a later new request
may succeed after reconnection. Internal distinctions are not disclosed through raw provider or storage messages.

Tenant resolution/configuration still controls its existing 404/500 response. Callback public reachability is not
callback acceptance and does not authorize content.

## Readiness, rollout, and rollback

Redis is a required process-readiness dependency. Eager shared-runtime acquisition failure keeps the entire frontend
process out of service; a healthy sibling instance is unaffected, and recovery requires restart/recreation after
Redis is reachable. After readiness, Redis command failure maps only the affected authentication request to safe
unavailability. A malformed explicitly supplied credential map or invalid transaction TTL also prevents readiness.
An absent credential-map variable is a valid empty map; public clients need no selected secret. A confidential tenant
whose nonempty reference is absent from a valid map receives request-level authentication unavailability.

The transaction lifetime defaults to 600 seconds. An explicit override may shorten it only and must be an integer
from 1 through 600 inclusive; all other shapes fail readiness. This recovery-artifact lifetime is independent of
#158's signed-`auth_time` freshness policy.

Mixed old/new versions may deny an in-flight round trip but cannot accept it incorrectly: the predecessor creates no
new recoverable record/cookie, while the new callback requires its qualified versioned address. Rollback needs no
migration. New keys and host-only callback-path cookies confer no identity or access, fail closed when unmatched, and
expire within the bounded attempt lifetime.

## Query and navigation semantics

Use a Route Handler redirect/response rather than catching Next navigation sentinels. Preserve exact query
multiplicity until validation. Do not construct callback URLs from untrusted forwarded headers. Continue using the
process-owned alias-to-origin mapping selected by the tenant configuration and compare recovered normalized return
authority to the current request.

## Requirements BDD contract

Update `tenant-oidc-initiation.feature` and add `tenant-oidc-callback.feature`, both feature-level `@partial`, using
only IDs from the current `origin/main` baseline:

- `@preets-session-002` for recoverable tenant/provider round trips and callback validation;
- `@preets-session-003` for the trusted handoff prerequisite and denied session outcomes;
- `@preets-security-001` only where the externally observed scenario actually supports the non-disclosure or
  server-only claim; and
- `@preets-session-013` only if an actual callback scenario observably rejects missing signed `auth_time`, never on
  the successful 204 as if it exposed the field. Otherwise retain that trace solely in public-service evidence; no
  stale-time policy is claimed.

BDD observes actual HTTP/browser behavior. Real Keycloak completion traverses the real provider and callback boundary
under one exact registered tenant authority: `/`, `/auth/login`, and provider departure route to instance A, while
`/auth/callback` on that same authority routes to independently composed instance B. Both receive the same Host. The
harness proves A's host-only callback-path cookie reaches B and is not sent to another tenant authority. BDD asserts
the empty 204, correlation clearing, no re-emission of callback parameters in application-produced output, and no
session/protected output. It does not inspect identity fields or claim its own inbound request lacked callback
parameters. Prepared identities, a mock callback or direct service invocation cannot replace the real completion
scenario. Steps do not
inspect Redis, serialized attempts, private modules, log/span payloads or credentials. Dry-run is discovery only,
never evidence.

A provider-error callback constructed by the application harness is described as controlled public-HTTP evidence,
not real provider cancellation. The latter is claimed only when the Keycloak UI actually emits it; otherwise it is
recorded as unexecuted.

The tracked Keycloak execution establishes Keycloak behavior only. Microsoft/broker behavior remains unexecuted;
application sessions remain absent under #218; full callback presentation remains #154; and stale `auth_time`
comparison/tolerance remains #158.
