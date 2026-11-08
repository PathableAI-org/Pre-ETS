# Module Architecture and Public Contracts: Shared Session State

**Plan**: [plan.md](../plan.md)

**Feature verification**: [verification.md](../verification.md)

**Status**: Planned convergence contract — signatures verified against current source and installed Effect 4.1.2
declarations on 2026-11-07

## Module architecture decisions

| Concern                        | Current owner and consumers                                                           | Decision             | Public boundary                   | Private decomposition                  | Rationale and non-goals                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------- | -------------------- | --------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Tenant policy                  | `frontend-services/src/tenant.ts`; callback establishment and refresh evidence        | Preserve             | `TenantConfigService`             | `tenant/config.ts`                     | One owner already decodes/defaults policy for actual consumers. No separate policy service/package.                   |
| Session identity and lifecycle | `frontend-services/src/session.ts`; callback, bounded request adapter, runtime, tests | Preserve             | `SessionService`                  | `session/codec.ts`, `session/store.ts` | Parent owns stable outcomes; children own reference/record encoding and Redis mechanics. No second session service.   |
| Bounded application admission  | `frontend-services/src/session-request.ts`; Next page and Server Action               | Preserve             | Root package `readSessionRequest` | Existing request-host/error helpers    | Demonstrates one authorized consumer without becoming comprehensive middleware or exporting raw service operations.   |
| Runtime/resource composition   | `frontend-services/src/runtime.ts` and `production-runtime.ts`; Next host             | Preserve             | Host-installed `Runtime` bridge   | Existing Layers and NodeRedis resource | One process-owned runtime already acquires/disposes Redis and services. No runtime per request or duplicate provider. |
| Parent closure evidence        | Existing unit, integration, outage, and bounded-consumer suites                       | Extend evidence only | Existing public boundaries        | Temporary uncommitted probe            | Current behavior appears complete; rerun and attribute evidence before making source changes.                         |

Every affected concern keeps an explicit current consumer. File size or feature breadth does not justify a new public
module, provider interface, re-export, workspace, or package.

## Public contracts

### `TenantConfigService`

**Responsibility**: Resolve one tenant, decode its complete configuration, and expose the effective session policy
used at establishment or qualifying refresh.

**Actual consumers**:

- `auth/callback.ts` obtains the selected tenant document and effective policy before session establishment.
- `session-policy-refresh.test.ts` represents the authorized handoff from current tenant policy to
  `SessionService.refreshForTenant`.
- `session-request.ts` loads the selected tenant document before tenant-bound session admission.

**Proposed signatures** (preserve current contract):

```ts
export type TenantAlias = typeof TenantAlias.Type
export type TenantConfig = Config.Success<typeof TenantConfig>

export class TenantConfigService extends Context.Service<TenantConfigService, {
  readonly effectiveSessionPolicy: (config: {
    readonly idleTimeoutMinutes?: number
    readonly warningLeadMinutes?: number
  }) => {
    readonly idleTimeoutMinutes: number
    readonly warningLeadMinutes: number
  }
  readonly getAlias: (host: string) => Result.Result<TenantAlias, TenantFailure>
  readonly getConfigFromAlias: (alias: TenantAlias) => Effect.Effect<TenantConfig, TenantFailure>
  readonly getConfigFromHost: (host: string) => Effect.Effect<TenantConfig, TenantFailure>
}>()("@pathableai/pre-ets-frontend/TenantConfigService")
```

`TenantFailure` remains the module-owned `TenantNotFound | TenantReadError` vocabulary exposed to internal consumers
as `HttpError` behavior; the concrete classes and private child `SessionPolicy` name are not added to the package
root.

**Inputs and validation ownership**: Host/alias selection belongs to the tenant parent. The private child decodes the
untrusted tenant JSON with Schema. It accepts explicit whole-minute timeouts 5–30, defaults omission to 30, derives the
authorized warning default, accepts explicit 0, and rejects every invalid explicit policy before returning a config.

**Success semantics and invariants**:

- The returned file represents exactly the selected tenant; unknown/invalid input never falls back to another tenant.
- `effectiveSessionPolicy` is called only on successfully decoded configuration.
- Omitted values produce effective policy without adding absent fields to the decoded source document.
- A policy handoff is structural; no speculative shared policy module is introduced.

**Expected errors**:

