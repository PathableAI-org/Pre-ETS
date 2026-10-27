# Module Architecture and Public Contracts: Reference Session Enforcement

**Plan**: [plan.md](../plan.md)

**Feature verification**: [verification.md](../verification.md)

**Status**: Planned design — Effect signatures checked against installed 4.0.5 declarations

## Module architecture decisions

| Concern                            | Current owner and consumers                                                                                                         | Decision                                                                | Public boundary                                                                                  | Private decomposition                                                                                                      | Rationale and non-goals                                                                                                                                                                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session read and tenant admission  | `packages/frontend-services/src/session.ts`; callback/session evidence, new page/action adapter, later #154 consumers               | Extend the existing owner; remove the placeholder operation and export  | `SessionService`                                                                                 | Preserve `session/codec.ts` and `session/store.ts` unchanged                                                               | #218 explicitly deferred tenant-bound reads to #219. Do not create another service, expose Redis, or absorb request-host resolution. Matching admission preserves the exact deadline and warning policy for V-010.                                                     |
| Request-tenant selection           | `packages/frontend-services/src/tenant.ts`; authentication, diagnostics, existing tenant adapter, and new protected-request adapter | Preserve the service; add mode-aware composition in the request adapter | `TenantConfigService`, `TenantAlias`                                                             | Preserve `tenant/config.ts`; raw-first selection and private fallback normalization in `session-request.ts`                | Raw selection preserves static-mode Host independence. Only a failed direct selection is normalized and retried for portful host-mode requests. `getAlias`, `getConfigFromHost`, and the diagnostic route keep their contracts. No new tenant service API is required. |
| Protected request composition      | New `packages/frontend-services/src/session-request.ts`; root page, one Server Action, and later #154 consumers                     | Export one bounded Next adapter over the shared runtime                 | Package export plus the browser contract in [reference-application.md](reference-application.md) | Private pure host normalization and typed Effect composition inside `frontend-services`                                    | The Next app must not import Effect, `Runtime`, or private tenant/session children. The adapter accepts raw request values, resolves tenant before session, and maps typed failures at the awaited framework boundary.                                                 |
| Protected page/action presentation | `packages/frontend/src/app/(app)` and a new Bulletproof `src/features/session-reference.ts` public entry                            | Keep host actions in app and feature UI behind its public entry         | Next page/Server Action contract in [reference-application.md](reference-application.md)         | `(app)/page.tsx`, `(app)/actions.ts`, and private `features/session-reference/{action-state,reference-operation}` children | The app owns Next control flow and passes the action into the client island. The feature does not import `src/app`; `actions.ts` exports only the async action. This is not default application-wide enforcement.                                                      |
| Synthetic protected effect         | New reference Server Action and its running-browser verifier                                                                        | Keep private and response-scoped                                        | Receipt behavior in [reference-application.md](reference-application.md)                         | Action-owned cookie helper                                                                                                 | A response cookie supplies independent evidence without a domain record, Redis counter, telemetry assertion, or public diagnostic.                                                                                                                                     |
| Runtime/resource composition       | Existing `packages/frontend-services/src/runtime.ts` process runtime                                                                | Preserve                                                                | Existing `ApplicationServices` and `Runtime.runPromise`                                          | Existing production runtime                                                                                                | `SessionService` and `TenantConfigService` already live in the host-owned `ManagedRuntime`; no new service or Layer is required.                                                                                                                                       |

Every affected concern has a current consumer. File size or feature novelty does not create another public module,
provider interface, re-export surface, or workspace package.

## Public contracts

### `packages/frontend-services/src/session.ts`

**Responsibility**: Establish and read the frontend application session, then admit it only when its stored tenant
matches an independently resolved request tenant, while hiding Redis and wire details.

**Actual consumers**:

- OIDC callback Route Handler: continues to establish a session after trusted, freshness-confirmed authentication.
- Existing independent-client/integration evidence: continues to use raw `read` to establish store behavior without
  claiming request authorization.
- The exported `session-request.ts` adapter: uses `readForTenant` after request-tenant resolution for the reference
  page and Server Action.
- Later #154 integration: reuses `readForTenant` across the comprehensive entry-point inventory.

**Proposed signatures**:

