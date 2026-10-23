# Tasks: Validate the OIDC callback

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md),
[module contracts](contracts/modules.md), [HTTP/browser contract](contracts/callback.md) and
[quickstart.md](quickstart.md).

**Branch**: `008-validate-oidc-callback-impl`, stacked on PR #234 · **Delivery**: #217 / S2-C ·
**Design revision**: `0908f3d`

**Status**: In progress. Completed tasks are checked below; five bounded evidence tasks remain open.

**Tests**: Explicitly requested by FR-012, FR-013 and the plan's evidence map. Write the relevant tests and
Gherkin before the production behavior they protect, observe a meaningful failure, then make them pass. Red
states are local construction states; repository checks must pass before committing a completed logical group.
Prefer properties for binding and at-most-one invariants. Keep healthy races and discrete protocol outcomes as
named examples. Durable tests assert application outcomes, never logs, spans, telemetry payloads, exporter
behavior, Redis key layout or private module internals.

**Scope**: Make a tenant-bound OIDC attempt recoverable across frontend instances, give the browser only an
opaque correlation cookie, and atomically consume that attempt only after callback qualification. Success is a
provider-neutral trusted identity handoff mapped to an empty HTTP 204. It is not an application session and
does not grant protected access. #218 owns session creation. #154 owns complete callback presentation. #158
owns `auth_time` comparison, clock tolerance and unsupported-provider policy. Microsoft and broker-chain
execution stay unexecuted. Do not add a parallel Redis client, a general secrets platform, or a second runtime.

## Format and execution conventions

`- [ ] Tnnn [P?] [USn?] Action with exact paths`

- Paths are repository-relative. New paths are intentional; do not create unrelated scaffolding.
- `[P]` means the task can start with the other `[P]` tasks in the same phase after that phase's entry gate.
  It does not authorize concurrent edits to the same file.
- Only `packages/frontend/src/lib/authentication.ts` imports `authentication/config.ts`,
  `authentication/credentials.ts`, `authentication/provider.ts` and `authentication/transaction.ts`. Only
  `authentication/transaction.ts` imports `authentication/transaction/codec.ts` and
  `authentication/transaction/store.ts`. Runtime, routes and tests import the parent, never `authentication/*`.
- Before Effect changes, read `docs/engineering/effect-guidance.md`, `packages/frontend/AGENTS.md`, the
  available Effect v4 checkout's `LLMS.md` and the linked examples that match the task. Installed locked
  declarations govern APIs. Use `Effect.fn` for public `prepare` and `complete`, `Effect.fnUntraced` for
  reusable private helpers, `Effect.gen` for inline orchestration, and `return yield*` for terminal failures.
  Do not translate defects or interruption into denials.
- Before tests, read `docs/engineering/testing/README.md` and, for properties,
  `docs/engineering/testing/property-based-testing.md`. Requirements BDD uses `requirements-bdd-author`,
  `requirements-bdd-scaffold` and `requirements-bdd-review`. Refresh the applicable requirements from current
  `origin/main`. Feature-local FR IDs are not Gherkin tags. Keep feature-level `@partial`. Do not skip
  scenarios because they are partial, and leave no undefined steps at completion.
- Before changing the existing denial presentation that uses `@pathableai/react`, read the installed package's
  `agent-guidance/pathable-react/SKILL.md` and the linked reference for that composition. Do not invent a
  replacement component.
- Observability is a manual log and exported-OTel inspection. Do not add durable telemetry assertions.
- Do not disable ESLint, TypeScript, Fallow or any other check.

## Phase 1: Setup

**Purpose**: Confirm the accepted baseline and own the Redis peer before any callback behavior is added.

- [X] T001 Refresh `origin/main` and re-read [PREETS-SESSION-002](../../docs/requirements/session/PREETS-SESSION-002.md), [PREETS-SESSION-003](../../docs/requirements/session/PREETS-SESSION-003.md), [PREETS-SECURITY-001](../../docs/requirements/security/PREETS-SECURITY-001.md) and [PREETS-SESSION-013](../../docs/requirements/session/PREETS-SESSION-013.md) against the recorded baseline `1d3aef273cfb3ae57f84b4517a0c33a25aeaa81a`. Read the Effect, testing and requirements-BDD guidance listed above. Record the implementation commit, any material requirement drift, and the installed Effect, openid-client and Next versions in `specs/008-validate-oidc-callback/quickstart.md`. Reconcile material contract changes through the relevant Spec Kit skill rather than widening this slice.
- [X] T002 Add exact `redis@6.3.0` to `packages/frontend/package.json` with root pnpm and update `pnpm-lock.yaml`. From the installed lock, confirm `@effect/platform-node/NodeRedis` `layer` passes options through; `effect/persistence/Redis` `send` accepts a command plus string arguments and exposes no per-command abort or timeout; node-redis 6.3.0 honors `disableOfflineQueue`, `pingInterval` and `socket.socketTimeout`; openid-client 6.8.8 exports `enableNonRepudiationChecks` and requires `jwks_uri`; and Next 16.4.2 Route Handler cookie and redirect APIs match `specs/008-validate-oidc-callback/contracts/modules.md`. Stop on a contradiction instead of adding another Redis abstraction or importing an ahead-of-pin checkout.

