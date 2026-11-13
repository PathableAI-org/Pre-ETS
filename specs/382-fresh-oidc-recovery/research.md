# Research: Complete Fresh Tenant OIDC Recovery With a New Session

**Plan**: [plan.md](plan.md) · **Spec**: [spec.md](spec.md) · **Verification**: [verification.md](verification.md)

Facts were read at `origin/main` `2e6142e2c15caed4d630019be834fe627fe5beed` and in the installed dependencies of this
checkout. Each decision lists the choice, the reason, and the alternatives considered.

## Current-implementation facts

- **R1 — Fresh-authentication request already exists.** `OidcProvider.prepare`
  (`packages/frontend-services/src/authentication/provider.ts`) builds every authorization URL with `max_age: "0"`.
  Every login path reaches it through `AuthenticationService.prepare`: automatic entry (gate → `/auth/login`) and
  the signed-out notice's Log in link to `/`. The requirements BDD already asserts `max_age=0` per tenant
  (`tests/bdd/steps/authentication.ts`). FR-001 needs no new request logic.
- **R2 — The stand-in fails every login closed.** `CallbackFreshness` (`src/next/freshness.ts`) is a
  `Context.Reference` whose default `confirmed` returns `false`. `next/callback.ts` calls it after
  `AuthenticationService.complete` succeeds, and so no session is ever established in the running application. Only
  the unit tests `tests/unit/authentication-entry{,-failures}.test.ts` provide `confirmed: () => true`.
- **R3 — A missing `auth_time` is currently a provider failure.** `IdentityClaims` decodes `auth_time: Schema.Int`
  as required. A missing claim fails decoding, which maps to `ProviderUnavailable`, then to
  `AuthenticationUnavailable` with the correlation cleared. FR-016 requires missing evidence to be a freshness
  denial, distinguishable from provider unavailability, so the claim must become optional at decoding.
- **R4 — The library does not judge freshness here.** `openid-client` 6.8.9 / `oauth4webapi` 3.8.8 check
  `auth_time` against a `maxAge` only when `checks.maxAge` or `client.default_max_age` is set; neither is set. When
  `auth_time` is present, `validateIdTokenAuthTimeClaim` rejects a non-number as an invalid response. The library's
  own check is measured from the callback's current time only, which FR-003 forbids as the sole measure.
- **R5 — The transaction start is available at the callback.** `AuthenticationService.prepare` stores
  `createdAt = Clock.currentTimeMillis` in the recoverable attempt, and `AuthenticationTransactions.consume` returns
  it to `complete` after the single `GETDEL`. No stored field is added.
- **R6 — The existing test kit can drive controlled freshness.** `tests/lib/authentication.test.ts` signs RS256 ID
  tokens with arbitrary claims behind a mocked `fetch`, runs the real `AuthenticationService` over an in-memory
  Redis, and can control the Effect `Clock` with `TestClock`. The signature, `iat`, and `exp` checks use the real
  wall clock; `createdAt`, the callback time, and `auth_time` use the test clock and claims. These are independent,
  so window examples and properties run at the public service boundary with real signature validation.
- **R7 — The running BDD suite asserts the stand-in.** `tests/bdd/requirements/tenant-oidc-callback.feature`
  expects a real Keycloak return to receive the safe no-session response, and `default-entry-protection.feature`
  states that freshness is unestablished. With confirmation implemented, a fresh Keycloak return establishes a
  session, so those scenarios and their prose change in the slice that enables establishment.
- **R8 — Keycloak is expected to honour `max_age=0`.** The tracked realm's `demo` user signs in with a password
  form. Keycloak documents re-authentication when `max_age=0` is sent with a live SSO session, and it emits
  `auth_time` in that flow. The live observation is V-002 itself; it is not assumed as evidence.
  Keycloak offers no mapper that removes `auth_time`. A hardcoded-claim mapper named `auth_time` might override it.
  That is unverified and is checked in slice S2 (D9).
