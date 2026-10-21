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
consume with one atomic `GETDEL key`. The key is derived from the canonical tenant alias, opaque browser correlation,
and expected OIDC state after all three have been independently validated; it is not addressed by correlation alone.
Do not use `GET` followed by `DEL`. Use a Lua script only if implementation-time contract review discovers a
necessary conditional compare-and-delete that `GETDEL` cannot satisfy.

Construct `NodeRedis.layer({ ...connectionOptions, disableOfflineQueue: true })` so environment-derived options
cannot override the policy. Exact pinned source confirms the Layer passes its options to `redis.createClient`;
node-redis 6.3.0 rejects `sendCommand` with `ClientOfflineError` before enqueue when the socket is open but
reconnecting/not ready and offline queueing is disabled (and rejects a closed socket with `ClientClosedError`). The
platform adapter maps either failure to `RedisError`. A command rejected before enqueue/send becomes typed
authentication unavailability and cannot execute later. The client may reconnect under NodeRedis's post-ready
strategy, and a later new request may then succeed.

**Rationale**: Exact `@effect/platform-node@4.0.5` exports `NodeRedis.layer`/`layerConfig`; exact `effect@4.0.5` exports
the generic Redis service with `send` and script support. The Node Layer connects and closes its client within scope.
The generic `Redis.send` signature exposes only command plus string arguments, and the platform implementation wraps
`client.sendCommand` with `Effect.tryPromise`; it does not expose node-redis per-command abort or timeout options.
Therefore this design adds no Effect timeout around `GETDEL`: returning early from an uncancelable/queued command could
allow a later deletion after the route already failed. Disabling the offline queue removes that queued-command case.
An in-flight disconnect remains ambiguous because Redis may have executed the command before the reply was lost; it
is never retried, and the callback denies whether the record remains or was consumed.
`redis` is a platform-node peer (`>=5 <7`), and the current lock resolution of 6.3.0 is not a substitute for a direct
runtime declaration. Redis 8.10.2 in Compose supports `GETDEL`.

**Alternatives considered**: Direct node-redis calls would spread the platform peer API. A new generic application
Redis service would duplicate Effect's service. `effect/persistence/Persistence` does not express atomic one-time
consume directly. In-memory production storage cannot recover across instances. Cookie-only context would expose the
verifier and provider transaction material to the browser.

