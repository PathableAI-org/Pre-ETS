# Implementation Plan: Validate the OIDC callback

**Branch**: `155-validate-oidc-callback` | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)

**Input**: #217 / S2-C on `origin/main` `b514237d5ffc49180ad683a5cfe77b808cc19c5c`; the delivered
#216 initiation boundary and current PREETS-SESSION-002, PREETS-SESSION-003, PREETS-SECURITY-001 and
PREETS-SESSION-013 contracts.

**Design artifacts**: [research](research.md), [data model](data-model.md),
[module contracts](contracts/modules.md), [HTTP/browser contract](contracts/callback.md), and
[validation quickstart](quickstart.md).

## Summary

Make each tenant-bound OIDC attempt recoverable across independently running frontend instances, give the browser
only an opaque correlation cookie, and atomically consume the short-lived attempt only after the callback's canonical
tenant, exact authority, query shape, singular state, and correlation form qualify its derived storage address.
The existing public authentication module orchestrates private transaction, credential and provider children. Its
production Layer uses the scoped `@effect/platform-node/NodeRedis` adapter behind `effect/persistence/Redis`, while
the provider child uses openid-client to validate the response, code exchange, issuer, audience, signature, nonce,
subject and signed `auth_time` presence. Success is a provider-neutral trusted tenant/user handoff; it is not an
application session or authorization grant.

Replace the login and callback pages with Node Route Handlers so initiation can set and callback can clear the
correlation cookie through the one shared `ManagedRuntime`. Revise initiation BDD and add feature-level `@partial`
callback BDD at the real HTTP/browser boundary. Real Keycloak completion must keep one registered tenant authority
while a path/phase proxy sends initiation to app instance A and callback to B. The browser observes only the empty
validated-success 204, cleared correlation, and absence of session/protected content; exact trusted identity fields
are public-service evidence. Back that composite claim with parent-constructed public-service properties and named
protocol tests, a real two-client Redis integration suite, and focused route tests. Keep durable evidence on
application outcomes, never observability payloads or private Redis representations.

## Technical Context

**Language/Version**: Strict TypeScript 6.0.3; private ESM frontend; Node 26-compatible runtime.

**Primary Dependencies**: Existing Next.js 16.4.2, React 19.3.1, Effect and `@effect/platform-node` 4.0.5,
`@effect/vitest`, openid-client 6.8.8 and PathAble React. Add exact `redis@6.3.0` as a direct frontend dependency
because it is a platform peer. Use `@effect/platform-node/NodeRedis` to provide `effect/persistence/Redis`; do not
invent another generic Redis abstraction.

**Storage**: Redis 8.10.2 in the tracked Compose stack. Store one versioned Schema-encoded authentication attempt
under `OIDC_TX_KEY_PREFIX` at an address derived from canonical tenant alias, opaque correlation, and OIDC state with
`SET ... NX PX`; atomically consume it with `GETDEL` only after callback-address validation. Default lifetime is 600
seconds, with a validated positive `OIDC_TX_TTL_SECONDS` override for isolated runtime evidence. No process-memory
fallback, token/secret/session persistence, or browser-serialized attempt.

**Testing**: Vitest/`@effect/vitest` public-service and property tests built through one parent-exported closed test
factory; real Redis integration with independently scoped client/service graphs; ordinary Next adapter tests;
Cucumber/Playwright requirement BDD with real Keycloak and two production Next instances behind one registered
authority. TestClock covers application-clock boundaries; Redis server time covers actual TTL. Startup evidence
proves initial Redis acquisition gates process readiness. Manual probes cover logs/OTel only.

**Target Platform**: Existing Next Node server; Compose Redis 8.10.2 and Keycloak 26.8.1; existing production BDD
profile and CI service topology.

**Project Type**: Frontend authentication orchestration, persistence adapter, Node HTTP routes, and requirements BDD.

**Performance Goals**: No new product SLO. Keep the existing bounded provider-operation deadline; callback storage
uses one atomic consume round trip and no application retries after an ambiguous consume. Transaction lifetime is a
security/recovery bound, not a response-latency claim.

