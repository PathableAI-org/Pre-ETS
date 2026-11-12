# Verification Telemetry Contract: Complete Fresh Tenant OIDC Recovery With a New Session

**Plan**: [plan.md](../plan.md)

**Feature verification**: [verification.md](../verification.md)

**Module contracts**: [modules.md](modules.md)

**Status**: Planned design — no instrumentation exists until an implementation slice adds it

This contract designs the runtime telemetry a verification agent needs for the feature's claims. It follows the
[verification telemetry conventions](../../../docs/observability.md#verification-telemetry-conventions) and the
[verification harness](../../../docs/engineering/verification-harness.md). Instrumentation listed here is committed
product code. Durable tests do not assert it.

## Observation coverage

Every claim in `verification.md` whose evidence channel is server telemetry appears here. Session identity reuses the
existing [session-state signals](../../../docs/session-state.md#verification-signals) (`SessionService.establish`,
`SessionService.read`, `protectRequest`) and is not redefined.

| Claim IDs           | Required observation (from `verification.md`)                                                                       | Signal rows                                                                                   | Slice                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------- |
| V-002, V-010, V-011 | For each callback, whether freshness was confirmed, missing, or stale, and whether the event fell inside the window | T-001                                                                                         | S1                     |
| V-003               | The session's bound tenant matches the resolved tenant, and the next protected request is granted                   | T-001, existing `SessionService.establish`, `protectRequest`                                  | S1 (S2 runs it live)   |
| V-010, V-012, V-015 | Which session served a request; a new session differs from the old one; a joined tab issues no new login            | Existing `SessionService.establish` / `read` `session.id`, `protectRequest`, absence of T-001 | S2                     |
| V-014               | Explicit Log in yields a provider step and a new session                                                            | T-001, existing `SessionService.establish`                                                    | S2 (notice), S3 (#157) |
| V-017               | Per tenant, missing versus stale, distinct from provider unavailability, with no token, code, or claim              | T-001, T-002                                                                                  | S1                     |

## Signals

| ID    | Signal | Name                              | Emitted by                                                     | Attributes or fields and data class                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Correlation                                                                                                                                      | Verifier query                                                                                                                                                                                                                                                                   | Expected negative observation                                                                                                                                                                                        |
| ----- | ------ | --------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-001 | Span   | `AuthenticationService.complete`  | `src/authentication.ts` (existing `Effect.fn` span, annotated) | `preets.outcome` (closed set below). `preets.tenant.alias` once resolved (tenant alias). `preets.authentication.freshness`: `confirmed`, `missing`, `stale`, set only once a provider identity was validated (closed-set decision). `preets.authentication.freshness_position`: `inside`, `before_window`, `after_window`, `missing` (closed-set decision). `preets.authentication.transaction_started_ms` and `preets.authentication.callback_ms` once the attempt was consumed (timestamps). `preets.authentication.freshness_tolerance_ms`: `30000` (policy value). | W3C trace context under the `/auth/callback` server span; `preets.tenant.alias`; the following `SessionService.establish` span in the same trace | `{ resource.service.version = "<sha>" && resource.service.instance.id = "<run-uuid>" && name = "AuthenticationService.complete" } \| select(span.preets.outcome, span.preets.tenant.alias, span.preets.authentication.freshness, span.preets.authentication.freshness_position)` | A `confirmed` outcome with position other than `inside`; a `SessionService.establish` span in a trace whose T-001 is not `confirmed`; a provider step skipped yet `confirmed` (V-002 compares with the browser step) |
| T-002 | Log    | `Authentication freshness denied` | `src/authentication.ts`, warning level, inside T-001           | `preets.tenant.alias` (tenant alias); `preets.authentication.freshness`: `missing` or `stale` (closed-set decision). No other fields.                                                                                                                                                                                                                                                                                                                                                                                                                                  | Trace and span IDs of T-001; `preets.tenant.alias`                                                                                               | `{service_name="pre-ets-frontend", service_instance_id="<run-uuid>"} \|= "Authentication freshness denied" \| service_version="<sha>"`                                                                                                                                           | A freshness denial (T-001 `not_fresh_*`) without this log; the log for a provider-unavailable login; any field other than the two listed                                                                             |

Every verifier query filters by the run resource attributes `service.version` (the revision under verification)
and `service.instance.id` (the verification run's UUID). Spans and correlated logs may also correlate by trace
context, `session.id`, and `preets.tenant.alias`.

### Outcome values

| Signal | `preets.outcome` values and meaning                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-001  | `confirmed`: validated identity inside the window. `not_fresh_missing`: validated return without an authentication time. `not_fresh_stale`: authentication time outside the window. `denied`: `AuthenticationDenied` (unqualified, mismatched, replayed, or provider error return). `unavailable`: `AuthenticationUnavailable` (provider, credential, store, or invalid-token failure). `tenant_failure`: `TenantNotFound` or `TenantReadError`. |

Each value is reachable: `confirmed` by any fresh login, `not_fresh_missing` by the module fixture, `not_fresh_stale`
by the module fixture (and the S2 Keycloak client if D9 succeeds), `denied` by a cancelled login or replay,
`unavailable` by stopping the provider, `tenant_failure` by an unknown host.

## Facts not emitted

| Claim IDs           | Fact                                                      | Why it is not emitted                                 | How it is verified instead                                                                                |
| ------------------- | --------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| V-004, V-002        | The raw `auth_time` value                                 | Identity claim (`verification.md` never-emitted list) | `preets.authentication.freshness_position` on T-001; the exact window by the module property (modules.md) |
| V-003, V-012        | Subject, issuer, session reference, cookie value          | Personal data, session reference                      | `session.id` (opaque telemetry ID) on the existing session spans; tenant alias                            |
| V-005, V-006, V-012 | Authorization code, state, nonce, PKCE verifier, ID token | Forbidden protocol values and tokens                  | Replay outcome `denied` on T-001; module tests for consumption                                            |
| V-009               | `amr` / `acr` or any authentication-mechanism claim       | Identity claim; not judged by the product             | Module property; browser observation of the login request                                                 |
| V-013, V-016        | Page content after restoration or denial                  | Free page text; not a server fact                     | Browser interaction                                                                                       |

## Metrics cardinality

No metrics.

## Verifier environment

- The standard harness environment with OTEL enabled and the run's `service.version` and `service.instance.id`.
- The tracked Keycloak realm and its `demo` user; Springfield and Shelbyville tenant fixtures.
- For natural expiry (V-010): a scratch tenant copy with `idleTimeoutMinutes: 5`, never committed.
- For a real stale denial: the S2 stale client and tenant if research D9 succeeds; otherwise the verifier records the
  approved limitation and reads T-001/T-002 from a module-boundary run only as context, not as V-017 evidence.
- Provider unavailability for V-017: stop the Keycloak container during one login, then restart it.
- Export delays from [Observability](../../../docs/observability.md#verification) apply before an empty result counts.

## Readiness review

- [x] Every telemetry-channel claim in `verification.md` maps to at least one signal row or a stated alternative.
- [x] Every signal names its emitting module, its query, and the observation that shows a violation.
- [x] No attribute or field falls in a forbidden data class.
- [x] Metric attributes are low-cardinality.
- [x] Every signal is assigned to the implementation slice that implements the behavior it observes.