| Public error                      | Meaning for consumers                                                                         | Owned internal failures translated here                  | Consumer response                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| `TenantNotFound` (`status: 404`)  | Host/selected tenant is unknown or its document/shape is invalid in host mode                 | Alias mismatch, missing file, invalid JSON/schema/policy | Deny the request; never substitute another tenant or policy. |
| `TenantReadError` (`status: 500`) | Tenant configuration source/directory is unavailable, including selected static configuration | Filesystem/source failures                               | Preserve service failure rather than defaulting policy.      |

**Defects and interruption**: Programming defects, interruption, and unrelated runtime failures remain outside
`TenantFailure`; they are not converted to a default tenant or policy.

**Effect environment requirements**: The live Layer requires filesystem and path services plus the existing server
tenant-resolution configuration. `effectiveSessionPolicy` itself is pure because it consumes an already decoded
document.

**Compatibility and relationships**: Preserve current 404/500 semantics and the callback/session-policy handoff. Do
not expose private file paths, raw configuration, or validation diagnostics to the public package surface.

### Contract evidence

| Claim                                              | Meaningful violation                                     | Durable evidence                                                                             | Manual/transient evidence                       | Limitations and non-duplication                                      |
| -------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| Valid/default timeout and warning policy are exact | Boundary value is wrong or omission/0 is misinterpreted  | `tests/lib/tenant-policy.test.ts` through `TenantConfigService`                              | Parent probe records only effective safe values | Does not establish UI warning presentation.                          |
| Invalid explicit policy fails without fallback     | Invalid input returns 30/5 or another usable policy      | Tenant-policy rejection matrix and `session-policy-refresh.test.ts` before any store command | None                                            | File/source availability is separate from semantic invalidity.       |
| Policy changes apply only at qualifying refresh    | Unrefreshed sessions change or refresh uses stale policy | `session-policy-refresh.test.ts` plus public session property scenarios                      | Two-session parent probe                        | Does not prove configuration distribution across a production fleet. |

### `SessionService`

**Responsibility**: Establish and operate one tenant-bound shared transient session while preserving authoritative
deadline, warning policy, tenant isolation, and fail-closed public outcomes.

**Actual consumers**:

- `auth/callback.ts` establishes state only after trusted callback results and policy selection.
- `session-request.ts` performs tenant-bound reads for the bounded Next.js page/action.
- Current and downstream server workflows consume tenant-bound refresh and invalidation as integration is added.
- Public-interface and real-Redis tests exercise the reusable service directly.

**Proposed signatures** (preserve current contract):

```ts
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

export interface EstablishedSession {
  readonly reference: SessionReference
  readonly session: UsableSession
}

export interface EstablishSessionInput {
  readonly identity: SessionIdentity
  readonly policy: EffectiveSessionPolicy
  readonly tenantAlias: TenantAlias
}

export interface ReadSessionForTenantInput {
  readonly reference?: string
  readonly tenantAlias: TenantAlias
}

export type RefreshSessionForTenantInput =
  | {
    readonly activity: ExcludedSessionActivity
    readonly policy?: never
    readonly reference?: string
    readonly tenantAlias: TenantAlias
  }
  | {
    readonly activity: QualifyingSessionActivity
    readonly policy: EffectiveSessionPolicy
    readonly reference?: string
    readonly tenantAlias: TenantAlias
  }

export class SessionService extends Context.Service<SessionService, {
  readonly establish: (
    input: EstablishSessionInput
  ) => Effect.Effect<EstablishedSession, SessionServiceUnavailable>
  readonly invalidate: (
    input: { readonly reference?: string }
  ) => Effect.Effect<NoUsableSession, SessionServiceUnavailable>
  readonly read: (
    input: { readonly reference?: string }
  ) => Effect.Effect<NoUsableSession | UsableSession, SessionServiceUnavailable>
  readonly readForTenant: (
    input: ReadSessionForTenantInput
  ) => Effect.Effect<NoUsableSession | UsableSession, SessionServiceUnavailable | SessionTenantMismatch>
  readonly refreshForTenant: (
    input: RefreshSessionForTenantInput
  ) => Effect.Effect<NoUsableSession | UsableSession, SessionServiceUnavailable | SessionTenantMismatch>
}>()("@pathableai/pre-ets-frontend/SessionService")
```

`ExcludedSessionActivity` and `QualifyingSessionActivity` retain the closed string-literal sets in `session.ts`.
`SessionServiceUnavailable` and `SessionTenantMismatch` remain fieldless `Schema.TaggedError` classes with their
current stable tags.