**Checkpoint**: The Redis peer is declared and the installed APIs match the plan. No attempt is stored yet.

## Phase 2: Foundational boundaries

**Purpose**: Add the private recovery, credential and runtime boundaries every story uses. Depends on T001–T002.
No user story starts before this checkpoint.

- [X] T003 [P] Define the versioned attempt codec in `packages/frontend/src/lib/authentication/transaction/codec.ts`. `BrowserCorrelation` is "A distinct, opaque, 32-byte random value encoded with unpadded base64url" and "Its Schema accepts only the generated shape before any store lookup." `RecoverableAuthenticationAttempt` enforces one recognized format version; correlation binding "Equals the validated lookup reference"; tenant alias is an "Exact canonical alias match"; provider issuer and client identity "Equals re-resolved configuration"; callback authority and redirect URI are an "Exact normalized match"; OIDC state and nonce are each an "Exact expected value"; the PKCE verifier is "Never browser-visible"; and "`expiresAt` is after creation and not after the selected TTL." "The record contains no resolved credential, authorization code, access/refresh/ID token, raw provider response, trusted identity, or application-session state." Decode Redis bytes once at this boundary.
- [X] T004 [P] Implement the private Redis adapter in `packages/frontend/src/lib/authentication/transaction/store.ts`, consuming only `effect/persistence/Redis`. Derive the address from the canonical tenant alias, opaque correlation and expected OIDC state under the configured `OIDC_TX_KEY_PREFIX` after the parent has qualified that tuple. Create with one `SET ... NX PX` and consume with one `GETDEL`. Do not use `GET` followed by `DEL`, retry an ambiguous consume, or keep a process-memory fallback. "The production transaction lifetime defaults to 600 seconds. An explicit override is accepted only when it decodes at Layer acquisition as a base-10 integer from 1 through 600 inclusive, so configuration can shorten but never extend the accepted lifetime. Conversion occurs only after validation and is bounded at 600,000 milliseconds. Zero, negative, fractional, nonnumeric, greater-than-600 and overflow-shaped input prevents process readiness without echoing the supplied value." Absent `OIDC_TX_TTL_SECONDS` means 600 seconds. Report an existing qualified address as non-overwrite rather than replacing it.
- [X] T005 [P] Add the server-only credential child in `packages/frontend/src/lib/authentication/credentials.ts`. `ResolvedClientAuthentication` is either "`public`: use the OIDC public-client method and no credential" or "`confidential`: the selected non-secret reference has resolved to one server-only secret for standards-based client authentication." "An absent `OIDC_CLIENT_SECRETS_JSON` is the valid empty map. A malformed explicitly supplied value prevents the whole process from becoming ready and is not echoed." A confidential tenant whose nonempty reference is absent from that valid map fails only that request with `AuthenticationUnavailable`. Do not add a tenant-file secret field, vendor SDK or general secrets service, and do not place secret values in attempt records, public errors, diagnostics or browser data.
- [X] T006 Add `packages/frontend/src/lib/authentication/transaction.ts` as the only importer of `transaction/codec.ts` and `transaction/store.ts`. Expose semantic `create` and `consume` to the authentication parent: `create` returns a stored reference or transaction unavailability, and `consume` returns one decoded `RecoverableAuthenticationAttempt` or a typed attempt/transaction failure. Check explicit expiry with the Effect clock after Schema decoding. Consume corrupt or mismatched bytes without restoration. Do not let this module resolve tenants, call the provider, or choose a cookie disposition.
- [X] T007 [P] Compose Redis once in `packages/frontend/src/lib/runtime.ts` with `NodeRedis.layer({ ...connectionOptions, pingInterval: 1_000, socket: { ...connectionSocketOptions, socketTimeout: 5_000 }, disableOfflineQueue: true })` and `Layer.provide` so Redis stays out of the authentication output graph. Keep the single `ManagedRuntime`. Replace `runtime.runSync(...)` with `runtime.runPromise(...)`, awaited before `packages/frontend/src/instrumentation.ts` finishes importing the runtime, and dispose the partially acquired runtime when that probe fails. Initial acquisition failure must prevent process readiness and route serving. Do not put an application timeout around `Redis.send`. Environment-derived options must not re-enable the offline queue or remove the 5,000 ms socket timeout.
- [ ] T008 Extend the readonly public contract in `packages/frontend/src/lib/authentication.ts` and export one test-only `makeAuthenticationTestHarness` from that parent. `PreparedAuthentication` exposes `destination`, `correlation` and `expiresAt` only; "Private state, nonce and PKCE verifier values are absent from this public result." `CorrelationDisposition` has exactly `preserve` or `clear`. `TrustedIdentity` carries tenant alias, issuer, "required nonempty `sub` claim after protocol validation," and "required integer `auth_time` after protocol validation" with "Presence only; no stale-time judgment." "The type is provider-neutral and contains no token, raw claim map, email/display-name assumption, credential, authorization decision, application-session identifier or protected data." `complete` fails with a safe reason plus disposition, never Redis bytes, provider payloads, tokens or callback URLs. The harness accepts ordinary tenant, credential, clock, random, Redis Layer, optional fetch and `transactionPrefix` inputs, composes the real private children, and may seed a fixture only inside that prefix without returning raw keys or encoded payloads. External tests must not receive child Context services.