**Constraints**: Preserve recursive module isolation, one host-owned ManagedRuntime, Effect interruption/defect
semantics, tenant 404/500 distinctions, private/no-store responses, server-only confidential credentials, no session
creation/protected access, no invented `auth_time` staleness threshold, and no BDD inspection of Redis or private
modules. Initial NodeRedis Layer acquisition is a fail-fast dependency of whole-process readiness; only post-start
command failures are route-level authentication unavailability. `packages/frontend/node_modules` is absent during
planning, so implementation must verify installed 4.0.5 declarations rather than assuming ahead-of-pin local APIs.

**Scale/Scope**: Two distinguishable tenants, public and confidential client contract paths, multiple frontend
instances sharing one Redis namespace, and one-time callback races. Runtime provider evidence is Keycloak only.
Microsoft/broker compatibility, #218 application sessions, full #154 integration and #158 freshness comparison stay
outside this increment.

## Constitution Check

Pre-design and post-design gates pass:

| Principle | Assessment |
| --- | --- |
| I. Evidence-grounded scope | Current `origin/main` requirements and the accepted S2-C delivery boundary govern. The design validates signed `auth_time` presence but deliberately leaves staleness/tolerance to #158. |
| II. Ownership | Frontend owns tenant OIDC and attempt state. `authentication.ts` stays the public owner; #218 retains application sessions and backend scope is unchanged. |
| III. Tenant isolation | Callback independently resolves its host tenant and validates exact authority, query shape, singular state and correlation before deriving the tenant/correlation/state address. Wrong-tenant/state requests cannot consume the valid attempt; no query/fallback tenant is trusted. |
| IV. Accessible SSR | Public login/callback remain server-side HTTP boundaries. Existing public failure/missing presentation remains the user-visible outcome; no client UI or accessibility workaround is introduced. |
| V. Meaningful tests | Each claim is assigned to its strongest responsible boundary: public service, real Redis, actual Next adapter, or real Keycloak HTTP/browser flow. BDD is tagged/current/partial and telemetry remains manual. |
| VI. Simplicity/quality | Reuse Effect's scoped Redis service and the existing shared runtime. Add one direct peer dependency and one private credential boundary with a real consumer; avoid speculative services, vendor SDKs and redundant runtimes. |

The scoped resource Layer, short-lived persisted record and two-instance harness are essential to the accepted
cross-instance/atomic requirements, not generalized infrastructure. No constitution violation requires a complexity
exception.

## Project Structure

### Documentation (this feature)

```text
specs/008-validate-oidc-callback/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/{callback,modules}.md
└── checklists/requirements.md
```

No `tasks.md` is generated by planning.

### Source code (proposed implementation)

```text
packages/frontend/
├── package.json
├── src/
│   ├── app/auth/login/{page.tsx → route.ts}
│   ├── app/auth/callback/{page.tsx → route.ts}
│   └── lib/
│       ├── authentication.ts
│       ├── authentication/
│       │   ├── config.ts
│       │   ├── credentials.ts
│       │   ├── provider.ts
│       │   ├── transaction.ts
│       │   └── transaction/{codec,store}.ts
│       └── runtime.ts
├── tests/
│   ├── lib/authentication.test.ts
│   ├── integration/authentication-redis.test.ts
│   └── unit/authentication-entry.test.ts
tests/bdd/
├── requirements/{tenant-oidc-initiation,tenant-oidc-callback}.feature
├── steps/
└── support/{server,world}.ts
.github/workflows/ci-bdd.yml
README.md
docs/authentication.md
```

**Structure Decision**: Keep one recursive authentication owner. The public parent alone imports the private
config, credential, provider and transaction children; only transaction imports its codec/store descendants. Sibling
children do not reach into one another. Runtime, routes and external tests import the parent. Re-export only current
consumer types plus one closed parent-owned test factory. That factory composes private children from ordinary test
options without exporting their Context services; external tests never import `authentication/*`. The Layer
composition remains in `runtime.ts`, which owns the sole `ManagedRuntime` and hides the scoped NodeRedis requirement.
Do not create a runtime per request or expose provider/store mechanics.

## Implementation Sequence

### 1. Verify pinned surfaces and declare the runtime peer