**Inputs and validation ownership**: Trusted identity, branded tenant alias, and effective policy are supplied by
upstream owners. The session parent validates an untrusted optional browser reference through its private codec. The
codec validates stored JSON exactly; the store decodes every `unknown` Redis reply rather than trusting TypeScript.

**Success semantics and invariants**:

- Establishment returns one opaque reference and a public session snapshot with a deadline derived from the active
  Effect clock and effective timeout.
- A usable result exposes only issuer/subject, tenant alias, deadline, and warning lead.
- Reads and excluded activity never renew. Qualifying pre-deadline refresh replaces deadline and warning policy
  atomically. Equality or later is expired.
- Tenant-bound operations never return identity for a different tenant.
- Expiry and invalidation are final for the addressed record; concurrent renewal cannot recreate it.
- The session is transient identity/lifecycle state, not arbitrary value storage or durable persistence.

**Expected errors**:

| Public error/outcome        | Meaning for consumers                                             | Owned internal failures translated here                                    | Consumer response                                                  |
| --------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `NoUsableSession`           | Missing/malformed reference or missing/expired/invalidated record | Normal terminal store outcomes                                             | No identity or protected success; no implicit replacement session. |
| `SessionTenantMismatch`     | Current session belongs to another selected tenant                | Private tenant comparison outcome                                          | Deny as forbidden; do not expose either tenant or identity.        |
| `SessionServiceUnavailable` | The operation could not produce a trustworthy result              | Redis transport, codec, malformed reply, unsafe state, exhausted collision | Fail closed and preserve distinction from absence.                 |

**Defects and interruption**: Defects, cancellation, and interruption are not caught into successful defaults.
Ambiguous mutation failures remain service failure and are not blindly retried.

**Effect environment requirements**: Service methods use the active `Clock`; the live Layer requires Redis plus the
existing session-key-prefix configuration. The parent provides its private `SessionStore` Layer. Production supplies
NodeRedis once through the host runtime.

**Compatibility and relationships**: Preserve StoredSession v1 and current public outcomes while this feature is
implemented. Any future migration requires its own authorized compatibility plan. The package root continues to
export only safe session types, not `SessionService`, Redis, the store, or raw references.

### Contract evidence

| Claim                                               | Meaningful violation                                            | Durable evidence                                                             | Manual/transient evidence           | Limitations and non-duplication                                                |
| --------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------ |
| Establish/read preserve exact safe state            | Identity, tenant, deadline, or warning differs                  | `session.test.ts`; independent-client `session-redis.test.ts`                | Cross-client parent probe           | Real-Redis clients are scopes in one process, not authenticated app instances. |
| Deadline and policy adoption are authoritative      | Excluded/late traffic renews, or sessions change simultaneously | Session TestClock examples/properties and real-Redis refresh scenarios       | Two-session policy-change sequence  | Does not prove distributed clock behavior.                                     |
| Expiry/invalidation cannot be reversed              | A race returns usable state after terminal authority            | Ordered and released real-Redis race scenarios                               | Controlled invalidate/renew overlap | Finite schedules do not prove every interleaving.                              |
| Public failure outcomes stay distinct and fieldless | Outage becomes absence/success or leaks private state           | Memory failure cases, disconnected client integration, isolated outage suite | Owned-store outage observation      | Local injection does not establish every managed-service failure.              |
| Shared state needs no creator affinity              | Another client cannot read/update current state                 | Independently scoped/recreated NodeRedis clients                             | Two-client lifecycle probe          | Not complete SESSION-006 AC2–3 application evidence.                           |

### Root package `readSessionRequest`

**Responsibility**: Adapt one host/reference request to the existing tenant and session services for the bounded Next.js
reference page and action.

**Actual consumers**:

- `packages/frontend/src/app/(app)/page.tsx` admits a usable session or redirects no-usable state.
- `packages/frontend/src/app/(app)/actions.ts` returns one bounded protected result or denies no-usable state.

**Proposed signatures** (preserve current package contract):

```ts
export const SESSION_COOKIE = "pathable-session"

export interface ReadSessionRequestInput {
  readonly host: string
  readonly reference?: string
}

export interface ResolvedSessionRequest {
  readonly session: NoUsableSession | UsableSession
  readonly tenantAlias: TenantAlias
}

export const readSessionRequest = (
  input: ReadSessionRequestInput
): Promise<ResolvedSessionRequest>
```