**Checkpoint**: Recovery, credentials, one shared Redis runtime and the public contract exist. Login still cannot
complete a provider callback until User Story 1.

## Phase 3: User Story 1 — Complete the selected tenant's provider callback (Priority: P1)

**Goal**: A visitor who started sign-in returns through the configured provider, including to a different
application instance, and the callback yields one trusted identity handoff for that tenant. FR-001, FR-002,
FR-005, FR-006, FR-009 and FR-012; SC-001.

**Independent Test**: Begin authentication on application instance A, complete the repository's real local
provider, and deliver the callback to instance B under the same registered tenant authority. The HTTP response
is an empty 204, the correlation cookie is cleared, and there is no authenticated application session or
protected content. The public `AuthenticationService` result is exactly the expected tenant, issuer, subject
and signed `auth_time`.

### Tests for User Story 1

- [X] T009 [P] [US1] Write failing public-service evidence in `packages/frontend/tests/lib/authentication.test.ts`, and update `packages/frontend/tests/lib/authentication-failures.test.ts` so it targets the new parent contract. Import only `packages/frontend/src/lib/authentication.ts`. Using a fresh harness world per case, prove prepare rejects a tenant-resolving Host that differs from the configured callback Host before provider delegation, transaction creation or correlation issuance; prepare persists before success and returns only destination, opaque correlation and `expiresAt`; and complete returns the exact tenant, issuer, subject and integer `auth_time` with disposition `clear`. Add a property that accepted correlations stay opaque 32-byte unpadded base64url values and invalid shapes cannot address a record. Do not assert Redis keys, tokens, raw claims or a session.
- [X] T010 [P] [US1] Write failing route evidence in `packages/frontend/tests/unit/authentication-entry.test.ts` and update `packages/frontend/tests/unit/authentication-entry-failures.test.ts`. Login returns the existing HTTP 307 only with a host-only cookie: no `Domain`, `HttpOnly`, `SameSite=Lax`, `Path=/auth/callback`, `Max-Age` aligned to the attempt lifetime, and `Secure` except the explicitly permitted loopback HTTP profile. `Cache-Control` stays `private, no-store`. An incompatible initiation Host emits neither redirect nor cookie. Callback success is an empty 204 with that cookie cleared and with no application-session cookie, protected content, identity, token, verifier or re-emitted inbound `code` or `state`. Assert application output, not the absence of those parameters from the inbound request.
- [X] T011 [P] [US1] Use `requirements-bdd-author` to revise `tests/bdd/requirements/tenant-oidc-initiation.feature`. Remove the claim that `/auth/login` issues no correlation state, while every initiation scenario still proves no authenticated application session and no protected content. Root denial continues to issue no application or correlation cookie. Update the feature description so callback recovery is no longer entirely absent, and callback validation and session establishment remain outside this feature. Keep feature-level `@partial` and only lowercase requirement IDs that current `origin/main` supports for each scenario.
- [X] T012 [P] [US1] Use `requirements-bdd-author` to add `tests/bdd/requirements/tenant-oidc-callback.feature` with feature-level `@partial`. The first scenario is a real Keycloak round trip started on instance A and returned to instance B under one registered tenant authority. Tag `@preets-session-002` for the tenant provider round trip and `@preets-session-003` only for the HTTP/browser portion of the validated-success outcome. Do not put `@preets-session-013` on the 204. The scenario observes an empty 204, cleared correlation, and no application session or protected content. It does not read tenant, issuer, subject or `auth_time` from that response. Leave the unqualified direct `/auth/callback` 200 contract in `tests/bdd/requirements/authentication-public-resources.feature` as public reachability, not acceptance.
- [X] T013 [P] [US1] Extend `tests/bdd/support/server.ts` and `tests/bdd/support/world.ts` with a scenario-owned `OIDC_TX_KEY_PREFIX` and two independently composed production Next processes behind one exact registered tenant authority. The path/phase proxy sends `/`, `/auth/login` and provider departure to instance A, then `/auth/callback` on that same authority to instance B. Both receive the same Host, and Keycloak stays external. Add harness evidence that A's host-only `Path=/auth/callback` cookie reaches B and is not sent to another tenant authority. Do not connect Cucumber to Redis.