Install the locked workspace and inspect exact installed Effect 4.0.5, openid-client 6.8.8 and Next 16.4.2
declarations listed in the quickstart. Add exact `redis@6.3.0` to frontend dependencies and update the root lockfile.
Confirm `NodeRedis` supplies the generic persistence Redis service with scoped connect/close behavior and that raw
`SET NX PX`/`GETDEL` commands are representable. If exact declarations contradict this plan, stop at the narrow
contract mismatch rather than importing from the local ahead-of-pin checkout or building a parallel service.

### 2. Add private recoverable transactions and confidential credential resolution

Under the authentication owner, define the versioned attempt and correlation Schemas and the private transaction
capability. Generate a distinct 32-byte base64url reference and derive the storage address from the canonical tenant
alias, correlation, and expected OIDC state with an unambiguous encoding or digest. Encode once, create with
`SET NX PX`, and consume with one `GETDEL`. Use the configured prefix and TTL; validate environment configuration at
the runtime boundary. Check explicit expiry with the Effect clock after Schema decoding. Consume corrupt or expired
records without restoration. Never retry an ambiguous consume and never fall back to memory.

Add the narrow server-only credential child for the existing public/confidential tenant contract. Schema-decode a
vendor-neutral `OIDC_CLIENT_SECRETS_JSON` map and resolve only a selected configured reference. Keep secret values out
of attempt records, public service values, errors, diagnostics and browser output. Do not add a general secrets
platform, vendor SDK or new tenant-file secret field.

Build `NodeRedis.layer` eagerly at the host boundary and supply it privately into authentication using Layer
composition. Keep resource acquisition/release in Layers and retain exactly one application ManagedRuntime. Initial
acquisition is forced by the existing `src/instrumentation.ts` runtime import and runtime boot effect that resolves
the Layers. Failure prevents process readiness and all route serving; the launcher restarts/recreates the process
after Redis recovers. Only Redis command failures after successful startup become typed route-level authentication
unavailability.

### 3. Evolve provider preparation and callback validation behind the public parent

Change preparation so its public result has provider destination, opaque correlation and aligned expiry while the
provider child privately returns state, nonce and verifier needed for persistence. Persist before returning success.
Continue discovery/URL/redirect/loopback policies and the existing enclosing provider deadline/interruption behavior.

Add public completion. Before storage, independently resolve the callback host tenant; require the exact registered
callback authority; preserve and validate query multiplicity; require one well-formed `state`; validate correlation
syntax; and reject malformed or mixed success/error shapes. Derive the address from canonical tenant, correlation,
and state, then atomically consume/decode/check the attempt and compare tenant, integration, client, issuer and return
bindings before provider completion. Wrong tenant/authority, missing/duplicate/wrong state, and malformed query shape
cannot address or consume the valid original. A matching success or provider error/cancellation consumes once; later
provider refusal, exchange, or signed-evidence failure leaves the attempt burned.

Call `authorizationCodeGrant` with PKCE verifier, expected state, expected nonce and required ID token. Accept claims
only after library response/exchange/signature/issuer/audience/nonce validation, then Schema-require nonempty `sub`
and integer signed `auth_time`. Do not pass a new `maxAge` comparison or define clock tolerance. Project only tenant,
issuer, subject and authentication time into `TrustedIdentity`; no tokens/raw claims/session/access.

Use consumer-inward Effect design throughout: readonly public interface, typed expected errors and requirements,
named `Effect.fn` at useful public boundaries, `Effect.fnUntraced` for meaningful reusable private helpers, inline
`Effect.gen`, and `return yield*` terminal failures. Preserve interruption and defects.

### 4. Make login/callback HTTP adapters own correlation cookies

Replace each same-segment Server Component with a Node Route Handler. Login runs `prepare` through the shared runtime,
then returns the existing 307 provider redirect with a host-only, HttpOnly, SameSite=Lax, callback-path cookie whose
Max-Age matches attempt TTL and whose Secure setting follows the explicit loopback exception. Emit neither on failed
preparation. Preserve tenant 404/500, safe sign-in failure and private/no-store behavior.

