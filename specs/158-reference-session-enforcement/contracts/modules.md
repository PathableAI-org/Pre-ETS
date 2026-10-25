# Module Architecture and Public Contracts: Reference Session Enforcement

**Plan**: [plan.md](../plan.md)

**Feature verification**: [verification.md](../verification.md)

**Status**: Planned design — Effect signatures checked against installed 4.0.5 declarations

## Module architecture decisions

| Concern                           | Current owner and consumers                                                                                  | Decision                                                       | Public boundary                                                                          | Private decomposition                                                                           | Rationale and non-goals                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Session read and tenant admission | `lib/session.ts`; current root placeholder, callback/session evidence, new page/action, later #154 consumers | Extend the existing owner; remove the placeholder operation    | `SessionService`                                                                         | Preserve `session/codec.ts` and `session/store.ts` unchanged                                    | #218 explicitly deferred tenant-bound reads to #219. Do not create another service, expose Redis, or absorb request-host resolution.    |
| Request-tenant selection          | `lib/tenant.ts`; authentication, diagnostics, and `(app)` request helper                                     | Preserve the service; normalize only in the reference adapter  | `TenantConfigService`, `TenantAlias`                                                     | Preserve `tenant/config.ts`; private pure host normalization in `(app)/tenant-context.ts`       | The reference adapter applies `parseRequestHost` rules and passes only the lowercase hostname to `getAlias`, then `getConfigFromAlias`. `getAlias`, `getConfigFromHost`, and the diagnostic route keep the raw-host contract. No new tenant API is required. |
| Protected page/action mapping     | Current `(app)` root and new action/client island                                                            | Replace the root placeholder and add a bounded private adapter | Next page/Server Action contract in [reference-application.md](reference-application.md) | `(app)/tenant-context.ts`, `(app)/session-context.ts`, `(app)/reference-action-state.ts`, `(app)/actions.ts`, one client component | Next control flow, headers, cookies, and UI state stay outside Effect domain modules. `actions.ts` exports only the async action. This is not default application-wide enforcement. |
| Synthetic protected effect        | New reference Server Action and its running-browser verifier                                                 | Keep private and response-scoped                               | Receipt behavior in [reference-application.md](reference-application.md)                 | Action-owned cookie helper                                                                      | A response cookie supplies independent evidence without a domain record, Redis counter, telemetry assertion, or public diagnostic.      |
| Runtime/resource composition      | Existing `lib/runtime.ts` process runtime                                                                    | Preserve                                                       | Existing `ApplicationServices` and `Runtime.runPromise`                                  | Existing production runtime                                                                     | `SessionService` already lives in the host-owned `ManagedRuntime`; no new service or Layer is required.                                 |

Every affected concern has a current consumer. File size or feature novelty does not create another public module,
provider interface, re-export surface, or workspace package.

## Public contracts

### `packages/frontend/src/lib/session.ts`

**Responsibility**: Establish and read the frontend application session, then admit it only when its stored tenant
matches an independently resolved request tenant, while hiding Redis and wire details.

**Actual consumers**:

- OIDC callback Route Handler: continues to establish a session after trusted, freshness-confirmed authentication.
- Existing independent-client/integration evidence: continues to use raw `read` to establish store behavior without
  claiming request authorization.
- Reference protected page and Server Action: use `readForTenant` after request-tenant resolution.
- Later #154 integration: reuses `readForTenant` across the comprehensive entry-point inventory.

**Proposed signatures**:

