# Research and decisions: recoverable OIDC callback validation

**Date**: 2026-10-20. Proposed #217 / S2-C design only; no implementation or runtime evidence is claimed.
The inspected requirement baseline is `origin/main` at `b514237d5ffc49180ad683a5cfe77b808cc19c5c`.

## 1. Keep callback work inside the public authentication module

**Decision**: Evolve `AuthenticationService` from destination-only preparation into the public owner of two
consumer operations: prepare a recoverable tenant attempt, and validate/consume a callback into a trusted identity.
Keep `src/lib/authentication.ts` as the only application-visible entry. Its private children own configuration,
provider protocol, credential resolution and transaction persistence. A transaction child may own deeper private
codec/store descendants; sibling children, runtime, routes and tests do not import those descendants.

**Rationale**: Authentication initiation and callback validation are one consumer-facing capability. Recursive
isolation keeps provider and Redis mechanics replaceable without exposing a service per file. The application-session
service remains the owner of authenticated sessions under #218; an OIDC attempt is not an application session.

**Alternatives considered**: Expanding `SessionService` would pull #218 forward. Public `OidcStore`, `Secrets`, or
provider-client modules would expose implementation mechanisms without another consumer. Letting siblings import one
another's descendants would make the filesystem hierarchy decorative rather than an enforced boundary.

## 2. Use Effect contracts and one host-owned resource graph

**Decision**: Keep public service interfaces readonly and express success, expected failures and requirements in the
Effect type. Compose the production Redis Layer once under the existing shared `ManagedRuntime`; never make a runtime
or long-lived client per request. Use `Effect.gen` for inline orchestration, named `Effect.fn` at the public prepare and
complete boundaries, and `Effect.fnUntraced` for private helpers that do not warrant spans. Return terminal failures
with `return yield*`. Preserve defects and interruption rather than translating them into denials.

**Rationale**: This follows the repository's consumer-inward Effect guidance and preserves resource scope, Layer
identity and host ownership. It also lets deterministic tests supply a scenario world while production supplies the
real platform adapter.

**Alternatives considered**: Promise-based workflows below the route boundary would hide requirements and error
types. Creating Redis or OIDC clients inside operations would make cleanup and cross-request reuse unreliable.
`Layer.provideMerge` would expose Redis beyond its owning graph when `Layer.provide` is sufficient.

## 3. Use the pinned Effect Redis service and own its peer dependency

**Decision**: Add exact `redis@6.3.0` as a direct frontend dependency. Use
`@effect/platform-node/NodeRedis` as the scoped production Layer and consume only
`effect/persistence/Redis.Redis` in the private transaction adapter. Create with `SET key payload NX PX ttlMillis` and
consume with one atomic `GETDEL key`. Do not use `GET` followed by `DEL`. Use a Lua script only if implementation-time
contract review discovers a necessary conditional compare-and-delete that `GETDEL` cannot satisfy.

**Rationale**: Exact `@effect/platform-node@4.0.5` exports `NodeRedis.layer`/`layerConfig`; exact `effect@4.0.5` exports
the generic Redis service with `send` and script support. The Node Layer connects and closes its client within scope.
`redis` is a platform-node peer (`>=5 <7`), and the current lock resolution of 6.3.0 is not a substitute for a direct
runtime declaration. Redis 8.10.2 in Compose supports `GETDEL`.

**Alternatives considered**: Direct node-redis calls would spread the platform peer API. A new generic application
Redis service would duplicate Effect's service. `effect/persistence/Persistence` does not express atomic one-time
consume directly. In-memory production storage cannot recover across instances. Cookie-only context would expose the
verifier and provider transaction material to the browser.

**Declaration gate**: `packages/frontend/node_modules` is absent in this planning checkout. The local Effect checkout
at `41cf29b5d85af7fc25bcc7713f2e05142edaa66a` is ahead of the release tag even though the exact 4.0.5 tag contains the
needed surfaces. Implementation must install dependencies and verify the frontend's installed 4.0.5 declarations for
the NodeRedis barrel export, Layer result, `Redis.send`, `RedisError`, Layer composition and final type graph.

## 4. Store a short-lived attempt; give the browser only opaque correlation

**Decision**: Generate a distinct 32-byte base64url correlation reference. Persist a versioned Schema-encoded attempt
under the configured `OIDC_TX_KEY_PREFIX` before returning the provider redirect. The record contains only the
tenant/provider/return binding, state, nonce and PKCE verifier required to validate one callback. It contains no token,
resolved client credential or application-session identity. Use a default 600-second transaction lifetime, configurable
for isolated runtime evidence through a validated positive `OIDC_TX_TTL_SECONDS`. Store both an explicit application-
clock expiry and a Redis TTL.