### Implementation for User Story 1

- [X] T014 [US1] Change `packages/frontend/src/lib/authentication/provider.ts` so preparation returns the validated authorization destination and the private state, nonce and PKCE verifier needed for one attempt. Keep code flow, `openid` scope, S256, `max_age=0`, issuer discovery, redirect rejection, the explicit loopback policy and the existing provider-operation deadline. Do not persist, write cookies or accept a callback in this task.
- [X] T015 [US1] Implement recoverable `prepare` in `packages/frontend/src/lib/authentication.ts`. After tenant resolution, normalize the request Host and require it to equal the configured callback URL Host before provider delegation, transaction creation or correlation issuance. An incompatible host yields no prepared result. Persist the attempt with `SET NX PX` before success. When that qualified address already exists, discard the entire candidate, including correlation, state, nonce, verifier and destination, and regenerate all of it within a bounded parent-owned retry. Record the chosen bound in `specs/008-validate-oidc-callback/quickstart.md`. Exhaustion fails preparation with no redirect or cookie and never overwrites the reserved record. The public success value contains only `destination`, `correlation` and `expiresAt`.
- [X] T016 [US1] Implement the successful `complete` path in `packages/frontend/src/lib/authentication.ts` and `packages/frontend/src/lib/authentication/provider.ts`. Before storage, independently resolve the callback tenant, require its exact registered callback authority, preserve query multiplicity, require one well-formed `state`, and validate correlation syntax. Derive the tenant/correlation/state address, `GETDEL` once, decode, check Effect-clock expiry, and compare tenant, integration, client, issuer and return bindings. Call `enableNonRepudiationChecks(config)` before `authorizationCodeGrant` with the PKCE verifier, expected state, expected nonce and a required ID token. Keep JWKS retrieval inside the existing controlled fetch and provider deadline. Accept claims only after library response, exchange, issuer, audience, signature and nonce validation, then require nonempty `sub` and integer `auth_time`. Return only tenant, issuer, subject and authentication time, with disposition `clear`. Do not pass `maxAge`, create a session, or retain tokens or raw claims.
- [X] T017 [US1] Replace `packages/frontend/src/app/auth/login/page.tsx` with `packages/frontend/src/app/auth/login/route.ts`. Delete the page because Next cannot serve both at this segment. Run `prepare` through the shared runtime and return HTTP 307 with the correlation cookie only after persistence succeeds. Emit neither redirect nor cookie on failed preparation, including an incompatible Host. Preserve tenant 404/500, the existing redirect to `/login-unavailable` for `AuthenticationUnavailable`, and `Cache-Control: private, no-store`. Use a Route Handler response rather than catching Next navigation sentinels. Do not import `authentication/*` or construct a runtime.
- [X] T018 [US1] Replace `packages/frontend/src/app/auth/callback/page.tsx` with `packages/frontend/src/app/auth/callback/route.ts` and delete the page. Pass the request host, the exact query representation and the correlation cookie to `complete`. Map `TrustedIdentity` to an empty 204 with private/no-store caching, the correlation cookie cleared, and no session cookie, protected redirect or identity body. For this story's success path, do not copy inbound `code` or `state` into the response body, headers, redirect location, cookies or later application state. Keep denial presentation for later stories; do not treat this 204 as the unqualified public callback.
- [X] T019 [US1] Use `requirements-bdd-scaffold` to update initiation bindings in `tests/bdd/steps/authentication.ts` and `tests/bdd/steps/http.ts`, and add the callback success steps for `tests/bdd/requirements/tenant-oidc-callback.feature`. Assert the empty 204, cleared correlation cookie, and absence of an application session or protected content. Automate the tracked Keycloak `demo` login through the real callback. Do not inject a prepared identity, mock the callback, import `authentication/*`, or read Redis. Keep product assertions out of support code.
- [X] T020 [US1] Run the User Story 1 commands from `specs/008-validate-oidc-callback/quickstart.md`: focused `packages/frontend/tests/lib/authentication.test.ts`, focused `packages/frontend/tests/unit/authentication-entry.test.ts`, then production `pnpm test:bdd` for the initiation feature and the new completion scenario. Record the revision, instance arrangement, Keycloak version and results in that quickstart. Exact identity fields come from the public-service evidence, not from the 204.

**Checkpoint**: User Story 1 is a demonstrable cross-instance callback. It is not feature completion: mismatched,
replayed and untrusted callbacks are still required P1 gates.

## Phase 4: User Story 2 — Reject mismatched, invalid, expired, or replayed callbacks (Priority: P1)