Callback passes host, exact query representation and cookie to `complete`, and clears the cookie on all addressable
outcomes. Map trusted identity to the bounded empty 204 response with no session/protected content. Map
expected denial or post-start operational unavailability to the safe public sign-in failure without restarting
login; retain tenant 404/500. This mapping does not apply when initial NodeRedis acquisition prevented the process
from becoming ready. Keep Next navigation semantics outside broad catches. Do not expose identity or callback
material in bodies/URLs.

### 5. Build durable semantic evidence below BDD

Export one test-only parent factory from `authentication.ts`. It accepts a closed ordinary-value options bundle for
current platform inputs (deterministic tenant/configuration and credential values, clock/randomness, generic Redis
Layer, and optional controlled HTTP transport), then composes the real private transaction, credential and provider
children. It never exports a child Context service, stored-attempt/codec/key type, or injectable prepared identity.
External tests import the parent, never `authentication/*`; controlled transport still exercises openid-client and
the real provider child.

Public-service tests construct the real exported AuthenticationService with a fresh parent-created world per
scenario and assert trusted handoff or typed denial/unavailability outcomes. They do not call private helpers or
assert serialized representation. Define properties for tenant/attempt/provider binding, correlation opacity and
the at-most-one safety invariant; retain named examples for duplicate/malformed callback parameters and each
protocol failure. Prove exact tenant/issuer/subject/`auth_time` only here, not by inspecting the HTTP 204. Prove that
wrong tenant, authority, or state and malformed/missing/duplicate state deny without consuming the later valid
callback.

The real Redis integration uses two independently scoped NodeRedis/service/runtime graphs sharing only Redis and a
unique test prefix. Prove A-create/B-consume, `SET NX`, a healthy race with exactly one successful winner and every
other consumer denied, replay, wrong-tenant/state non-consumption followed by valid consumption, corrupt-record
denial and server-clock TTL. Retain at-most-one only as the safety invariant under arbitrary failure. For collision or
corrupt-byte setup, use a strictly fixture-scoped handle returned by the parent factory within that unique prefix;
fixture manipulation supports setup/diagnosis only and raw keys/bytes never become product assertions. Use Effect
TestClock separately for explicit application expiry. For server expiry, use a short TTL and bounded `PTTL`/`EXISTS`
polling only as fixture synchronization, then assert the public outcome; avoid broad flushes and fixed sleeps.

Controlled OIDC transport at the public service boundary covers focused signature/issuer/audience/nonce/exchange/
claim failures through the real provider child, but never substitutes for real Keycloak completion. Route tests cover
real response status/redirect, cookie attributes/clearing, pre-storage authority/query/state rejection, caching,
tenant failures and no session/protected output without asserting implementation calls.

### 6. Revise and extend requirements-backed BDD

Use the repository requirements-BDD author, scaffold and review workflows against then-current `origin/main`.
Revise `tenant-oidc-initiation.feature` so opaque recovery correlation is allowed while it still proves no application
session or protected content. Add `tenant-oidc-callback.feature` with feature-level `@partial` and lowercase current
requirement tags.

Extend the harness with a unique transaction prefix and two production Next processes. Keep one exact registered
tenant public authority for the complete browser round trip. Route `/`, `/auth/login`, and provider departure to A,
then route `/auth/callback` on that same authority to independently composed B by path/phase; both receive the same
Host and Keycloak remains external. Add harness evidence that A's host-only callback-path cookie reaches B and is not
sent to another tenant authority. Automate the tracked real Keycloak login and traverse the actual callback; do not
inject a prepared identity or mock callback. Capture only browser/HTTP callback artifacts for mismatch, expiry,
replay and racing requests. Cucumber never reads Redis or imports private modules. Dry-run is discovery only.

Scenarios observe real completion as an empty 204 with cleared correlation and no session/protected content;
cross-tenant/transaction mismatch; missing/invalid/expired recovery; first consumption plus replay; a healthy
concurrent callback race with exactly one 204 winner and all others denied; and an application-handled controlled
provider-error callback. The tracked Keycloak common success proves provider completion. Call a cancellation real
Keycloak cancellation only if its provider UI actually emits it; otherwise record real-provider cancellation as
unexecuted. Exact trusted tenant/issuer/subject/`auth_time` remains public-service evidence, not data observed through
the 204. Where the realm cannot safely synthesize invalid signed evidence or missing `auth_time`, retain exact focused
public-service evidence and explicitly report the BDD limit rather than fabricating provider behavior or weakening
the scenario claim.