```ts
import type { Redis } from "effect/persistence/Redis"
import { type Config, Context, Effect, Layer, Schema } from "effect"

import type { SessionReference } from "./session/codec.js"
import type { TenantAlias } from "./tenant.js"

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
an intentional private-workspace cleanup covering `SessionService`, `frontend-services/src/entry.ts`, the package
index export, the root placeholder, runtime-composition assertions, and test service fixtures. `TenantConfigService`
remains upstream; protected consumers use `readForTenant` through the package request adapter, while raw `read` remains
construction/adapter evidence and is not authorization.

### Contract evidence

| Claim                                                                                        | Meaningful violation                                                                                     | Durable evidence                                                                                                                       | Manual/transient evidence                                                                               | Limitations and non-duplication                                                                           |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| A matching independently resolved tenant receives the exact usable identity/deadline/policy. | Admission changes identity, recomputes/drops deadline or warning policy, or ignores the supplied tenant. | Public `@effect/vitest` examples plus a Fast-Check equality property through real `SessionService.layer` and isolated in-memory Redis. | The rendered page records the same safe identity, deadline, and warning values supplied by the session. | Does not prove real Redis sharing or HTTP rendering. Existing `read` tests keep codec/deadline ownership. |
| A different tenant yields only `SessionTenantMismatch`.                                      | Cross-tenant input returns usable/absent state, leaks either tenant, or becomes service failure.         | Public service examples for distinct branded aliases; inspect the expected error's public diagnostic for no identity/tenant payload.   | Running HTTP matrix establishes actual 403 and no protected effect.                                     | Module evidence does not establish Next status or forbidden presentation.                                 |
| No usable session remains distinct from mismatch and failure.                                | Missing/malformed/expired input becomes forbidden, success, or failure.                                  | Existing `read` examples plus focused `readForTenant` pass-through cases; no duplicate codec/store matrix.                             | Page redirect and stale-action denial through the running app.                                          | Existing session tests own cause classification; exact expired/invalidated cause may remain unknown.      |
| Service failure remains distinguishable and fail closed.                                     | Store/codec failure becomes `NoUsableSession`, mismatch, or admission.                                   | Injected/real service failure at the public operation and existing real-Redis outage evidence.                                         | Controlled running-app Redis outage, restoration, and zero-effect observation.                          | Does not establish #221's complete outage/recovery/race guarantees.                                       |

The first row is the durable public-service evidence for V-010. Equality is checked against the `UsableSession`
returned by `read`; deriving the expected deadline or warning values again in the admission test would not establish
unchanged handoff.

## Exported protected-request adapter

`packages/frontend-services/src/session-request.ts` is a public package adapter, not a new Effect service. It accepts
raw framework values and runs the existing tenant/session services on the installed shared runtime:

```ts
export interface ReadSessionRequestInput {
  readonly host: string
  readonly reference?: string
}

export interface ResolvedSessionRequest {
  readonly session: NoUsableSession | UsableSession
  readonly tenantAlias: TenantAlias
}

export const readSessionRequest: (
  input: ReadSessionRequestInput
) => Promise<ResolvedSessionRequest>
```

The package index exports this helper and the one session-cookie name/read surface needed by the app; callback writing
and protected reading must not duplicate the literal. The adapter:

1. calls `TenantConfigService.getAlias(input.host)` with the raw Host;
2. on direct failure only, strictly normalizes the Host with authentication's private acceptance rules and retries
   `getAlias` with the lowercase hostname;
3. calls `getConfigFromAlias` before session access;
4. calls `SessionService.readForTenant({ reference, tenantAlias })`; and
5. maps tenant failure, mismatch, and service failure at the awaited Next boundary without catching Next control flow.

A direct success is required for static mode: malformed and unresolvable hosts still select the configured static
alias. In host mode, `alias.localhost:3000` takes the fallback and calls `getAlias("alias.localhost")`; an unparseable
value or failed retry preserves the original direct-selection failure. That is a tenant 404 for invalid/unknown
host-mode input; a static-selector configuration failure is not rewritten as a Host failure. A matching result contains
the same `UsableSession` instance, including the exact deadline and warning policy required by V-010.

## Consumed unchanged public contract

`TenantConfigService.getAlias(host)` continues to return `Result<TenantAlias, TenantFailure>` and
`getConfigFromAlias(alias)` continues to return `Effect<TenantConfig, TenantFailure>`. The reference adapter first calls
`getAlias` with the raw Host. Static mode succeeds regardless of that Host. Only a failed direct selection is strictly
normalized and retried with the lowercase hostname; `alias.localhost:3000` therefore reaches
`getAlias("alias.localhost")` in host mode. An unparseable Host is a 404 only after direct host-mode selection fails.
`getConfigFromHost` and `GET /_test/tenant-config` still receive the raw Host header. No new tenant method, error,
Layer, schema, or re-export is planned, and existing authentication/diagnostic consumers remain source-compatible.

## Cross-module dependency direction

```text
Next page / Server Action
  -> @pathableai/pre-ets-frontend-services readSessionRequest(raw Host, opaque reference)
     -> TenantConfigService.getAlias(raw Host)
        -> direct failure only: private normalization, then getAlias(lowercase hostname)
     -> TenantConfigService.getConfigFromAlias
     -> SessionService.readForTenant
        -> private session codec and store children
           -> shared process Redis capability
```

`SessionService` may import the public `TenantAlias` type but never tenant private children or `TenantConfigService`.
Only the `frontend-services` request adapter imports the public tenant/session parents and shared runtime; it never
imports private `session/*` or `tenant/*` children. The frontend page and action import the adapter from the package
index and do not import Effect or `Runtime`. The Bulletproof public entry
`packages/frontend/src/features/session-reference.ts` owns the private action-state and client-island children. The app
page passes `runReferenceOperation` into the island; the feature never imports `src/app` and receives no tenant config,
cookie, session reference, or identity props. Public authentication and diagnostics do not import the protected
request adapter.

## Rejected abstractions and alternatives

- Port-stripping inside `getAlias` or `getConfigFromHost`: the raw-host contract and diagnostic route stay unchanged.
- Normalize before direct tenant selection: this would reject Hosts that static mode is required to ignore. Raw
  selection remains first; authentication's private acceptance rules are copied only for the failed host-mode fallback.
- A public host-parser service or an Effect service around normalization: authentication's private `parseRequestHost`
  stays unexported, and the package adapter owns a private pure copy of those acceptance rules.
- A runtime `initialReferenceActionState` export from the `"use server"` module: that file can export only async
  functions, so the state constant lives in the private Bulletproof feature child.
- New enforcement service/Layer: no distinct resource, lifecycle, or error owner justifies it.
- Backend/shared-domain contract: enforcement remains frontend-process-owned in the existing `frontend-services`
  workspace and no backend consumer exists.
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
- Focused test filenames and private helper decomposition inside `frontend-services` and the Bulletproof feature.