**Goal**: A callback detached from its login, moved across tenants, expired, or consumed more than once cannot
produce a trusted handoff. A rejection that happens before consumption must leave the original attempt usable.
FR-003, FR-004 and FR-007; SC-002, SC-003 and SC-006. Depends on User Story 1's recoverable attempt.

**Independent Test**: Submit missing, malformed, mismatched, cross-tenant, expired and already-consumed
callbacks. Each denial yields no trusted identity, no application session and no protected content. A healthy
race has exactly one winner. An invalid or wrong-state callback followed by the original valid callback still
completes.

### Tests for User Story 2

- [ ] T021 [P] [US2] Extend `packages/frontend/tests/lib/authentication.test.ts` with failing public-service cases for wrong tenant, wrong authority, invalid correlation, malformed query, and missing, duplicate or wrong `state`. Each denies before `GETDEL` of the legitimate address, returns disposition `preserve`, and leaves the later valid callback able to complete. Also cover a qualified address with no live record, explicit Effect-clock expiry, corrupt bytes, and a second consume after success. Add properties that changing one tenant, attempt or provider binding makes a handoff impossible, and that arbitrary failure yields at most one success. Do not hide the healthy exactly-one race inside a generator.
- [ ] T022 [P] [US2] Add failing real-Redis evidence in `packages/frontend/tests/integration/authentication-redis.test.ts`. Use two independently scoped NodeRedis client, service and runtime graphs, a unique prefix, and no `FLUSHALL`. Prove A creates and B consumes; a healthy race has exactly one winner and every other consumer is denied; replay yields none; wrong tenant or wrong state does not consume and the later valid callback succeeds; an existing qualified address is not overwritten and the reserved original remains usable; malformed bytes are consumed and denied; and Redis server-clock expiry makes the attempt unrecoverable. After readiness, a consume submitted while reconnecting with `disableOfflineQueue: true` rejects before send, does not run after recovery, and preserves the original for a later request. An in-flight disconnect is not retried and cannot yield two handoffs. Through a TCP fault proxy that keeps the socket open and withholds replies, the 5,000 ms `socket.socketTimeout` fails the pending consume, clears correlation, never retries, and requires a new runtime because `SocketTimeoutError` stops the pinned reconnect strategy. Use the parent fixture handle only to seed collision or corrupt bytes. Poll `PTTL` or `EXISTS` only as fixture synchronization. Do not wrap `GETDEL` in an Effect timeout.
- [X] T023 [P] [US2] Extend `packages/frontend/tests/unit/authentication-entry.test.ts` with an invalid or wrong-state callback followed, using the response's cookie state, by the original valid callback. The first response preserves correlation and the second completes with the empty 204. Also assert pre-storage rejection, no automatic redirect to `/auth/login`, and no re-emission of inbound callback parameters in the denial response body, headers or cookies.
- [X] T024 [P] [US2] Use `requirements-bdd-author` to add scenarios to `tests/bdd/requirements/tenant-oidc-callback.feature` for cross-tenant and transaction mismatch; missing, invalid and expired recovery; first consumption plus replay; a healthy concurrent race with exactly one 204 winner; and an invalid or wrong-state callback followed in the same browser by the captured valid provider return. Tag only lowercase requirement IDs from current `origin/main` that each scenario actually observes. Keep feature-level `@partial`. Do not inspect Redis or identity fields.

### Implementation for User Story 2

- [X] T025 [US2] Complete qualification and consumption failure mapping in `packages/frontend/src/lib/authentication.ts` and `packages/frontend/src/lib/authentication/transaction/store.ts`. A wrong tenant or authority, invalid correlation, malformed query, or missing, duplicate or wrong `state` never reaches `GETDEL` for the legitimate address. A qualified missing, expired or already-consumed record produces no handoff. Corrupt bytes are consumed and denied. A command rejected before send preserves the attempt and cannot run later. An in-flight disconnect or socket timeout is ambiguous, is never retried, and uses disposition `clear`. Disposition is `preserve` for denial before consume and denial at recovery, and `clear` for denial after consume. The public failure exposes no store address, payload or private reason.
- [X] T026 [US2] Apply that disposition in `packages/frontend/src/app/auth/callback/route.ts`. Omit cookie deletion for `preserve`. For `clear`, expire the matching host-only `Path=/auth/callback` cookie. Map expected denial and post-start unavailability to the existing safe sign-in-failure presentation without starting `/auth/login`. Preserve the current unqualified callback outcome of HTTP 200, no redirect, no protected content and no newly issued correlation cookie, using the existing "Authentication return" presentation. Read the installed `@pathableai/react` guidance before editing that composition. Keep tenant 404/500 distinct. When the callback host cannot select a tenant and a correlation cookie is present and addressable, preserve it.
- [X] T027 [US2] Use `requirements-bdd-scaffold` to implement the User Story 2 steps in `tests/bdd/steps/authentication.ts` and `tests/bdd/steps/http.ts`. Capture callback URL and cookie only transiently to build the negative and racing requests. Assert preserved correlation on pre-consumption denial, exactly one 204 winner, replay denial, and no session or protected content. Do not connect steps to Redis or import private authentication modules.
- [X] T028 [US2] Run the User Story 2 focused service, Redis integration and route commands from `specs/008-validate-oidc-callback/quickstart.md`, then the new callback scenarios with `pnpm test:bdd`. Record race, replay, expiry and preservation results, including the Redis and Keycloak versions, in that quickstart.