The route writes only the opaque reference in a host-only cookie: no `Domain`, `HttpOnly`, `SameSite=Lax`,
`Path=/auth/callback`, `Max-Age` aligned with the attempt, and `Secure` except for the explicitly permitted loopback
HTTP profile. Clear it on every callback response that can address it. Possession locates an attempt but never proves
state, nonce, provider evidence, identity or access.

**Rationale**: Redis TTL provides server-clock cleanup and cross-instance availability. Explicit expiry checked with
the Effect clock fails closed if stale bytes remain and makes service behavior deterministic under `TestClock`.
`SET NX` prevents overwrite; retrying one fresh reference on a collision is bounded and does not claim entropy quality.
A separate reference keeps provider-visible state distinct from application correlation.

**Alternatives considered**: State alone as the cookie/key would collapse two independent bindings. A signed or
encrypted browser transaction would add key rotation and put more context in the browser without a requirement.
Persisting tokens or resolved secrets would widen the sensitive-data surface. An unbounded or application-session-
lifetime attempt contradicts short-lived single use.

## 5. Consume before provider validation and never retry an ambiguous consume

**Decision**: Callback processing independently resolves the request tenant, validates correlation syntax, atomically
consumes the addressed record, Schema-decodes it, checks expiry and every tenant/provider/return binding, then performs
provider validation. A matching cancellation, provider failure or later validation failure burns the one-time attempt.
Malformed stored bytes are consumed and rejected. Missing/expired/replayed attempts share a safe no-handoff outcome.
Invalid correlation is rejected before Redis so it cannot name or consume an unrelated attempt.

Do not retry `GETDEL` after timeout or an ambiguous Redis transport failure: the record may already be gone. Fail
closed. If an initiation write succeeds but its response is lost, issue neither redirect nor cookie; the unreachable
record expires normally.

**Rationale**: Consumption before exchange gives at-most-once recovery under races across instances. Safe denial is
more important than differentiating missing, expired and replayed state to the browser. Schema decoding treats Redis
bytes as untrusted at their actual persistence boundary.

**Alternatives considered**: Validation followed by deletion permits concurrent recovery. Retrying an ambiguous
consume could disguise the result and does not restore one-time state. Returning raw Redis or decoding failures would
leak internal data and couple the route to storage.

## 6. Use openid-client for the complete protocol boundary, without inventing freshness policy

**Decision**: Refactor the private provider child so initiation returns both the public destination and private
attempt material. Completion rediscovers/configures the selected provider, then calls pinned
`openid-client@6.8.8` `authorizationCodeGrant` with the recovered PKCE verifier, expected state and expected nonce,
requiring an ID token. Use only claims returned after the library's authorization-response, code-exchange, signature,
issuer, audience and nonce validation. Schema-decode the verified claim view and require nonempty `sub` plus an integer
`auth_time`. Return only provider-neutral trusted facts: tenant alias, issuer, subject and signed authentication time.
Do not return or retain authorization codes, access/refresh/ID tokens or raw claims.

Do not pass an application-selected `maxAge` comparison until #158 decides transaction-time comparison and clock
tolerance. The request continues to send `max_age=0`; this slice only requires that the verified signed claims contain
`auth_time`. Keep the existing custom-fetch transport policy, redirect rejection, interruption propagation and one
provider-operation deadline for callback exchange as well as initiation.

**Rationale**: The library owns protocol validation; custom validation should only enforce the feature's provider-
neutral identity shape and the approved presence-only freshness slice. `sub` identifies the user within the verified
issuer without assuming email, display-name or vendor claims.

**Alternatives considered**: Hand-validating JWTs duplicates protocol risk. Passing `maxAge: 0` would enforce a
freshness comparison before the tolerance policy exists. Treating a redirect, new correlation reference or unsigned
claim as freshness is explicitly disallowed. Fetching UserInfo is unnecessary for the current identity contract.

Primary API sources: pinned openid-client authorization-code example and `authorizationCodeGrant` /
`AuthorizationCodeGrantChecks` documentation for 6.8.8.

## 7. Resolve confidential credentials through one private server-only boundary

**Decision**: Add a private authentication credential resolver now that callback exchange is a real secret consumer.
Its production source is a server-only, vendor-neutral `OIDC_CLIENT_SECRETS_JSON` map from the existing non-secret
`clientSecretRef` to secret values. Parse the redacted process value with Schema and map malformed explicit settings to
a generic configuration error that cannot reproduce the value. Public clients use OIDC `None`; confidential clients
resolve their reference and use the library's standards-based client-secret authentication. A missing selected
reference is safe authentication unavailability, not tenant fallback.

**Rationale**: This realizes PREETS-SECURITY-001 without changing tenant files or diagnostics. The process provider is
the narrow current implementation; future cloud infrastructure can replace it behind the private resolver without
changing application policy. The authentication parent mediates values between credential and provider children.