### 7. Validate and document bounded evidence

Run focused/full tests, BDD format/lint/discovery then production runtime, and repository typecheck/build/lint/unused/
Fallow/format gates from the quickstart. Update frontend/authentication/BDD documentation with Redis, Keycloak,
credential-map and two-instance prerequisites without publishing secret values. CI starts/waits for tracked Redis and
Keycloak and supplies scenario-owned configuration.

Add implementation-time readiness evidence for the chosen fail-fast contract: with Redis unreachable, a fresh
production process must not pass its existing port/readiness gate or serve routes; after Redis recovery, a newly
started process becomes ready. Separately interrupt Redis after readiness and prove authentication routes return the
safe typed-unavailability mapping with no handoff/session. Document that initial failure affects the whole process,
healthy sibling instances remain usable, and recovery requires restart/recreation.

Document mixed-version rollout and rollback: old initiation cannot be completed by the new callback, and new
attempts cannot complete through the old callback, so in-flight login may be denied but never accepted incorrectly.
New records are versioned and short-lived; rollback leaves only expiring keys and host-only callback-path cookies,
which confer no identity/access and require no migration.

Manually inspect actual logs and exported OTel only as ad hoc runtime verification. Do not retain log/span/telemetry/
exporter or secret-text assertions. Report exact revision/topology and state that Keycloak is the only executed real
provider, Microsoft/broker and possibly real confidential-provider behavior are unexecuted, #218 session creation and
#154 full integration remain absent, and #158 comparison/tolerance remains unresolved.

## Semantic Evidence Map

| Requirement / BDD claim | Strongest supporting lower boundary | Limitation |
| --- | --- | --- |
| Initiation creates recoverable safe correlation, not a session | Public AuthenticationService plus login Route Handler test | Does not prove provider completion |
| Real tenant callback begun on A completes on B | One-authority, path/phase-routed HTTP/browser BDD proves 204/cookie clearing/no session; public service proves exact identity; real Redis proves cross-instance recovery | Composite evidence; Keycloak only; Microsoft/broker unexecuted |
| Tenant/state/attempt/provider/return mismatch never hands off or burns valid state | Public-service binding properties and later-valid callback; real Redis wrong-address then valid-consume case; bounded HTTP/browser mismatch scenario | Properties use controlled dependencies, not another real provider |
| Missing, invalid and expired recovery deny | Public-service named cases; real Redis server-TTL integration; HTTP/browser scenarios | BDD does not inspect Redis; expiry timing is bounded harness behavior |
| Replay and concurrent callbacks select one winner | Healthy real Redis two-client race and callback HTTP race each require exactly one winner plus denial of all others; failure properties retain at-most-one | Not a throughput/load guarantee |
| Provider error/cancellation burns attempt and denies | Public-service protocol cases; controlled provider-error callback at public HTTP boundary; real Keycloak cancellation only if UI emits it | Controlled error is not provider-produced cancellation; real cancellation may remain unexecuted |
| Issuer/audience/signature/nonce/exchange/required claims are trusted | openid-client through public-service controlled transport plus real Keycloak common completion | Not every invalid token can safely be produced by tracked Keycloak |
| Signed `auth_time` is present | Real Keycloak success plus focused missing-claim rejection | No staleness comparison/tolerance; exact missing claim may lack real-provider BDD |
| Confidential credential remains server-only | Public-service confidential path and HTTP non-disclosure outcomes; manual runtime inspection | Real confidential provider unexecuted unless separately configured |
| Success creates no app session or protected access | Callback Route Handler test and HTTP/browser BDD | #218 owns session creation; #154 owns complete presentation |
| Initial Redis outage prevents readiness; post-start outage fails auth closed | Production-process readiness probe plus post-readiness route evidence | Initial blast radius is the whole process; restart/recreation is required |
| Logs/traces do not expose sensitive values | Manual/ad hoc inspection of actual runtime/exported data | No durable telemetry assertion by policy |

## Complexity Tracking

No constitution violation requires justification.