**Checkpoint**: Transaction mismatch, expiry, replay and a healthy race fail closed, and a premature invalid
callback does not destroy the original login.

## Phase 5: User Story 3 — Fail closed on provider denial or untrusted identity evidence (Priority: P1)

**Goal**: Provider cancellation, provider failure, and identity evidence that fails issuer, audience, signature,
nonce, exchange or required-claim checks produce no trusted handoff and no protected access. FR-007, FR-008,
FR-010 and FR-011; SC-002 and SC-004. Depends on User Story 1 consumption and User Story 2 disposition.

**Independent Test**: Deliver a controlled provider-error callback at the public HTTP boundary and reject
missing or incorrectly bound signed identity evidence at the public service. Each case denies, creates no
application session, reveals no protected or secret material, and does not re-emit the provider response.

### Tests for User Story 3

- [X] T029 [P] [US3] Extend `packages/frontend/tests/lib/authentication.test.ts` with named failing cases, using the real provider child and controlled transport, for provider cancellation, provider error, mixed or duplicate success and error parameters, code-exchange failure, issuer mismatch, audience mismatch, nonce mismatch, invalid ID-token signature with `enableNonRepudiationChecks` active, missing nonempty `sub`, and missing integer `auth_time`. A matching failure consumes the attempt and returns disposition `clear`. JWKS retrieval stays inside the controlled fetch and provider deadline. Also prove an absent credential map is empty, a public client needs no secret, and a confidential tenant with a missing nonempty reference receives request-level `AuthenticationUnavailable`. Inbound `code`, `state` and provider-error values are not retained in service state or safe errors. Do not pass `maxAge` or invent a staleness threshold.
- [X] T030 [P] [US3] Extend `packages/frontend/tests/unit/authentication-entry.test.ts` so a controlled provider-error callback returns the safe public sign-in failure, clears correlation after consumption, starts no login, and grants no session or protected content. Assert the response body, headers, redirect location and cookies do not re-emit inbound `code`, `state`, provider error parameters, tokens, verifiers or credentials.
- [X] T031 [P] [US3] Use `requirements-bdd-author` to add an application-handled controlled provider-error scenario to `tests/bdd/requirements/tenant-oidc-callback.feature`. Describe it as controlled public-HTTP evidence, not real Keycloak cancellation. Add `@preets-security-001` only where the scenario observes the non-secret, server-only outcome. Add `@preets-session-013` only if a real callback scenario observably rejects missing signed `auth_time`; otherwise leave that trace in the public-service test and record the BDD limit. Do not fabricate a provider token or claim a stale-time policy.

### Implementation for User Story 3

- [X] T032 [US3] Handle provider denial and untrusted evidence in `packages/frontend/src/lib/authentication/provider.ts`, `packages/frontend/src/lib/authentication/credentials.ts` and `packages/frontend/src/lib/authentication.ts`. Reject contradictory success and error shapes before consume. A matching provider error or cancellation consumes once and denies. Exchange, signature, issuer, audience, nonce or required-claim failure after consume burns the attempt and returns no `TrustedIdentity`. Missing signed `auth_time` is rejected. Do not define clock tolerance, broker support or unsupported-provider behavior. Resolve client authentication through the credential child before provider work. Public clients proceed with no secret. A confidential client's absent nonempty reference is request-level `AuthenticationUnavailable`, not a process failure.
- [X] T033 [US3] Finish non-disclosure in `packages/frontend/src/app/auth/callback/route.ts` and the login redirect in `packages/frontend/src/app/auth/login/route.ts`. Application-produced bodies, headers, redirect locations, cookies, diagnostics and post-callback application state must not contain credentials, tokens, proof verifiers, raw provider payloads, or inbound `code`, `state` or provider error parameters. The only retained verifier is inside the unconsumed attempt, and it is removed on actual consumption. Safe errors stay generic. Do not add a durable log or span assertion.
- [X] T034 [US3] Use `requirements-bdd-scaffold` and `requirements-bdd-review` to bind the controlled provider-error scenario in `tests/bdd/steps/authentication.ts` and `tests/bdd/steps/http.ts`. Assert denial, no session, no protected content and no application re-emission of callback parameters. Call the result real Keycloak cancellation only if the provider UI actually emits it; otherwise record that limitation in `specs/008-validate-oidc-callback/quickstart.md`.
- [X] T035 [US3] Run the User Story 3 public-service and route tests from `specs/008-validate-oidc-callback/quickstart.md`, then the controlled provider-error BDD scenario. Record which signature, audience, nonce and missing-`auth_time` cases are public-service evidence only, and whether real-provider cancellation executed, in that quickstart.