**Inputs and validation ownership**: The adapter parses only the request host needed by existing host/static tenant
selection. Tenant configuration is loaded before session admission. `SessionService` owns reference decoding and
tenant comparison. Next.js owns cookie reading/writing and the page/action response.

**Success semantics and invariants**:

- The returned tenant alias is the single selected tenant for the request.
- `UsableSession` is returned only after tenant-bound admission.
- `NoUsableSession` remains a normal result with no protected fields.
- The adapter neither creates a replacement session nor broadens admission to public auth/diagnostic routes.

**Expected errors**:

| Public error                          | Meaning for consumers                 | Owned internal failures translated here | Consumer response                                                               |
| ------------------------------------- | ------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------- |
| Next `notFound`/tenant 500 behavior   | Tenant selection/configuration failed | Existing `HttpError` mapping            | Render existing tenant failure response.                                        |
| Next `forbidden()`                    | Session tenant mismatch               | `SessionTenantMismatch`                 | Deny without identity, receipt, or redirect.                                    |
| `SessionServiceUnavailable` rejection | Shared session result is unavailable  | Preserved session error                 | Error boundary/failure response; never protected success or login substitution. |

**Defects and interruption**: Unknown failures remain failures. They are not converted into `NoUsableSession` or a
successful page/action result.

**Effect environment requirements**: Internal Effect program requires `TenantConfigService | SessionService`; the
external Promise runs through the already installed host `ManagedRuntime`. No runtime is constructed here.

**Compatibility and relationships**: Root exports remain limited to the adapter, cookie name, and safe session/tenant
types. Refresh, invalidation, activity detection, logout, warning UI, recovery, and comprehensive protection remain
owned by downstream integrations.

### Contract evidence

| Claim                                                   | Meaningful violation                                              | Durable evidence                                       | Manual/transient evidence                   | Limitations and non-duplication                                               |
| ------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------- |
| Tenant selection precedes admission                     | Session is read under an unknown/wrong tenant                     | Frontend-services request-adapter tests                | Production bounded probe                    | Does not prove all request entry points.                                      |
| No-usable, mismatch, and outage fail closed differently | Absence/outage grants a receipt, redirect, or replacement session | Adapter and frontend page/action tests                 | Owned-store outage against bounded consumer | Durable adapter tests use service doubles; the probe composes the real store. |
| One retained page/action demonstrates the handoff       | Evidence is reported as application-wide protection               | Bounded page/action tests and retained partial harness | Production page/action observation          | All other pages, handlers, actions, and new resources remain unclaimed.       |

## Cross-module dependency direction

```text
Next page/action
  -> package root readSessionRequest
    -> session-request.ts
      -> tenant.ts
      -> session.ts
        -> session/codec.ts
        -> session/store.ts
          -> Redis

auth/callback.ts
  -> tenant.ts (effective policy)
  -> session.ts (establish)

production host
  -> production-runtime.ts
    -> runtime.ts
      -> tenant/session/authentication Layers
      -> infrastructure Layer (Redis remains hidden)
```

Only each parent imports its private children. Siblings and external tests consume the parent. The Next.js app imports
the package root and never imports Effect or private frontend-services files.

## Rejected abstractions and alternatives

- New shared policy module/package: no independently owned consumer requires it.
- Public `SessionStore`, Redis reply, key, or record contract: these are private mechanics and unsafe compatibility.
- General session key/value API: explicitly outside issue #153 and temporary-session ownership.
- Package-root lifecycle service export: no current Next.js consumer needs the raw Effect service.
- New runtime, Redis provider, distributed lock, or second coordination key: existing host lifecycle and atomic
  single-key transition satisfy the current contract.
- BDD scenarios or telemetry assertions for component claims: they do not add the required evidence and would cross
  the repository's evidence boundaries.

## Open decisions

### Blocking contract decisions

- None.

### Implementation choices left to tasks

- Whether current source needs any change after contract conformance; no change is preferred when no gap exists.
- Private details inside the temporary probe may vary only when they preserve the fixed path, invocation, helper
  patterns, owned-infrastructure lifecycle, and teardown in [quickstart.md](../quickstart.md).

The probe location and orchestration are fixed by the quickstart. Retained implementation evidence belongs in the
quickstart's implementation-results section; tasks do not choose a separate evidence filename.