```ts
import type { Redis } from "effect/persistence/Redis"
import { type Config, Context, Effect, Layer, Schema } from "effect"

import type { SessionReference } from "./session/codec.ts"
import type { TenantAlias } from "./tenant.ts"

export type { SessionReference }

export interface EffectiveSessionPolicy {
  readonly idleTimeoutMinutes: number
  readonly warningLeadMinutes: number
}

export interface SessionIdentity {
  readonly issuer: string
  readonly subject: string
}

export interface UsableSession {
  readonly _tag: "UsableSession"
  readonly identity: SessionIdentity
  readonly idleDeadlineEpochMilliseconds: number
  readonly tenantAlias: TenantAlias
  readonly warningLeadMinutes: number
}

export interface NoUsableSession {
  readonly _tag: "NoUsableSession"
}

export interface EstablishSessionInput {
  readonly identity: SessionIdentity
  readonly policy: EffectiveSessionPolicy
  readonly tenantAlias: TenantAlias
}

export interface EstablishedSession {
  readonly reference: SessionReference
  readonly session: UsableSession
}

export interface ReadSessionForTenantInput {
  readonly reference?: string
  readonly tenantAlias: TenantAlias
}

export class SessionServiceUnavailable extends Schema.TaggedError<SessionServiceUnavailable>()(
  "@pathableai/pre-ets-frontend/SessionServiceUnavailable",
  {}
) {
  static readonly tag: "@pathableai/pre-ets-frontend/SessionServiceUnavailable"
}

export class SessionTenantMismatch extends Schema.TaggedError<SessionTenantMismatch>()(
  "@pathableai/pre-ets-frontend/SessionTenantMismatch",
  {}
) {
  static readonly tag: "@pathableai/pre-ets-frontend/SessionTenantMismatch"
}

export class SessionService extends Context.Service<SessionService, {
  readonly establish: (
    input: EstablishSessionInput
  ) => Effect.Effect<EstablishedSession, SessionServiceUnavailable>
  readonly read: (
    input: { readonly reference?: string }
  ) => Effect.Effect<NoUsableSession | UsableSession, SessionServiceUnavailable>
  readonly readForTenant: (
    input: ReadSessionForTenantInput
  ) => Effect.Effect<
    NoUsableSession | UsableSession,
    SessionServiceUnavailable | SessionTenantMismatch
  >
}>()("@pathableai/pre-ets-frontend/SessionService") {
  static readonly layer: Layer.Layer<SessionService, Config.ConfigError, Redis>
}
```

The existing branded `SessionReference` export and its exact installed implementation remain unchanged. The temporary
`hasSession(): Effect.Effect<boolean>` member is removed.

**Inputs and validation ownership**: `establish` continues to accept already validated identity, policy, and branded
tenant input. `read` owns decoding the untrusted optional cookie string. `readForTenant` accepts the same untrusted
reference plus the branded alias already resolved by `TenantConfigService`; it does not parse hosts, load configuration,
read cookies, or re-decode trusted values. Private codec/store children continue to own record validation and Redis
addressing.

**Success semantics and invariants**:

- `readForTenant` delegates reference/store/deadline classification to `read`.
- `NoUsableSession` passes through unchanged and carries no protected data.
- A matching tenant returns the exact `UsableSession` object from `read`, preserving identity, tenant, authoritative
  idle deadline, and effective warning policy.
- A different tenant never returns a usable session and never substitutes the stored tenant for the request tenant.
- Removing `hasSession` cannot grant access; its only implementation always returned false and its consumers migrate to
  the typed tenant-bound result.

**Expected errors**:

| Public error                | Meaning for consumers                                                           | Owned internal failures translated here                                                           | Consumer response                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `SessionTenantMismatch`     | A usable session exists but is bound to another tenant. The error is fieldless. | Exact inequality between the independently resolved branded alias and `UsableSession.tenantAlias` | Thin Next adapters invoke `forbidden()` before protected content/effect.                            |
| `SessionServiceUnavailable` | Session state could not be safely determined or persisted.                      | Existing Redis command/transport, strict stored-record codec, and bounded collision failures      | Fail closed; do not redirect to login, create a replacement, return success, or perform the effect. |

Absent, malformed, missing-record, expired, and invalidated references remain `NoUsableSession`, not expected errors.

**Defects and interruption**: Programming defects, impossible internal invariants, runtime interruption, and unrelated
Layer defects remain defects/interruption. `readForTenant` does not catch all causes or turn them into absence,
mismatch, or success.

**Effect environment requirements**: Constructed service operations require no environment. `SessionService.layer`
continues to require installed `Redis` and configuration, and uses the existing Effect clock/randomness. The host
provides one scoped Redis Layer through one `ManagedRuntime`. Next headers, cookies, redirects, and forbidden interrupts
do not enter this module.

**Compatibility and relationships**: `establish`, `read`, public results, `SessionServiceUnavailable`, stored wire
format, key prefix, and callback behavior are source-compatible. `readForTenant` is additive. Removing `hasSession` is
an intentional private-workspace cleanup limited to the root placeholder, runtime-composition assertion, and test
service fixtures. `TenantConfigService` remains upstream; protected consumers must use `readForTenant`, while raw
`read` remains construction/adapter evidence and is not authorization.

### Contract evidence

