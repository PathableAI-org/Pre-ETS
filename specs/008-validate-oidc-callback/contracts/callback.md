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
  nonce, provider state, raw provider payload or application session.

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

- Resolve the request tenant from the callback host independently of initiation.
- Read the correlation cookie and the original query parameter multiplicity.
- Reject missing/invalid correlation, duplicate security parameters, contradictory success/error shapes, mixed or
  malformed callback values, and tenant/return/integration mismatches.
- Never accept a query-supplied tenant, prepared identity or return destination as authoritative.

### Validated callback response

Until #218 supplies a session consumer, a successful `TrustedIdentity` is mapped to an intentionally bounded HTTP
204 response:

- empty body;
- correlation cookie cleared;
- private/no-store caching;
- no application-session cookie;
- no redirect to protected content; and
- no identity, provider claim, token, code, verifier, credential or transaction material.

The 204 is an intermediate slice contract that makes actual callback success observable without disclosing
identity. #218 replaces this adapter mapping with session creation; the public authentication service's
trusted identity remains its handoff.

### Denied or unavailable response

Expected invalid/missing/expired/replayed/mismatched transaction outcomes, provider cancellation/failure and invalid
identity evidence produce no trusted handoff and no protected content. They use the existing safe public
sign-in-failure experience without automatically starting `/auth/login`. Operational authentication unavailability
also fails closed. Internal distinctions are not disclosed through raw provider or storage messages.

Tenant resolution/configuration still controls its existing 404/500 response. Callback public reachability is not
callback acceptance and does not authorize content.

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
- `@preets-session-013` only for signed `auth_time` presence, not staleness.

BDD observes actual HTTP/browser behavior. Real Keycloak completion traverses the real provider and callback
boundary, begins on instance A and returns to independently composed instance B. Prepared identities, a mock callback
or direct service invocation cannot replace that scenario. Steps do not inspect Redis, serialized attempts, private
modules, log/span payloads or credentials. Dry-run is discovery only, never evidence.

The tracked Keycloak execution establishes Keycloak behavior only. Microsoft/broker behavior remains unexecuted;
application sessions remain absent under #218; full callback presentation remains #154; and stale `auth_time`
comparison/tolerance remains #158.