- **R9 — Expiry is not shortenable below five minutes.** Tenant `idleTimeoutMinutes` is bounded to 5–30. BDD
  cannot reach Redis directly (`features/README.md`). A real removed record is reachable through `POST /auth/logout`
  (#155), which deletes the stored record. Natural expiry needs a five-minute scratch tenant, as #155's quickstart
  did.
- **R10 — History restoration is already guarded.** `RestoredPageGuard` (`packages/frontend/src/features/history-protection/`,
  #154) handles `pageshow` restoration on protected documents. FR-013 needs no new code, only evidence that it
  holds now that real sessions exist.

## Decisions

### D1 — Confirm freshness inside `AuthenticationService.complete`

**Decision**: The window comparison runs in `AuthenticationService.complete`, after a successful provider exchange,
using the consumed attempt's `createdAt`. A non-fresh result fails with a new expected failure; a confirmed result
returns `TrustedIdentity`. `CallbackFreshness` and `src/next/freshness.ts` are deleted.

**Rationale**: `complete` is the only place holding both the consumed transaction and the validated claims. The
callback adapter never sees `createdAt`, so placing the policy there would need a new field on `TrustedIdentity`
carrying transaction data across the boundary. The service owns its error vocabulary (FR-004/FR-005 outcomes) and
its telemetry, and "trusted identity" then means a validated and fresh identity, which is what the adapter acts on.

**Alternatives**: Implement the `CallbackFreshness` reference in `next/`, which leaks transaction timing into the
host adapter and keeps a configurable seam that FR-007 forbids. Pass `maxAge` to `openid-client`, which measures only
from callback time (R4).

### D2 — Window arithmetic in integer milliseconds, inclusive

**Decision**: With `authTime` in whole seconds, `startedAt` the consumed attempt's `createdAt`, and `callbackAt` in
milliseconds, freshness is confirmed exactly when
`startedAt − 30 000 ≤ authTime × 1 000 ≤ callbackAt + 30 000`. The 30-second tolerance is one module constant.

**Rationale**: `authTime × 1 000` is the exact instant the provider's whole-second value denotes. Comparing it with
exact millisecond bounds can never admit a value outside either bound (spec Assumptions). A provider that truncates
sub-second times reports up to one second early, which only the tolerance absorbs. This matches the B6 decision's
fixed tolerance.

**Alternatives**: Rounding the bounds to whole seconds, which widens the window by up to a second. Comparing in
seconds with floor or ceil, which risks admitting a value outside a bound.

### D3 — Callback time is taken when `complete` begins

**Decision**: `callbackAt` is `Clock.currentTimeMillis` read at the start of `complete`, before consumption and the
provider exchange.

**Rationale**: It is the instant the provider's return reached the application, which is what the spec's "callback
time" denotes. Reading it after the exchange would widen the upper bound by up to the five-second provider deadline.

**Alternatives**: Reading after the exchange; reading in the adapter and passing it in (no consumer needs that seam).

### D4 — Missing versus malformed `auth_time`

**Decision**: `IdentityClaims.auth_time` becomes `Schema.optionalKey(Schema.Int)`. An absent claim is **missing**
evidence. A present but non-number value is rejected by `oauth4webapi` as an invalid response (R4). A present
non-integer number fails decoding. Both stay invalid ID tokens, the existing `AuthenticationUnavailable` outcome.

**Rationale**: FR-016 distinguishes a provider that supplies no authentication time from one that supplies a stale
one. A malformed token is a protocol failure, like a bad nonce or audience, and keeps that outcome. Either way no
session is established and the transaction is consumed.

**Alternatives**: Classify malformed values as missing, which needs bypassing the library's own claim validation.

### D5 — One expected failure carrying the evidence category

**Decision**: Add `AuthenticationNotFresh` with `evidence: "missing" | "stale"` to the `CallbackExpectedFailure`
reason union, always with `correlationDisposition: "clear"`. The callback adapter maps it to the same
`authenticationReturn` page as `AuthenticationDenied` and `AuthenticationUnavailable` (FR-015).

**Rationale**: The adapter needs no new branch beyond the exhaustive switch. The category is for operators and
telemetry, never for the page. Clearing correlation matches "transaction consumed", and a new login starts from `/`
or the page's existing retry path.

**Alternatives**: Reuse `AuthenticationDenied`, which loses the operator distinction at the type level and makes the
diagnostic depend on log-only state.

### D6 — Diagnostic as a fixed-message log plus span facts

**Decision**: On a freshness denial, `complete` logs the fixed warning `Authentication freshness denied` with
`preets.tenant.alias` and `preets.authentication.freshness` (`missing` or `stale`). The
`AuthenticationService.complete` span sets `preets.outcome` and the same facts on every outcome (see
[contracts/telemetry.md](contracts/telemetry.md)).

**Rationale**: Operators search logs by message, and verifiers correlate the span with the browser step. Neither
carries the raw `auth_time`, subject, or any token, code, state, nonce, or PKCE value. Provider unavailability shows
`preets.outcome = unavailable` and no freshness log (FR-016).

**Alternatives**: A metric, which cannot carry the per-tenant category cheaply and is not needed for one decision.

### D7 — `TrustedIdentity` drops `authenticatedAt`

**Decision**: `TrustedIdentity` becomes `{ issuer, subject, tenantAlias }`.

**Rationale**: After D1 the only consumer, the callback adapter, does not read the authentication time. Keeping it
would invite a second freshness judgement elsewhere.

### D8 — Establishment and its telemetry are unchanged

**Decision**: `establishSession` in `next/callback.ts` keeps its 303 to `/`, cookie rules, and fail-closed mapping.
`SessionService.establish` already sets `session.id`, `preets.tenant.alias`, and `preets.outcome`, which the
verifier uses to tell a new session from an old one (V-003, V-010, V-012, V-015).

### D9 — Real-provider stale fixture is a bounded S2 spike

**Decision**: Slice S2 tries one extra tracked Keycloak client whose hardcoded-claim mapper sets `auth_time` to a
fixed past value, bound to a third synthetic tenant fixture. If Keycloak does not override the claim in the issued
ID token, the client is not committed, and V-005/V-006 at the application boundary and V-017's real stale case use
the module boundary only, as the approved limitation in `verification.md` already states. A missing-evidence case
has no Keycloak fixture (R8) and always uses the module boundary.

**Rationale**: It gives real-provider evidence for one denial if the provider permits it, without product code.

### D10 — Expiry evidence uses removed records in BDD and natural expiry manually

**Decision**: Requirements BDD exercises re-entry after the record is removed through `POST /auth/logout` (V-011 and
the removed half of V-010). Natural expiry (the rest of V-010) is in the manual procedure with a five-minute scratch
tenant that is not committed (R9).

**Rationale**: BDD cannot reach Redis or a test clock in the server. A five-minute wait per scenario is too slow for
the suite.

## Findings

- **F-1 — V-014 composition waits on #157.** The signed-out notice is the only explicit Log in entry point at this
  revision. Slice S3 composes #157's recovery content and modal and is the only slice that may close #158. This is
  the per-increment prerequisite already recorded in `spec.md`; it is not a new limitation.
- **F-2 — Gated evidence of #154 and #155 becomes runnable.** Once S1 merges, their gated live claims can execute.
  Those claims remain owned by those features (spec Assumptions); this plan does not re-verify them.