| Claim                                                                                   | Meaningful violation                                                                             | Durable evidence                                                                                                                       | Manual/transient evidence                                                          | Limitations and non-duplication                                                                           |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| A matching independently resolved tenant receives the unchanged usable identity/policy. | Admission changes identity/deadline/warning fields or ignores the supplied request tenant.       | Public `@effect/vitest` examples plus a Fast-Check equality property through real `SessionService.layer` and isolated in-memory Redis. | Running page/action evidence compares safe synthetic identity/tenant descriptions. | Does not prove real Redis sharing or HTTP rendering. Existing `read` tests keep codec/deadline ownership. |
| A different tenant yields only `SessionTenantMismatch`.                                 | Cross-tenant input returns usable/absent state, leaks either tenant, or becomes service failure. | Public service examples for distinct branded aliases; inspect the expected error's public diagnostic for no identity/tenant payload.   | Running HTTP matrix establishes actual 403 and no protected effect.                | Module evidence does not establish Next status or forbidden presentation.                                 |
| No usable session remains distinct from mismatch and failure.                           | Missing/malformed/expired input becomes forbidden, success, or failure.                          | Existing `read` examples plus focused `readForTenant` pass-through cases; no duplicate codec/store matrix.                             | Page redirect and stale-action denial through the running app.                     | Existing session tests own cause classification; exact expired/invalidated cause may remain unknown.      |
| Service failure remains distinguishable and fail closed.                                | Store/codec failure becomes `NoUsableSession`, mismatch, or admission.                           | Injected/real service failure at the public operation and existing real-Redis outage evidence.                                         | Controlled running-app Redis outage, restoration, and zero-effect observation.     | Does not establish #221's complete outage/recovery/race guarantees.                                       |

## Consumed unchanged public contract

`TenantConfigService.getAlias(host)` continues to return `Result<TenantAlias, TenantFailure>` and
`getConfigFromAlias(alias)` continues to return `Effect<TenantConfig, TenantFailure>`. The reference adapter calls them
in that order only after pure host normalization, and it passes `getAlias` the lowercase hostname rather than the raw
`Host` header. An unparseable host is the existing tenant 404 and does not call `getAlias`. `getConfigFromHost` and
`GET /_test/tenant-config` still receive the raw Host header. No new tenant method, error, Layer, schema, or re-export
is planned, and existing authentication/diagnostic consumers remain source-compatible. The
`alias.localhost:3000` adapter example asserts that the port is not an argument to `getAlias`.

## Cross-module dependency direction

```text
Next page / Server Action
  -> private pure host normalization (parseRequestHost acceptance rules)
  -> TenantConfigService.getAlias(lowercase hostname), then getConfigFromAlias
  -> SessionService.readForTenant
     -> private session codec and store children
        -> shared process Redis capability
```

`SessionService` may import the public `TenantAlias` type but never tenant private children or `TenantConfigService`.
The `(app)` adapter imports public tenant/session modules and app-owned cookie helpers; it never imports
`lib/session/*`. The client component imports `ReferenceActionState` and `initialReferenceActionState` from
`(app)/reference-action-state.ts` and `runReferenceOperation` from `(app)/actions.ts`. It receives no tenant config,
cookie, session reference, or identity props. Public authentication and diagnostics do not import the protected
session adapter.

## Rejected abstractions and alternatives

- Port-stripping inside `getAlias` or `getConfigFromHost`: the raw-host contract and diagnostic route stay unchanged.
- A public host-parser service or an Effect wrapper around the pure hostname normalization: authentication's private
  `parseRequestHost` stays unexported, and the reference adapter owns a private pure copy of those acceptance rules.
- A runtime `initialReferenceActionState` export from the `"use server"` module: that file can export only async
  functions, so the state constant lives in the sibling module.
- New enforcement service/Layer: no distinct resource, lifecycle, or error owner justifies it.
- Shared package/backend contract: enforcement is frontend-owned and no cross-process consumer exists.
- Host-aware session service: would mix tenant selection with session persistence and permit substitution.
- Middleware/Proxy default guard: would claim comprehensive coverage that belongs to #154.
- Redis-backed synthetic-effect service: arbitrary application-value storage and domain persistence are out of scope.
- Observability contract/tests: this slice adds no monitoring obligation and telemetry is not authorization evidence.

## Open decisions

### Blocking contract decisions

- None. B6 authentication-time comparison, clock tolerance, and provider support limit successful real-login evidence
  but do not alter this public contract.

### Implementation choices left to tasks

- Exact bounded success/denial/forbidden copy, provided it has meaningful accessible names and exposes no protected
  data on denial.
- The receipt cookie's non-semantic value and bounded lifetime; neither is a public contract or retained evidence.
- Focused test filenames and helper decomposition under the private `(app)` boundary.
