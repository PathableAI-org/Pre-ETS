# Module Architecture and Public Contracts: Complete Fresh Tenant OIDC Recovery With a New Session

**Plan**: [plan.md](../plan.md)

**Feature verification**: [verification.md](../verification.md)

**Status**: Planned design. Signatures were checked against the installed `effect` 4.1.2, `openid-client` 6.8.9,
and `oauth4webapi` 3.8.8 declarations in this checkout; re-check them before implementation.

## Module architecture decisions

| Concern                                   | Current owner and consumers                                                                                     | Decision                                                       | Public boundary                                | Private decomposition                                                     | Rationale and non-goals                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Freshness confirmation (B6 window)        | Stand-in `CallbackFreshness` in `frontend-services/src/next/freshness.ts`; consumer `next/callback.ts`          | **Extend** `src/authentication.ts`; **delete** the stand-in    | `AuthenticationService.complete`               | New leaf child `src/authentication/freshness.ts` (pure window, tolerance) | Only `complete` holds the consumed transaction and the validated claims (research D1). No configurable seam, as FR-007 forbids opt-outs. |
| ID token claim decoding                   | `src/authentication/provider.ts` (`IdentityClaims`), consumed only by `authentication.ts`                       | **Extend** privately: `auth_time` optional                     | Unchanged private child of `authentication.ts` | None                                                                      | A missing claim must reach the freshness decision instead of becoming provider unavailability (research R3, D4).                         |
| Callback expected-failure vocabulary      | `src/authentication.ts` (`CallbackExpectedFailure`); consumer `next/callback.ts`                                | **Extend** with `AuthenticationNotFresh`                       | `src/authentication.ts`                        | None                                                                      | The owning parent controls its error vocabulary; the category feeds operator diagnostics (research D5).                                  |
| Trusted identity                          | `TrustedIdentity` in `src/authentication.ts`; consumer `next/callback.ts`                                       | **Narrow**: drop `authenticatedAt`                             | `src/authentication.ts`                        | —                                                                         | No consumer reads it after D1 (research D7).                                                                                             |
| Callback host adapter                     | `src/next/callback.ts`; consumer `packages/frontend/src/app/auth/callback/route.ts` via `createCallbackHandler` | **Preserve** the public factory; **simplify** the private flow | `src/next.ts` (`createCallbackHandler`)        | Drops the `CallbackFreshness` read                                        | Establishment, cookies, 303, and fail-closed mapping are unchanged (research D8).                                                        |
| Next host adapter exports                 | `src/next.ts`; `CallbackFreshness` consumed only by two unit tests                                              | **Remove** the `CallbackFreshness` export                      | `src/next.ts`                                  | —                                                                         | A test-only seam is not a product contract once the policy is real.                                                                      |
| Session establishment, read, invalidation | `src/session.ts` (`SessionService`)                                                                             | **Preserve**                                                   | —                                              | —                                                                         | FR-010–FR-012 and FR-014 are already enforced: a new reference per login, no revival, tenant-bound reads.                                |
| Login initiation                          | `src/authentication.ts` `prepare`, `src/next/login.ts`, gate in `src/next/protection.ts`                        | **Preserve**                                                   | —                                              | —                                                                         | `max_age=0` is already sent on every path (research R1).                                                                                 |
| History restoration                       | `packages/frontend` `history-protection` (`RestoredPageGuard`)                                                  | **Preserve**                                                   | —                                              | —                                                                         | FR-013 is existing behavior; this feature adds evidence only (research R10).                                                             |
| Local provider fixture                    | `docker/keycloak/pre-ets-realm.json`                                                                            | **Possibly extend** in S2 with one stale-`auth_time` client    | Test infrastructure                            | —                                                                         | Bounded spike; dropped if Keycloak cannot override the claim (research D9).                                                              |

## Public contracts

### `packages/frontend-services/src/authentication.ts`

**Responsibility**: Tenant OIDC login preparation and callback completion, ending in a validated **and fresh**
identity, or one safe expected failure.