**Declaration gate**: Exact tag source was inspected at `effect@4.0.5` in
[`packages/platform/node/src/NodeRedis.ts`](https://github.com/Effect-TS/effect/blob/effect%404.0.5/packages/platform/node/src/NodeRedis.ts)
and
[`packages/effect/src/persistence/Redis.ts`](https://github.com/Effect-TS/effect/blob/effect%404.0.5/packages/effect/src/persistence/Redis.ts),
and at `redis@6.3.0` in
[`packages/client/lib/client/index.ts`](https://github.com/redis/node-redis/blob/redis%406.3.0/packages/client/lib/client/index.ts).
They establish the Layer option pass-through, pre-enqueue `disableOfflineQueue` rejection, generic `Redis.send`
limitation, reconnect behavior, disconnect queue flushing, and error mapping above. The implementation checkout must
still install its lock and verify those same installed declarations, the NodeRedis barrel/Layer result, Layer
composition, and final type graph before coding; do not substitute the ahead-of-pin Effect checkout.

## 4. Store a short-lived attempt; give the browser only opaque correlation

**Decision**: Generate a distinct 32-byte base64url correlation reference. Persist a versioned Schema-encoded attempt
under the configured `OIDC_TX_KEY_PREFIX` before returning the provider redirect. Derive its storage address from the
canonical tenant alias, opaque correlation, and expected OIDC state using an unambiguous encoding or digest. The
record contains only the tenant/provider/return binding, state, nonce and PKCE verifier required to validate one
callback. It contains no token, resolved client credential or application-session identity. Use a default 600-second
transaction lifetime. An absent `OIDC_TX_TTL_SECONDS` uses 600; an explicit override must be a base-10 integer from
1 through 600 inclusive, so it may shorten but never extend the selected lifetime. Decode it once at Layer acquisition
and convert to Redis milliseconds only after validation; the maximum is exactly 600,000, safely within integer and
Redis PX bounds. Zero, negative, fractional, nonnumeric, greater-than-600, and overflow-shaped input fail process
readiness without echoing the value. Store both an explicit application-clock expiry and a Redis TTL. This transaction
lifetime is a recovery/security bound and is unrelated to #158's `auth_time` comparison or clock-tolerance policy.

The route writes only the opaque reference in a host-only cookie: no `Domain`, `HttpOnly`, `SameSite=Lax`,
`Path=/auth/callback`, `Max-Age` aligned with the attempt, and `Secure` except for the explicitly permitted loopback
HTTP profile. Clear it on every callback response that can address it. Possession locates an attempt but never proves
state, nonce, provider evidence, identity or access.

**Rationale**: Redis TTL provides server-clock cleanup and cross-instance availability. Explicit expiry checked with
the Effect clock fails closed if stale bytes remain and makes service behavior deterministic under `TestClock`.
`SET NX` prevents replacement of one existing qualified tenant/correlation/state address. If create reports a
collision, discard the complete prepared attempt and regenerate correlation, OIDC state, nonce, PKCE verifier, and
provider destination within a bounded parent-owned retry before exposing any redirect or cookie. Exhaustion fails
preparation; it never overwrites the reserved record. A test proves the original valid callback remains usable. This
does not claim global correlation uniqueness: addresses with different state or tenant may legitimately differ.
A separate reference keeps provider-visible state distinct from application correlation; both values plus the
independently resolved tenant are required to address the attempt.

**Alternatives considered**: State alone as the cookie/key would collapse two independent bindings. A signed or
encrypted browser transaction would add key rotation and put more context in the browser without a requirement.
Persisting tokens or resolved secrets would widen the sensitive-data surface. An unbounded or application-session-
lifetime attempt contradicts short-lived single use.

## 5. Validate the callback address before consume; never retry an ambiguous consume

**Decision**: Callback processing first validates the request boundary without touching transaction storage. It
independently resolves the canonical tenant, validates the exact current authority against that tenant's registered
callback authority, preserves and validates query multiplicity, requires exactly one well-formed `state`, validates
the opaque correlation syntax, and rejects mixed or malformed success/error shapes. Only then does it derive the
tenant/correlation/state storage address and atomically `GETDEL` that record. A wrong tenant or authority, invalid
correlation, or missing/duplicate/wrong state therefore cannot consume the valid attempt stored at its original
address.

After consume, the owner Schema-decodes the record, checks explicit expiry and every tenant/provider/return binding,
then performs provider validation. A matching success or error/cancellation response has crossed the addressing
boundary and consumes once; provider refusal, code exchange failure, or later signed-evidence failure burns that
one-time attempt. Malformed stored bytes are consumed and rejected. Missing/expired/replayed attempts share a safe
no-handoff outcome.

Do not add an application timeout around `GETDEL` or retry it after an ambiguous Redis transport failure: the pinned
generic Redis service cannot pass a cancel signal or safely prove removal from node-redis's command lifecycle. A
command rejected before send while disconnected/reconnecting is typed unavailable and cannot execute later because
the offline queue is disabled. A command already sent when the connection drops may have consumed the record; deny
without retry. After reconnection, only a later new request may issue a new command. If an initiation write succeeds
but its response is lost, issue neither redirect nor cookie; the unreachable record expires normally.

**Rationale**: Address validation before `GETDEL` prevents an unqualified cross-tenant or forged-state request from
destroying a legitimate login. Consumption before exchange still gives at-most-once recovery under races across
instances. Safe denial is more important than differentiating missing, expired and replayed state to the browser.
Schema decoding treats Redis bytes as untrusted at their actual persistence boundary.

**Alternatives considered**: Correlation-only addressing allows a wrong tenant or wrong state to burn a valid
attempt. Full provider validation followed by deletion permits concurrent recovery. Retrying an ambiguous consume
could disguise the result and does not restore one-time state. An Effect timeout around the generic `send` Promise
could return while uncancelled work later executes, so it is not a valid availability bound. Returning raw Redis or
decoding failures would leak internal data and couple the route to storage.

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
`clientSecretRef` to secret values. Decode it exactly once at credential Layer acquisition. An absent variable becomes
an empty map. An explicitly supplied malformed value, including invalid JSON or an invalid map entry, fails whole-
process readiness through a generic configuration error that cannot reproduce the source. Public clients use OIDC
`None` and need no selected secret even when the decoded map is empty. A confidential tenant with a selected nonempty
reference resolves it per request; when that reference is absent from the valid map, the request fails with generic
`AuthenticationUnavailable`, not tenant fallback or process failure. Valid secrets remain private and server-only.

**Rationale**: This realizes PREETS-SECURITY-001 without changing tenant files or diagnostics. It distinguishes
malformed process configuration, whose startup blast radius is the whole frontend instance, from a valid map that
lacks one tenant-selected reference, whose blast radius is one authentication request. The process provider is the
narrow current implementation; future cloud infrastructure can replace it behind the private resolver without
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

The browser necessarily delivers `code`, `state`, or provider error parameters in the inbound callback URL. Consume
them as request input, then never copy them into application response bodies, response headers or redirect locations,
cookies, diagnostics, retained application state, or application-controlled telemetry. BDD may capture its own
inbound URL transiently to construct a negative request, but asserts non-re-emission only from application output.

**Rationale**: Route Handlers own response cookies and headers without starting another runtime. A 204 gives the
intermediate slice an observable successful callback boundary without exposing identity; #218 replaces this temporary
mapping with session creation. Existing comprehensive callback/error presentation remains #154.

**Alternatives considered**: Server Components cannot write/delete cookies. A second internal cookie-setting hop adds
another recoverable state transition. Returning identity JSON or putting it in a redirect/query leaks trusted data.
Redirecting both success and denial to the same page would make the actual callback success unobservable.

## 9. Expose one parent-owned deterministic construction seam

**Decision**: `authentication.ts` exports a test-only parent factory that returns an `AuthenticationService` Layer
from one closed `AuthenticationTestOptions` ordinary-value bundle. The bundle admits only current platform inputs:
deterministic tenant/configuration and credential values, clock/random inputs, a generic Redis Layer, and an optional
controlled HTTP transport. It does not expose private child Context services, stored-attempt types, codecs, keys, or
provider results. The parent factory composes the real transaction, credential and provider children internally; a
controlled transport therefore still traverses openid-client and the real provider child instead of injecting a
prepared identity.

For integration setup that must create a qualified-address collision or malformed Redis value, the same parent entry
returns a strictly fixture-scoped handle that can seed bytes or reserve one semantic address within the caller's
unique prefix. Those operations are setup/diagnostic support only: tests assert the resulting public service outcome
and never treat key format, encoded bytes, or fixture inspection as a product contract. External tests import
`authentication.ts`, not `authentication/*`; ordinary production consumers receive only the service and current
public value types.

**Rationale**: The seam makes deterministic semantic evidence possible without breaking recursive ownership. It
also distinguishes a controlled transport around the real protocol child from a stubbed identity, and keeps raw
Redis fixture needs behind the owning parent.

**Alternatives considered**: Exporting private Context services or importing child files from external tests breaks
recursive module isolation. Injecting a completed provider result would bypass the protocol boundary. Asserting raw
Redis layout would turn a fixture mechanism into a product promise.

## 10. Separate service, real-adapter, framework and workflow evidence

**Decision**: Test the real `AuthenticationService` through its public parent factory with a fresh deterministic
world for every case. Use properties for binding invariants and named examples for protocol boundaries. Use real
Redis with two independent scoped client/service graphs for cross-instance, TTL and race claims. Use ordinary Vitest
for Next adapter mapping. Use requirements BDD only for actual HTTP/browser outcomes and real Keycloak completion;
BDD never connects to Redis or imports private modules. Keep log/span/exporter/secret-in-log inspection manual.

**Rationale**: Deterministic services prove the contract in supplied worlds; only Redis proves real atomicity/expiry;
only the OIDC client and real provider prove protocol completion; only HTTP/browser evidence proves route/cookie and
visible outcomes. No one layer is asked to prove another's mechanics.

**Alternatives considered**: In-memory stores cannot prove cross-instance atomicity. Mocked callback identities cannot
replace real Keycloak completion. Browser scenarios that inspect Redis or private JSON would bind requirements to an
implementation. Durable telemetry assertions violate repository policy.

## 11. Extend the existing BDD harness without changing browser authority

**Decision**: Give each scenario a unique `OIDC_TX_KEY_PREFIX`, spawn two independently running production Next
processes when cross-instance evidence needs them, and keep one exact registered tenant public authority throughout
the browser round trip. Extend the owned proxy to route `/`, `/auth/login`, and provider departure to instance A,
then route `/auth/callback` for that same authority to independently composed instance B by path/phase. Both processes
receive the same Host; Keycloak remains the external provider authority. Add harness evidence that A's host-only,
callback-path cookie reaches B and is not sent when the browser addresses a different tenant authority. Automate the
tracked Keycloak `demo` login only for real completion. Capture callback URL/correlation at the HTTP/browser boundary
for mismatch, expiry, replay and racing requests; do not read Redis in Cucumber steps.

The callback feature remains feature-level `@partial` with current lowercase requirement IDs. Real Keycloak proves
the common successful completion path. Focused controlled-transport public-service tests cover signature/audience/
nonce/claim failures that the tracked provider cannot safely synthesize; they supplement rather than replace the real
completion scenario. Missing signed `auth_time` is rejected at the service boundary and, if the tracked Keycloak
profile can produce a standards-valid no-`auth_time` response without a mock provider, may also receive HTTP/browser
evidence; the plan does not weaken the claim or fabricate provider behavior when it cannot.

A cancellation is called real Keycloak cancellation only when the provider UI actually emits the error callback.
Otherwise the HTTP scenario is named an application-handled controlled provider-error callback at the real public
boundary, and the validation record lists real-provider cancellation as unexecuted.

**Rationale**: The harness already separates logical callback authority from random transport ports. Path/phase
routing under one authority produces genuine cross-instance HTTP evidence without weakening the host-only cookie.
Product assertions stay in steps; readiness and process management stay in support/CI.

**Alternatives considered**: Sticky sessions evade the requirement. A mock identity provider cannot establish real
completion. Reading Redis from BDD would move the observation below the application boundary. Skipping scenarios under
`@partial` is forbidden.

## 12. Treat Redis acquisition as process readiness

**Decision**: Redis is required for process readiness in this slice. The existing `src/instrumentation.ts` import
boots the one shared `ManagedRuntime`, whose boot effect resolves its Layers; failure to acquire `NodeRedis.layer`
prevents that process from becoming ready or serving any route.
The launcher/orchestrator must keep the instance out of service and restart/recreate it after Redis connectivity is
restored. Only Redis command failures after successful startup map to typed authentication unavailability at
`/auth/login` or `/auth/callback`; the design does not claim unrelated public routes survive initial Redis failure.

After readiness, the node-redis client may reconnect, but `disableOfflineQueue: true` makes a new command submitted
while disconnected/reconnecting reject before send; it maps to typed unavailability and is not executed after
recovery. A command whose connection fails after it was sent is ambiguous, is not retried, and may have consumed the
attempt. A later new request may succeed after the client emits ready again. There is no application `GETDEL` timeout
because the pinned generic service cannot safely cancel its underlying Promise.

The readiness/startup evidence starts a production frontend with Redis unreachable and proves the process never
passes its existing port/readiness gate, then restores Redis and starts a fresh process successfully. Runtime evidence
separately interrupts Redis after readiness and proves authentication routes fail closed without handoff or session.
The blast radius of initial acquisition failure is the whole frontend process because the shared runtime is a host
dependency; healthy sibling instances remain independently serviceable.

Credential and TTL configuration joins this startup boundary. An explicitly malformed `OIDC_CLIENT_SECRETS_JSON` or
an explicit invalid `OIDC_TX_TTL_SECONDS` prevents readiness without echoing its value. An absent credential map is a
valid empty map, and a valid map missing one confidential tenant's selected reference affects only that request.

Mixed-version rollout is safe but may interrupt in-flight login: the predecessor does not create a recoverable key or
cookie, while the new version uses a versioned record and derived address. An old callback cannot complete a new
attempt, and a new callback denies an old attempt. Rollback leaves only short-lived versioned keys and host-only
callback-path cookies; neither grants identity or access, unknown/missing records fail closed, and both expire within
the bounded attempt lifetime. Roll forward or rollback requires no data migration.

**Rationale**: This matches eager scoped Layer acquisition and states its true blast radius instead of promising
route-level degradation before a runtime exists. Short-lived, non-authoritative attempt data makes restart and
rollback safe.

**Alternatives considered**: A lazy reconnectable resource could preserve public routes during initial outage but
adds lifecycle and state machinery not required by #217. Pretending eager `NodeRedis.layer` is lazy would make the
availability contract false.

## 13. Validation and known limits

**Decision**: Validate focused service/adapter tests, full frontend Vitest, Gherkin lint/format/discovery, production
requirements BDD, and repository typecheck/build/lint/unused/format gates. BDD inspects application response output,
not absence of protocol parameters from its own inbound callback URL. Use manual ad hoc inspection for application-
controlled logs, spans, exporter data, retained state, and secret handling. Record revision, Keycloak version, two-
instance arrangement, Redis version, and limitations.

**Limits retained by design**: Keycloak evidence does not establish Microsoft or broker compatibility. Real provider
cancellation remains unexecuted unless the Keycloak UI actually emits it. Confidential
client protocol behavior has focused controlled evidence unless a real confidential integration is available. #218
still owns the application session; #154 owns complete application integration/presentation; #158 still owns stale
`auth_time` comparison, tolerance and unsupported-provider policy. No static check is runtime proof.