**Checkpoint**: Untrusted provider responses fail closed. The feature still needs the cross-cutting readiness,
documentation and repository gates.

## Phase 6: Polish and cross-cutting concerns

**Purpose**: Prove startup bounds, document rollout, and run the repository gates after all three stories.

- [ ] T036 Add Layer-acquisition evidence for credential and TTL configuration through the public parent harness and production boot path. Absent `OIDC_CLIENT_SECRETS_JSON` decodes to an empty map. Malformed explicit credential JSON fails readiness without echoing the value. Absent `OIDC_TX_TTL_SECONDS` uses 600 seconds. Integer boundaries 1 and 600 acquire successfully. Zero, negative, fractional, nonnumeric, greater-than-600 and overflow-shaped TTL values fail readiness without echoing the value. With Redis unreachable, a fresh production process awaits `runtime.runPromise(...)` and does not pass its port or readiness gate or serve routes. After Redis recovery, a newly started process becomes ready. Record both results in `specs/008-validate-oidc-callback/quickstart.md`.
- [X] T037 [P] Document the Redis, Keycloak, credential-map and two-instance prerequisites, without secret values, in `docs/authentication.md`, `README.md` and `tests/bdd/steps/README.md`. Update `.github/workflows/ci-bdd.yml` so the existing BDD job starts and waits for tracked Redis and Keycloak and supplies scenario-owned configuration. Document mixed-version behavior: an old initiation cannot be completed by the new callback, a new attempt cannot complete through the old callback, in-flight login may be denied but must not be accepted incorrectly, and rollback leaves only expiring versioned keys and host-only callback-path cookies with no migration.
- [ ] T038 Run `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm check:unused`, `pnpm fallow`, `pnpm format:check`, `pnpm format:gherkin:check`, `pnpm lint:gherkin`, `pnpm test:bdd:dry`, the full frontend `pnpm --filter @pathableai/pre-ets-frontend test:unit`, and production `pnpm test:bdd` from `specs/008-validate-oidc-callback/quickstart.md`. Fix underlying findings without check suppressions. Manually inspect real logs and exported OTel for accidental disclosure, and do not retain those probes. Record that Keycloak is the only executed real provider; Microsoft, broker chains, real-provider cancellation unless the UI emitted it, and a real confidential-provider round trip unless separately configured are unexecuted; #218 session creation, #154 full integration and #158 comparison and tolerance remain absent.

**Checkpoint**: The three stories and the startup, rollout and repository evidence are recorded with their limits.

## Dependencies and execution order

### Phase dependencies

- **Setup (Phase 1)**: Starts immediately. T002 depends on T001.
- **Foundational (Phase 2)**: Depends on Setup and blocks every user story.
- **User Story 1 (Phase 3)**: Depends on Foundational. It creates the recoverable attempt, success callback and cross-instance harness.
- **User Story 2 (Phase 4)**: Depends on User Story 1 because mismatch, expiry and replay are properties of that stored attempt. Its scenarios remain independently observable.
- **User Story 3 (Phase 5)**: Depends on User Story 1 consumption and User Story 2 disposition. Provider denial must burn the matching attempt and clear correlation without restoring it.
- **Polish (Phase 6)**: Depends on all three stories.

### User story dependencies

- **User Story 1 (P1)**: First incremental callback. No dependency on User Story 2 or 3.
- **User Story 2 (P1)**: Required before the feature can reject forged or repeated callbacks. Does not require provider-error behavior from User Story 3.
- **User Story 3 (P1)**: Required before untrusted provider evidence is in scope. Does not redefine transaction addressing.

### Within each user story

- Author tests and Gherkin first and confirm a meaningful failure.
- Schemas and store behavior from Phase 2 precede service behavior.
- Service behavior precedes Route Handlers.
- Route Handlers and harness support precede BDD step bindings.
- Bindings precede the story's runtime validation task.
- Shared files are serialized. In particular, `packages/frontend/src/lib/authentication.ts`, `packages/frontend/src/lib/authentication/provider.ts`, `packages/frontend/src/app/auth/callback/route.ts`, and `tests/bdd/requirements/tenant-oidc-callback.feature` are edited by later stories only after the earlier story's checkpoint.

### Parallel opportunities

- T003, T004, T005 and T007 can run together after T002.
- T009, T010, T011, T012 and T013 can run together after T008.
- After T015, T016 and T017 touch different files and can proceed together; T018 waits for T016.
- T021, T022, T023 and T024 can run together after the User Story 1 checkpoint.
- T029, T030 and T031 can run together after the User Story 2 checkpoint.
- T036 and T037 can run together after User Story 3. T038 joins when both are done.