**Actual consumers**:

- `src/next/callback.ts`: maps `complete`'s success to session establishment and each failure reason to the safe
  authentication return or the tenant failure page.
- `src/next/login.ts`: `prepare` (unchanged).

**Proposed signatures** (changes only; `prepare`, `AuthenticationDenied`, `AuthenticationUnavailable`, and the layer
are unchanged):

```ts
export interface TrustedIdentity {
  readonly issuer: string
  readonly subject: string
  readonly tenantAlias: TenantAlias
}

/** The provider's authentication time was absent, or outside the B6 freshness window. */
export class AuthenticationNotFresh extends Schema.TaggedError<AuthenticationNotFresh>()("AuthenticationNotFresh", {
  evidence: Schema.Literals(["missing", "stale"])
}) {}

export class CallbackExpectedFailure extends Schema.TaggedError<CallbackExpectedFailure>()(
  "CallbackExpectedFailure",
  {
    correlationDisposition: Schema.Literals(["clear", "preserve"]),
    reason: Schema.Union([
      AuthenticationDenied,
      AuthenticationNotFresh,
      AuthenticationUnavailable,
      TenantNotFound,
      TenantReadError
    ])
  }
) {}

// AuthenticationServiceShape.complete keeps its signature:
// (input: CompleteAuthenticationInput) => Effect.Effect<TrustedIdentity, CallbackExpectedFailure>
```

**Inputs and validation ownership**: The callback query, correlation cookie, and host stay untrusted and are
qualified as today. `auth_time` is decoded by the private provider child as an optional integer and judged only in
`complete`. The transaction start comes from the consumed stored attempt, never from the request.

**Success semantics and invariants**:

- `complete` succeeds only when every existing check passes **and**
  `startedAt − 30 000 ≤ auth_time × 1 000 ≤ callbackAt + 30 000`, where `startedAt` is the consumed attempt's
  `createdAt` and `callbackAt` is the service clock when `complete` began (research D2, D3).
- The tolerance is one fixed constant; no tenant setting, input, or configuration changes the result (FR-007).
- The decision uses only the authentication time issued by the tenant's configured issuer, from a signature-validated
  ID token (FR-008). The mechanism the provider used is never inspected (FR-009).
- A freshness decision happens only after the transaction has been consumed, so a denied return cannot be replayed.

**Expected errors**:

| Public error (as `reason`)                                           | Meaning for consumers                                                 | Owned internal failures translated here                                                               | Consumer response                                                                                           |
| -------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `AuthenticationNotFresh` (`evidence: "missing"`)                     | Valid provider return with no authentication time                     | Provider identity decoded without `auth_time`                                                         | Safe authentication return, correlation cleared, no session. Distinct only in diagnostics (FR-015, FR-016). |
| `AuthenticationNotFresh` (`evidence: "stale"`)                       | Valid provider return whose authentication time is outside the window | Window comparison false                                                                               | As above.                                                                                                   |
| `AuthenticationDenied`, `AuthenticationUnavailable`, tenant failures | Unchanged                                                             | Unchanged; a malformed `auth_time` stays an invalid token → `AuthenticationUnavailable` (research D4) | Unchanged.                                                                                                  |

`AuthenticationNotFresh` always carries `correlationDisposition: "clear"`.

**Defects and interruption**: Unchanged. A clock read cannot fail. Interruption during the exchange stays
interruption.

**Effect environment requirements**: None new; `Clock` is the default service, controllable with `TestClock`.

**Compatibility and relationships**: `TrustedIdentity` loses `authenticatedAt`; its only consumers are
`next/callback.ts` and tests. The callback adapter's `responseForReason` switch gains the new tag and maps it with the
other authentication outcomes. `docs/authentication.md` and `docs/session-state.md` replace their stand-in
descriptions in the same slice.

### Contract evidence

