# Implementation Plan: Complete Fresh Tenant OIDC Recovery With a New Session

**Branch**: `382-fresh-oidc-recovery-plan` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature contract in `specs/382-fresh-oidc-recovery/spec.md` and
`specs/382-fresh-oidc-recovery/verification.md`; delivery issue
[#158](https://github.com/PathableAI-org/Pre-ETS/issues/158), delivery-plan slice S6, with the 2026-11-09 B6 decision
in [docs/delivery/session-management.md](../../docs/delivery/session-management.md)

## Summary

Replace the fail-closed `CallbackFreshness` stand-in with the B6 freshness confirmation inside
`AuthenticationService.complete`. After the existing single-use transaction consumption and signature-validated code
exchange, the service admits the identity only when the ID token's `auth_time`, in exact milliseconds, lies in
`[transaction createdAt − 30 s, callback time + 30 s]` inclusive. A missing `auth_time` and an out-of-window value fail
with a new expected reason, `AuthenticationNotFresh` (`missing` or `stale`), which the callback maps to the existing
safe authentication return with correlation cleared and no session. The service span records the decision and its
window position, and a fixed-message warning names the tenant and category for operators. No raw claim, subject,
token, or protocol value is emitted.

The login request already carries `max_age=0` on every path, and session establishment, no-revival, tenant-bound
reads, and history restoration already exist. Slice S1 makes establishment reachable and updates the requirements BDD
that asserted the stand-in. Slice S2 adds the composed real-provider evidence: first visit with SSO, re-entry after a
removed record through new tab, refresh, and history, old-reference denial, session reuse, cancellation, and the
signed-out notice's Log in. It also tries a bounded stale-`auth_time` Keycloak fixture. Slice S3 composes Log in
through #157's recovery content and modal, and is the only slice that closes #158.

No package, service, Layer, dependency, configuration, stored field, or per-tenant setting is added.

## Technical Context

**Language/Version**: TypeScript 6.0.3 on Node.js 26+

**Primary Dependencies**: Effect 4.1.2 (named `effect` catalog), `openid-client` 6.8.9 over `oauth4webapi` 3.8.8,
Next.js 16.4.5 (host adapters only), `redis` 6.3.1 (unchanged)

**Storage**: Existing Redis authentication attempts (`createdAt` already stored) and session records; no schema change

**Testing**: Vitest 5.1.0 with `@effect/vitest` and `@fast-check/vitest` 0.5.0 (frontend-services lib and unit
suites, `TestClock`, RS256 tokens behind mocked `fetch`); Cucumber requirements BDD with Playwright Chromium against
the tracked Keycloak realm; the agent-executable manual procedure with Grafana MCP

**Target Platform**: Self-hosted `next start` on Node.js; local Redis and Keycloak for composed evidence

**Project Type**: Existing pnpm monorepo web application; change confined to `packages/frontend-services`, root
`tests/bdd`, `docker/keycloak` (S2 spike only), and `docs/`

**Performance Goals**: None new. One clock read and one integer comparison per callback.

**Constraints**: B6 window and fixed 30-second tolerance exactly; inclusive bounds; fail closed for missing, stale,
cancelled, failed, or unsupported providers; no per-tenant opt-out or fallback; same safe user outcome as other
failures; no forbidden telemetry; no telemetry assertions in tests

**Scale/Scope**: frontend-services: one new private leaf child, changes to `authentication.ts`,
`authentication/provider.ts`, `next/callback.ts`, `next.ts`, deletion of `next/freshness.ts`. Tests: one new lib suite,
three adjusted suites. BDD: two adjusted features in S1, one new feature and steps in S2.

## Constitution Check

_GATE: Passed before Phase 0 research and re-checked after Phase 1 design. No violation requires Complexity Tracking._

| Principle                                     | Pre-design gate                                                                                       | Post-design result                                                                                                                                                                                                             |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Evidence-grounded specification            | `spec.md`, `verification.md`, #158, S6, B6, PREETS-SESSION-013/004 at `2e6142e2` read as authorities. | Pass. No criterion or verification obligation changes. The whole-second comparison the spec left to planning is decided in research D2 without widening either bound. F-1 restates the approved #157 composition prerequisite. |
| II. Explicit ownership and authoritative data | OIDC orchestration belongs to frontend-services; the Next app only wires routes.                      | Pass. The policy lives in the authentication service that owns the transaction and claims. The adapter keeps HTTP mapping only. Redis remains the transaction and session authority.                                           |
| III. Tenant isolation                         | Tenant resolved per callback; issuer and transaction bound to the tenant.                             | Pass. Freshness is judged on the tenant-bound consumed attempt and the configured issuer's validated token. Each login passes on its own (spec edge case: two tabs). Diagnostics carry only the alias.                         |
| IV. Accessible, server-rendered UI            | No new UI.                                                                                            | Pass. Denials reuse the existing safe page. Keyboard Log in is observed in S2/S3.                                                                                                                                              |
| V. Meaningful behavioral tests                | Evidence names claims and separates module, feature, and manual observations.                         | Pass. The window is a property at the public service boundary with real signatures and consumption. Feature claims run once each in BDD or the manual procedure ([quickstart.md](quickstart.md)). No telemetry tests.          |
| VI. Simplicity and verifiable quality         | Every new abstraction needs a current consumer and owner.                                             | Pass. One pure private child with one caller; one new error with one consumer; one seam removed.                                                                                                                               |

Architecture constraints: the frontend/backend separation is unchanged, and so is the shared `ManagedRuntime`. The
Next app imports no Effect, and Fallow zones are unchanged. `authentication/freshness.ts` joins the existing
`services` zone with its parent. Run `fallow architecture --boundaries` in S1.

## Project Structure

### Documentation (this feature)

```text
specs/382-fresh-oidc-recovery/
├── spec.md              # approved feature contract (unchanged)
├── verification.md      # approved verification plan (unchanged)
├── checklists/          # specification checklist (unchanged)
├── plan.md              # this file
├── research.md          # facts R1–R10, decisions D1–D10, findings F-1–F-2
├── contracts/
│   ├── modules.md       # module decisions, public contracts, contract evidence
│   └── telemetry.md     # T-001 span facts, T-002 diagnostic log
└── quickstart.md        # implementation-aware execution of verification.md
```

No `data-model.md`: no stored or exchanged data shape changes. The entities in `spec.md` map onto the existing
authentication attempt, ID token claims, and session record.

### Source Code (repository root)

```text
packages/frontend-services/
├── src/
│   ├── authentication.ts              # AuthenticationNotFresh; freshness check in complete; T-001/T-002; TrustedIdentity narrowed
│   ├── authentication/
│   │   ├── freshness.ts               # NEW leaf child: tolerance constant and pure window position
│   │   └── provider.ts                # auth_time optional; ProviderIdentity.authenticatedAt optional
│   ├── next.ts                        # CallbackFreshness export removed
│   └── next/
│       ├── callback.ts                # no freshness read; AuthenticationNotFresh → safe return
│       └── freshness.ts               # DELETED
└── tests/
    ├── lib/authentication-freshness.test.ts   # NEW: window examples and properties via AuthenticationService
    ├── lib/authentication.test.ts             # missing-auth_time row; identity shape
    ├── unit/authentication-entry.test.ts      # drop CallbackFreshness provision
    └── unit/authentication-entry-failures.test.ts  # drop provision; AuthenticationNotFresh mapping

tests/bdd/
├── requirements/tenant-oidc-callback.feature      # S1: real return establishes a session
├── requirements/default-entry-protection.feature  # S1: prose for the now-reachable admission
├── requirements/fresh-oidc-recovery.feature       # NEW in S2 (@partial until S3)
└── steps/{authentication,fresh-recovery}.ts       # S1 adjusted step; S2 new steps

docker/keycloak/pre-ets-realm.json                 # S2 only if the D9 stale client works
docs/{authentication,session-state}.md             # S1: stand-in prose replaced; T-001/T-002 rows
features/README.md                                 # S1: success scenarios now reach a session
```

**Structure Decision**: All product code stays in the existing `authentication` module of frontend-services. The
policy is a private child because only `complete` calls it.

## Complexity Tracking

None.

## Phased Engineering Design

### Phase 1 — Module architecture

Decisions are tabulated in [contracts/modules.md](contracts/modules.md#module-architecture-decisions):

- **Extend** `authentication.ts` with the freshness confirmation, in a new private leaf child
  `authentication/freshness.ts`.
- **Extend** the provider child privately so a missing `auth_time` reaches that decision.
- **Extend** the callback failure vocabulary with `AuthenticationNotFresh`.
- **Narrow** `TrustedIdentity`.
- **Simplify** the callback adapter, and **delete** `CallbackFreshness` and its export.
- **Preserve** the session service, login initiation, the gate, and history protection, which already satisfy their
  requirements.

The policy belongs in the service because only `complete` holds the consumed transaction start (research D1). No
service or Layer is added because the comparison is pure, with one caller.

### Phase 2 — Public module contracts

[contracts/modules.md](contracts/modules.md#public-contracts) records the signatures. Compatibility-sensitive points:

- `AuthenticationNotFresh { evidence: "missing" | "stale" }` joins the `CallbackExpectedFailure` reason union and
  always clears correlation. Consumers switching exhaustively on `reason._tag` must add it. The only one is
  `next/callback.ts`.
- `complete`'s signature is unchanged. Its success now also means "fresh".
- `TrustedIdentity` drops `authenticatedAt`.
- `CallbackFreshness` is removed from `src/next.ts`. Only tests used it.
- `createCallbackHandler` and `CallbackResponses` are unchanged, so the Next route needs no edit.

### Phase 3 — Module contract evidence

Per [contracts/modules.md](contracts/modules.md#contract-evidence):

- **Durable, public-interface**: a new `authentication-freshness.test.ts` drives `AuthenticationService.complete`
  with real RS256 signature validation, in-memory Redis consumption, and `TestClock`. Examples cover each inclusive
  bound and one second past it, a value between the bounds, a far-future value, and a missing value. Each denial is
  followed by replay denial and a new successful `prepare`. Properties:
  - admission holds iff the exact inclusive comparison holds;
  - tenant fields and client-auth mode never change the outcome;
  - `amr`/`acr` never change the outcome.
- **Durable, adapter**: callback examples show both categories map to the safe return with no session cookie and
  cleared correlation.
- **Existing evidence reused**: transaction single-use and expiry, signature/issuer/nonce/audience validation, and the
  session no-revival and tenant-bound suites.
- **Manual**: code inspection that no tenant setting reaches the comparison (V-008). No transient probes are needed.

### Phase 4 — Implementation architecture

- **`authentication/freshness.ts`** (leaf, imports only `Duration`):
  - `FRESHNESS_TOLERANCE = Duration.seconds(30)`
  - `freshnessPosition({ authTimeSeconds, startedAtMs, callbackAtMs })` returns `"inside" | "before_window" |
    "after_window" | "missing"` using integer milliseconds (research D2)
- **`authentication/provider.ts`**: `IdentityClaims.auth_time` becomes `Schema.optionalKey(Schema.Int)`;
  `ProviderIdentity.authenticatedAt` is `number | undefined`. Malformed values keep failing (research D4).
- **`AuthenticationService.complete`**:
  1. Read `callbackAt = Clock.currentTimeMillis` first (research D3).
  2. After consumption, annotate `preets.authentication.transaction_started_ms` (`attempt.createdAt`) and
     `preets.authentication.callback_ms`.
  3. After the provider exchange, compute the position and annotate `preets.authentication.freshness`,
     `preets.authentication.freshness_position`, and `preets.authentication.freshness_tolerance_ms`.
  4. On anything but `inside`, log `Authentication freshness denied` at warning level, annotated with
     `preets.tenant.alias` and the category, then fail with
     `callbackFailure(new AuthenticationNotFresh({ evidence }), "clear")`.
  5. On success, annotate `preets.outcome = confirmed` and return `{ issuer, subject, tenantAlias }`.

  `preets.tenant.alias` is set once the target resolves. Failures set `preets.outcome` through the `Effect.fn`
  second-argument pipeline with `tapError`, as `SessionService` does with `annotateFailure`. The mapping is
  `AuthenticationDenied` → `denied`, `AuthenticationUnavailable` → `unavailable`, tenant reasons → `tenant_failure`,
  and `AuthenticationNotFresh` → `not_fresh_<evidence>`.
- **`next/callback.ts`**: remove the `CallbackFreshness` read. `respondToTrustedIdentity` calls `establishSession`
  directly with its existing `SessionServiceUnavailable` fail-closed catch. `responseForReason` maps
  `AuthenticationNotFresh` to `authenticationReturn`. Correlation follows `correlationDisposition` as today.
- **Runtime, configuration, infrastructure**: none new. The tolerance is a constant, not configuration (FR-003,
  FR-007).
- **Docs**: replace the stand-in paragraphs in `docs/authentication.md` (lines on unresolved freshness) and
  `docs/session-state.md` with the confirmed behavior. Add T-001/T-002 to the session-state verification signals
  (or an authentication signals subsection it links). Update `features/README.md` where it says success scenarios
  stop at provider arrival.

### Phase 5 — Feature verification integration

[quickstart.md](quickstart.md) maps every claim in [verification.md](verification.md) to one feature boundary:

- **S1**:
  - module evidence for V-004, V-005, V-006, V-008, V-009
  - the updated callback BDD for V-003 and V-016
  - the Grafana inspection for V-017
- **S2**:
  - the fresh-recovery BDD feature for V-001, V-007, V-010/V-011 via a removed record, and V-012 through V-015
  - the manual procedure for V-002, natural expiry in V-010, a real stale denial if research D9 succeeds, and the
    composed V-017 run
- **S3**: V-014 through #157.

Module evidence is cited, not repeated. Approved limitations from `verification.md` apply unchanged:

- missing evidence at the module boundary only
- stale evidence at the application boundary only with D9
- Microsoft and brokers unexecuted
- B5 pre-script paint

### Phase 6 — Verification telemetry contract

[contracts/telemetry.md](contracts/telemetry.md) adds:

- **T-001**: annotations on the existing `AuthenticationService.complete` span. They carry the outcome, the tenant,
  the freshness category, the window position, the transaction start and callback timestamps, and the tolerance.
- **T-002**: the fixed-message warning `Authentication freshness denied`, with the tenant and category only.

Session identity reuses the existing `SessionService` and `protectRequest` rows. The raw `auth_time` is never
emitted; the window position replaces it, and the module property proves the exact comparison. Subjects, tokens,
codes, state, nonce, PKCE, and session references are never emitted either. No metrics.

### Phase 7 — Implementation slices

| Slice | Branch                                  | Decision a reviewer accepts                                                                                                                | Contracts and modules                                                                                                                             | Telemetry rows              | Claim IDs advanced                                                                                                                   | Est. hand-written files |
| ----- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| S1    | `382-fresh-oidc-recovery-impl`          | The B6 window inside `AuthenticationService.complete` replaces the stand-in, so real logins establish sessions and denials are diagnosable | `authentication.ts` (`AuthenticationNotFresh`, `TrustedIdentity`), `authentication/freshness.ts`, `provider.ts`, `next/callback.ts`, `next.ts`    | T-001, T-002                | V-004, V-005, V-006, V-008, V-009, V-016, V-017; V-001 and V-003 in part (existing and updated BDD)                                  | ~16                     |
| S2    | `382-fresh-oidc-recovery-impl-reentry`  | Composed real-provider evidence: existing SSO never yields a silent session on first visit or re-entry, and the old session stays dead     | None (evidence only); possibly the D9 Keycloak client and its tenant fixture; the `consent-web` client and its tenant fixture for provider cancel | Uses T-001, T-002, existing | V-001, V-002, V-003, V-007, V-010, V-011, V-012, V-013, V-015; V-014 in part (signed-out notice); V-005/V-006/V-017 real stale if D9 | ~6                      |
| S3    | `382-fresh-oidc-recovery-impl-explicit` | Log in from #157's recovery content and modal requires fresh authentication and a new session; #158 completion evidence is met             | None (evidence); BDD scenarios against #157's entry points                                                                                        | Uses T-001, existing        | V-014 in full                                                                                                                        | ~3                      |

S1 file count: 6 product files including the deletion, 4 test files, 2 BDD features and 1 step file, and 3 docs.
That is about 16, slightly over the guideline, but S1 is one decision. Splitting the BDD and docs off would leave the suite failing at S1, because the
callback scenario asserts the stand-in (research R7). Each slice passes typecheck, lint, `check:unused`, and
`check:health` on its own. S2 starts after S1 because it needs live establishment. S3 waits for #157's entry points
on `main` (or below it in its own stack), and only S3's pull request says `Closes #158`. S1 and S2 say
`Contributes to #158`.

## Gaps and follow-ups

- S3 depends on #157 delivering its recovery content and modal; until then #158 stays open with S1–S2 merged.
- Once S1 merges, #154's and #155's gated live claims can run under their own features (research F-2).
