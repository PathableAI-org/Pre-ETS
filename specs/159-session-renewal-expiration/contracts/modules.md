# Public Module Contracts: Renew and Expire Authoritative Sessions

## Module architecture decisions

| Concern               | Decision                                                  | Reason                                                                                            |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Session lifecycle     | Extend `packages/frontend-services/src/session.ts`        | Existing public owner already controls identity, time, codec privacy, storage, and error mapping. |
| Atomic storage        | Extend private `session/store.ts`                         | Redis-specific linearization stays behind the owning parent.                                      |
| Stored record         | Preserve private `session/codec.ts` and `StoredSessionV1` | Existing fields satisfy renewal; no migration or new consumer exists.                             |
| Tenant policy         | Preserve `TenantConfigService`                            | It already owns real tenant selection, policy validation, and defaults.                           |
| Runtime               | Preserve the shared `ApplicationServices` runtime         | No per-operation runtime or new Layer owner is required.                                          |
| HTTP/browser adapters | Defer to #154–#156                                        | This slice accepts semantic server activity; it does not produce events or protect all requests.  |
| Telemetry             | Preserve existing safe annotation                         | No new operational claim or durable telemetry assertion is authorized.                            |

## `packages/frontend-services/src/session.ts`

### New exported types

```ts
export type QualifyingSessionActivity =
  | "deliberate-page-request"
  | "deliberate-form-submission"
  | "intentional-control-activation"
  | "keyboard-interaction"
  | "text-entry"
  | "touch-interaction"
  | "user-driven-meaningful-input-focus"
  | "continue-session"

export type ExcludedSessionActivity =
  | "automatic-polling"
  | "unrelated-background-traffic"
  | "raw-pointer-movement"
  | "programmatic-focus"

export type RefreshSessionForTenantInput =
  | {
    readonly activity: QualifyingSessionActivity
    readonly policy: EffectiveSessionPolicy
    readonly reference?: string
    readonly tenantAlias: TenantAlias
  }
  | {
    readonly activity: ExcludedSessionActivity
    readonly reference?: string
    readonly tenantAlias: TenantAlias
  }
```

These are semantic server-side categories. Downstream adapters must establish their provenance; callers cannot add
categories or pass a boolean that bypasses classification. The union makes policy unavailable to excluded activity.

### Extended service signature

```ts
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
  readonly refreshForTenant: (
    input: RefreshSessionForTenantInput
  ) => Effect.Effect<
    NoUsableSession | UsableSession,
    SessionServiceUnavailable | SessionTenantMismatch
  >
}>() {/* existing layer */}
```

### Contract semantics

**Inputs**

- `reference` is decoded by the session parent; absent or invalid input is ordinary no-session.
- `tenantAlias` is the already selected tenant and must match stored state before mutation.
- `policy` is required only for a qualifying activity and must be the current effective policy returned after real
  tenant configuration consumption.

**Success**

- Excluded activity before the deadline returns the current complete `UsableSession` without a write.
- Qualifying activity strictly before the deadline atomically returns the complete renewed `UsableSession` whose new
  deadline and warning policy come from one input policy.
- Missing state and state at or beyond the deadline return `NoUsableSession`; expired state may be deleted.

**Expected errors**

- `SessionTenantMismatch`: selected tenant does not match stored tenant; no mutation occurs.
- `SessionServiceUnavailable`: Redis, codec, script, or result-decoding failure. It remains fieldless.
- Defects and interruption are not translated into domain outcomes.

**Invariants**

- Equality is expired.
- No successful path returns identity without its authoritative deadline, tenant, and warning policy.
- A stale operation never recreates missing/expired state or overwrites an atomic winner.
- No public error or trace contains a raw reference, key, stored record, identity, token, policy document, or partner
  name.

**Environment and compatibility**

- Calling a provided `SessionService` requires no additional Effect environment; its existing layer continues to
  require `Redis` and configuration.
- Existing methods and public types are source-compatible. The package-root export remains unchanged because current
  consumers import the session parent internally and downstream application wiring is not part of #220.
- Stored V1 records remain readable without migration.

## `packages/frontend-services/src/tenant.ts` (preserved)

The relevant existing contract remains:

```ts
export class TenantConfigService extends Context.Service<TenantConfigService, {
  readonly effectiveSessionPolicy: typeof effectiveSessionPolicy
  readonly getAlias: (host: string) => Result.Result<TenantAlias, TenantFailure>
  readonly getConfigFromAlias: (
    alias: TenantAlias
  ) => Effect.Effect<TenantConfig, TenantFailure>
  readonly getConfigFromHost: (
    host: string
  ) => Effect.Effect<TenantConfig, TenantFailure>
}>() {/* existing layer factory */}
```

The consumer loads a selected config, derives its effective policy, and supplies it only to a qualifying refresh.
Invalid JSON/schema/domain values fail at this boundary and cannot become `RefreshSessionForTenantInput`. The session
module does not import the tenant config child or duplicate its defaults.

## Contract evidence

| Consumer claim                                          | Meaningful violation                                                      | Evidence                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A trusted adapter can present every authorized category | A positive category does not renew or an excluded category writes         | Public service table tests over every literal, with TestClock-controlled deadlines                     |
| Current policy is adopted only on refresh               | An unrefreshed/excluded session changes, or refresh uses old/mixed fields | Two-session policy-change examples plus bounded deadline properties                                    |
| Tenant binding protects policy application              | Another tenant's policy mutates the session                               | Mismatch test through `refreshForTenant`, asserting fieldless failure and unchanged later read         |
| Equality/lateness never revives identity                | At-deadline, late Continue, or timeout increase returns usable state      | Before/equal/after deterministic matrix and properties                                                 |
| Independent clients converge on one winner              | Stale state overwrites expiry or mixed candidates appear                  | Two-runtime real Redis races; final public state equals one complete permitted candidate               |
| Missing/expired/failure stay distinguishable            | Dependency failure becomes no-session or identity                         | Public failure controls and real missing/expiry cases                                                  |
| Invalid selected policy never reaches refresh           | Invalid values produce an effective policy                                | Actual `TenantConfigService` composition tests; existing invalid-policy matrix reused where sufficient |
| No browser timer is required                            | Session stays usable after deadline without a client timer                | Public read/refresh after TestClock advancement and real-store manual observation                      |

The memory Redis helper may understand the script protocol but is test infrastructure, not a second production
contract. Tests import public parent modules only. Durable telemetry assertions are prohibited.

## Dependency direction

```text
trusted downstream adapter (#154–#156)
  ├─> TenantConfigService (select + validate + effective policy)
  └─> SessionService.refreshForTenant (semantic activity + tenant + optional policy)
        ├─> private session codec
        └─> private SessionStore
              └─> Effect Redis
```

No private child is re-exported. `SessionService` does not depend on `TenantConfigService`; the current consumer
composes the two public capabilities.

## Rejected abstractions

- A separate renewal service, public store contract, or shared package.
- DOM/browser-event or HTTP-request types in frontend-services.
- Caller-provided `qualifies: boolean` or open activity strings.
- Application-level `GET`/`SET`, stale retries, process locks, tombstones, or Redis time as policy authority.
- New public errors, StoredSessionV2, refresh history, absolute lifetime, or token/provider data.
- Per-request runtime construction, new dependencies, package-root exports, or application/BDD wiring.

## Open implementation decisions

No product or public-contract decision is open. Implementation may choose an exhaustive internal Lua result encoding,
bounded property sample count, and race synchronization primitive. Each choice must fail closed, preserve the public
signatures above, and be verified against installed Effect 4.0.5 declarations and real Redis 8.10.2.