| Claim                                                                                       | Meaningful violation                                                           | Durable evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Manual/transient evidence                                   | Limitations and non-duplication                                                                               |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Admission holds exactly inside the inclusive window (V-004)                                 | A value 1 ms past a bound admitted; a bound value denied; callback-only window | New `tests/lib/authentication-freshness.test.ts` through `AuthenticationService.complete` with signed tokens and `TestClock`: examples at `startedAt − 30 s` (admit), one second earlier (deny), `callbackAt + 30 s` (admit), one second later (deny), a time between the two (admit), and one far in the future (deny, `stale`). A Fast-Check property over generated starts, delays, and authentication times: success iff the inclusive comparison holds; otherwise `AuthenticationNotFresh`/`stale` | —                                                           | Real signature validation and real transaction consumption; no real provider. The application boundary is S2. |
| Missing evidence is a freshness denial, not provider failure (V-005)                        | `AuthenticationUnavailable`, or a session                                      | Same file: an ID token without `auth_time` → `AuthenticationNotFresh`/`missing`, correlation `clear`; a replay of the same return → `AuthenticationDenied`; a new `prepare` succeeds. Update the existing "denies missing auth_time" row in `authentication.test.ts`                                                                                                                                                                                                                                    | —                                                           | The non-integer row there stays `AuthenticationUnavailable` (research D4).                                    |
| Stale evidence has the same consumption outcome (V-006)                                     | Replay succeeds or a new login fails                                           | Same file: stale denial, replay denied, new `prepare` succeeds                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                           | —                                                                                                             |
| No tenant setting changes freshness (V-008)                                                 | A tenant field admits a stale or missing time                                  | Property generates tenant files with arbitrary extra fields and both client-auth modes; the outcome depends only on times                                                                                                                                                                                                                                                                                                                                                                               | Code inspection that no setting reaches the freshness child | A provider that ignores `max_age` is the same observable case as stale or missing evidence.                   |
| Only time is judged; no mechanism (V-009)                                                   | `amr`/`acr` or password evidence required or inspected                         | Property tokens carry arbitrary or absent `amr`/`acr`; admission is unaffected                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                           | Login request side is observed by the existing initiation BDD.                                                |
| Callback adapter maps the new reason to the safe page with no session (V-016, adapter part) | Session cookie set, distinct page, correlation kept                            | `tests/unit/authentication-entry-failures.test.ts`: a stubbed service failing with `AuthenticationNotFresh` (both categories) gives the same response as `AuthenticationDenied`, clears correlation, sets no `pathable-session`                                                                                                                                                                                                                                                                         | —                                                           | Existing establishment examples drop the `CallbackFreshness` provision and are otherwise unchanged.           |

## Cross-module dependency direction

`next/callback.ts` → `authentication.ts` (public) → `authentication/freshness.ts` and `authentication/provider.ts`
(private). Only `authentication.ts` imports `authentication/freshness.ts`. Tests import `src/authentication.ts` and
`src/next.ts` only. `authentication/freshness.ts` imports only `effect` (`Duration`) and has no Effect services.

## Rejected abstractions and alternatives

- **Keeping `CallbackFreshness` with a real default**: a configurable seam with one consumer invites the per-tenant
  opt-out FR-007 forbids, and it cannot see the transaction start.
- **A `FreshnessPolicy` service or Layer**: a pure comparison with one caller; Effect adds nothing.
- **Exporting the window function for direct tests**: the public `complete` boundary covers it with real signatures
  and consumption at acceptable cost (research R6).
- **Passing `maxAge` to `openid-client`**: measured from callback time only (research R4).
- **A stored "earlier session existed" marker**: FR-012 forbids depending on it.

## Open decisions

### Blocking contract decisions

- None.

### Implementation choices left to tasks

- Fast-Check generator ranges and `numRuns`, kept small enough for RSA signing per run.
- Whether `authentication/freshness.ts` returns a tagged result or the position literal (see the telemetry contract's
  `preets.authentication.freshness_position`).