**Alternatives considered**: Embedding a credential in the tenant file violates the accepted configuration contract.
A public general-purpose secrets platform has no other consumer. Adding a vendor SDK or secret naming policy would
prematurely decide deferred cloud infrastructure.

## 8. Use Node Route Handlers as the cookie/HTTP adapters

**Decision**: Replace the login and callback pages at their exact segments with Node Route Handlers; Next does not
allow `page.tsx` and `route.ts` at the same segment. Login maps a prepared result to provider HTTP 307 plus correlation
cookie. Callback reads Host, query and cookie, invokes the shared Runtime, clears correlation, and maps trusted handoff
to a bounded 204 response with no application session or protected body. Expected denial/unavailability goes to the
existing safe public sign-in-failure experience without automatic restart. Tenant 404/500 and no-store behavior remain
distinct. Verify exact installed Next 16.4.2 cookie, redirect and `notFound` behavior before implementation.

**Rationale**: Route Handlers own response cookies and headers without starting another runtime. A 204 gives the
intermediate slice an observable successful callback boundary without exposing identity; #218 replaces this temporary
mapping with session creation. Existing comprehensive callback/error presentation remains #154.

**Alternatives considered**: Server Components cannot write/delete cookies. A second internal cookie-setting hop adds
another recoverable state transition. Returning identity JSON or putting it in a redirect/query leaks trusted data.
Redirecting both success and denial to the same page would make the actual callback success unobservable.

## 9. Separate service, real-adapter, framework and workflow evidence

**Decision**: Test the real `AuthenticationService` through its public parent with fresh deterministic dependency
Layers. Use properties for binding invariants and named examples for protocol boundaries. Use real Redis with two
independent scoped client/service graphs for cross-instance, TTL and race claims. Use ordinary Vitest for Next adapter
mapping. Use requirements BDD only for actual HTTP/browser outcomes and real Keycloak completion; BDD never connects
to Redis or imports private modules. Keep log/span/exporter/secret-in-log inspection manual.

**Rationale**: Deterministic services prove the contract in supplied worlds; only Redis proves real atomicity/expiry;
only the OIDC client and real provider prove protocol completion; only HTTP/browser evidence proves route/cookie and
visible outcomes. No one layer is asked to prove another's mechanics.

**Alternatives considered**: In-memory stores cannot prove cross-instance atomicity. Mocked callback identities cannot
replace real Keycloak completion. Browser scenarios that inspect Redis or private JSON would bind requirements to an
implementation. Durable telemetry assertions violate repository policy.

## 10. Extend the existing BDD harness without turning setup into product assertions

**Decision**: Give each scenario a unique `OIDC_TX_KEY_PREFIX`, spawn two independently running production Next
processes when cross-instance evidence needs them, and extend the owned browser proxy from authority-to-one-port into
an explicit authority-to-instance mapping. Initiate on A and route the registered callback authority to B. Automate the
tracked Keycloak `demo` login only for real completion. Capture callback URL/correlation at the HTTP/browser boundary
for mismatch, expiry, replay and racing requests; do not read Redis in Cucumber steps.

The callback feature remains feature-level `@partial` with current lowercase requirement IDs. Real Keycloak proves
the common successful completion path. Focused controlled-transport public-service tests cover signature/audience/
nonce/claim failures that the tracked provider cannot safely synthesize; they supplement rather than replace the real
completion scenario. Missing signed `auth_time` is rejected at the service boundary and, if the tracked Keycloak
profile can produce a standards-valid no-`auth_time` response without a mock provider, may also receive HTTP/browser
evidence; the plan does not weaken the claim or fabricate provider behavior when it cannot.

**Rationale**: The harness already separates logical callback authority from random transport ports. Generalizing its
owned mapping produces genuine cross-instance HTTP evidence while preserving provider traffic. Product assertions stay
in steps; readiness and process management stay in support/CI.

**Alternatives considered**: Sticky sessions evade the requirement. A mock identity provider cannot establish real
completion. Reading Redis from BDD would move the observation below the application boundary. Skipping scenarios under
`@partial` is forbidden.

## 11. Validation and known limits

**Decision**: Validate focused service/adapter tests, full frontend Vitest, Gherkin lint/format/discovery, production
requirements BDD, and repository typecheck/build/lint/unused/format gates. Use manual ad hoc inspection for actual logs,
spans, exporter data and secret handling. Record revision, Keycloak version, two-instance arrangement, Redis version,
and limitations.

**Limits retained by design**: Keycloak evidence does not establish Microsoft or broker compatibility. Confidential
client protocol behavior has focused controlled evidence unless a real confidential integration is available. #218
still owns the application session; #154 owns complete application integration/presentation; #158 still owns stale
`auth_time` comparison, tolerance and unsupported-provider policy. No static check is runtime proof.