## Parallel example: User Story 1

```bash
# After T008, write the failing evidence together:
Task: "T009 public-service success evidence in packages/frontend/tests/lib/authentication.test.ts"
Task: "T010 route success evidence in packages/frontend/tests/unit/authentication-entry.test.ts"
Task: "T011 revise tests/bdd/requirements/tenant-oidc-initiation.feature"
Task: "T012 add the completion scenario to tests/bdd/requirements/tenant-oidc-callback.feature"
Task: "T013 two-instance harness in tests/bdd/support/server.ts and tests/bdd/support/world.ts"

# After T015, continue the success path across separate files:
Task: "T016 successful complete in packages/frontend/src/lib/authentication.ts and provider.ts"
Task: "T017 login Route Handler in packages/frontend/src/app/auth/login/route.ts"
```

## Parallel example: User Story 2

```bash
# After the User Story 1 checkpoint:
Task: "T021 binding and preservation cases in packages/frontend/tests/lib/authentication.test.ts"
Task: "T022 real Redis race and expiry cases in packages/frontend/tests/integration/authentication-redis.test.ts"
Task: "T023 invalid-then-valid route case in packages/frontend/tests/unit/authentication-entry.test.ts"
Task: "T024 mismatch, replay and race scenarios in tests/bdd/requirements/tenant-oidc-callback.feature"
```

## Parallel example: User Story 3

```bash
# After the User Story 2 checkpoint:
Task: "T029 protocol and auth_time cases in packages/frontend/tests/lib/authentication.test.ts"
Task: "T030 provider-error route non-disclosure in packages/frontend/tests/unit/authentication-entry.test.ts"
Task: "T031 controlled provider-error scenario in tests/bdd/requirements/tenant-oidc-callback.feature"
```

## Implementation strategy

### MVP first (User Story 1)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 and stop at its checkpoint.
3. Demonstrate one real Keycloak round trip from instance A to instance B: empty 204, cleared correlation, no session or protected content, and exact identity only at the public service.
4. Do not treat that demo as acceptance of forged, replayed or untrusted callbacks.

### Incremental delivery

1. Setup and foundation provide one shared recoverable attempt and no callback acceptance by themselves.
2. User Story 1 makes a valid cross-instance callback observable.
3. User Story 2 makes mismatch, expiry, replay and races fail closed without burning a still-valid attempt.
4. User Story 3 makes provider denial and untrusted identity evidence fail closed.
5. Polish records readiness, rollback and the repository gates.

All three user stories are P1. The suggested demo slice is User Story 1. Delivery of #217 still includes User
Story 2, User Story 3 and Phase 6.

### Completion map

| Feature expectation | Primary tasks | Evidence boundary |
| --- | --- | --- |
| FR-001 recoverable attempt and matching initiation host | T004, T007, T015, T017 | Public service and login route; incompatible Host issues nothing |
| FR-002 opaque browser correlation | T003, T009, T010, T017 | Cookie value only; verifier stays in the unconsumed attempt |
| FR-003 qualify before consume and preserve correlation | T021, T023, T025, T026, T027 | Later valid callback still completes |
| FR-004 one-time atomic consumption | T004, T022, T025, T028 | Two real Redis clients and one healthy race |
| FR-005 provider, signature, nonce and claim validation | T016, T029, T032 | openid-client non-repudiation through the public service, plus real Keycloak success |
| FR-006 trusted handoff is not a session | T009, T010, T016, T018, T020 | Exact identity at the service; empty 204 at HTTP |
| FR-007 mismatch and provider failure deny | T025, T026, T032, T034 | Public service, route and controlled HTTP callback |
| FR-008 signed `auth_time` presence only | T016, T029, T031, T035 | Missing claim rejected; no staleness threshold |
| FR-009 public callback keeps tenant 404/500 | T017, T018, T026 | Existing status distinctions and no login loop |
| FR-010 server-only confidential credential | T005, T029, T032, T036 | Empty map, readiness failure, request-level absence |
| FR-011 no application re-emission | T010, T030, T033, T038 | Response output and manual telemetry inspection |
| FR-012 initiation BDD revision | T011, T019, T020 | Correlation allowed; no session or protected content |
| FR-013 partial callback BDD | T012, T013, T024, T027, T031, T034 | Real Keycloak A-to-B completion and named denial scenarios |

## Notes

- `[P]` tasks use different files and still wait for their phase entry gate.
- User-story tasks carry `[US1]`, `[US2]` or `[US3]` for traceability.
- Stop at a checkpoint to validate that story before editing its shared files for the next story.
- A healthy race must have exactly one winner. Arbitrary failure retains only the weaker at-most-one invariant.
- Transaction TTL is not an `auth_time` freshness policy.
