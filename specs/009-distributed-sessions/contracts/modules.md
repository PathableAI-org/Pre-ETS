# Module Architecture and Public Contracts: Establish Distributed Application Sessions

**Plan**: [plan.md](../plan.md)

**Feature verification**: [verification.md](../verification.md)

**Status**: Planned design — proposed Effect and Redis APIs were checked against the installed 4.0.5 declarations

## Module architecture decisions

| Concern                              | Current owner and consumers                                                                                              | Decision                                     | Public boundary                                       | Private decomposition                  | Rationale and non-goals                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Session establishment/read semantics | `packages/frontend/src/lib/session.ts`; current root presence consumer, new callback consumer, later #219/#154 consumers | Extend and decompose                         | `SessionService`                                      | `session/codec.ts`, `session/store.ts` | One frontend owner is already present. Do not expose Redis commands, arbitrary values, renewal, or invalidation.        |
| Trusted callback identity            | `lib/authentication.ts`; callback Route Handler                                                                          | Export the result and keep its alias branded | `AuthenticationService` / `TrustedIdentity`           | Existing authentication children       | Session creation consumes a freshness-confirmed trusted output and does not absorb OIDC or freshness-policy validation. |
| Effective tenant policy              | `lib/tenant.ts`; authentication and new session callback consumer                                                        | Export the existing `TenantAlias` brand      | `TenantConfigService` and `TenantAlias`               | Existing private tenant config child   | The tenant module remains the single policy/default owner. The brand is public so callers do not cast it.               |
| Callback-to-session composition      | `app/auth/callback/route.ts`; browser/provider return                                                                    | Extend existing framework adapter            | HTTP contract in [callback-http.md](callback-http.md) | Existing cookie/presentation helpers   | One consumer does not justify a public coordinator service. No protected access is added.                               |
| Redis process resource               | `lib/runtime.ts`; authentication transaction layer                                                                       | Preserve and share one Layer value           | Host `ManagedRuntime` composition                     | Existing `NodeRedis.layer`             | Key prefixes separate ownership; no second Redis or per-request client.                                                 |
| Session telemetry                    | Existing observability Layer; manual verifier                                                                            | Extend session operation spans               | Existing Effect/OpenTelemetry bridge                  | None                                   | `session.id` is a non-bearer stored correlation identifier. No new exporter/service or durable telemetry test.          |

Every affected concern has an actual current consumer. File size or feature novelty does not create another public
module, provider interface, re-export surface, or workspace package.

## Public contracts

### `packages/frontend/src/lib/session.ts`

**Responsibility**: Establish and read the bounded frontend application-session record while hiding its Redis and wire
representation.

**Actual consumers**:

- Callback Route Handler: establishes a session after trusted OIDC completion and needs the cookie reference only after
  persistence succeeds.
- Existing root page: continues to call the fail-closed `hasSession` compatibility operation until #219 owns real
  tenant-bound request consumption.
- Integration/manual clients: read the created reference through an independently scoped service to establish shared
  state behavior.
- Later #219/#154 consumers: will use `read` rather than rebuilding Redis access.

**Proposed signatures**:

```ts
import type { Redis } from "effect/persistence/Redis"
import { Config, Context, Effect, Layer, Schema } from "effect"

import type { TenantAlias } from "./tenant.ts"

declare const SessionReferenceBrand: unique symbol

export type SessionReference = string & {
  readonly [SessionReferenceBrand]: typeof SessionReferenceBrand
}

export interface SessionIdentity {
  readonly issuer: string
  readonly subject: string
}

export interface EffectiveSessionPolicy {
  readonly idleTimeoutMinutes: number
  readonly warningLeadMinutes: number
}

export interface EstablishSessionInput {
  readonly identity: SessionIdentity
  readonly policy: EffectiveSessionPolicy
  readonly tenantAlias: TenantAlias
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

export class SessionServiceUnavailable extends Schema.TaggedError<SessionServiceUnavailable>()(
  "@pathableai/pre-ets-frontend/SessionServiceUnavailable",
  {}
) {}

export class SessionService extends Context.Service<SessionService, {
  readonly establish: (
    input: EstablishSessionInput
  ) => Effect.Effect<EstablishedSession, SessionServiceUnavailable>
  readonly hasSession: () => Effect.Effect<boolean>
  readonly read: (
    input: { readonly reference?: string }
  ) => Effect.Effect<UsableSession | NoUsableSession, SessionServiceUnavailable>
}>()("@pathableai/pre-ets-frontend/SessionService") {
  static readonly layer: Layer.Layer<
    SessionService,
    Config.ConfigError,
    Redis
  >
}
```

**Inputs and validation ownership**: `establish` accepts identity and policy already validated by the authentication
and tenant parents, then validates the strict stored representation before writing. `read` owns decoding the untrusted
optional cookie string. The private codec owns reference and stored-record schemas; consumers cannot construct a trusted
reference by assertion. Issuer, subject, and tenant association are sensitive transient identity metadata. The private
store may persist the encoded record but must not log it, attach it to telemetry/errors, or expose it to verification
tools outside safe synthetic public-result comparisons.

**Success semantics and invariants**:

- `establish` returns only after one Redis record exists with a TTL and returns its reference plus the same
  consumer-visible state. User identity is issuer plus subject; tenant is copied without substitution.
- `read` returns `UsableSession` only for a decodable record strictly before its stored deadline.
- `NoUsableSession` contains no identity, tenant, deadline, or warning policy.
- `warningLeadMinutes === 0` preserves the disabled warning policy.
- `hasSession` remains false for its current no-input root consumer; this feature does not silently turn presence into
  authorization before #219 supplies request reference and independently resolved tenant.
- The telemetry identifier is not part of any public value.

**Expected errors**:

| Public error                | Meaning for consumers                                                                                                                                                                     | Owned internal failures translated here                                                              | Consumer response                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `SessionServiceUnavailable` | The service could not persist or determine session state; the caller must fail closed. The error is fieldless: codec and store diagnostics are discarded before it is returned or traced. | Redis command/transport failure, stored-record encode/decode corruption, exhausted create collisions | Callback sets no session cookie; reads do not grant access or create a replacement. |

Missing, malformed, expired, and deleted references are `NoUsableSession`, not errors. Defects and interruption are not
collapsed into this expected error.

**Defects and interruption**: Programming defects, impossible internal invariants, runtime interruption, and unrelated
Layer defects remain defects/interruption. They are not converted to absence or `SessionServiceUnavailable` merely to
keep a request alive.

**Effect environment requirements**: Operations are fully provided by the constructed service. `SessionService.layer`
requires the installed Effect Redis service and Config provider, and obtains current time/randomness within the Effect/
Node environment. The host supplies one scoped NodeRedis Layer. Next-specific cookies do not enter this service.

**Compatibility and relationships**: This is an intentional extension of the current service. `hasSession` preserves
the root's fail-closed behavior. `AuthenticationService` and `TenantConfigService` remain upstream; later enforcement
depends on this service, never its private children. The stored wire version is internal and strict.

### Contract evidence

| Claim                                                                                        | Meaningful violation                                                                         | Durable evidence                                                                                                                 | Manual/transient evidence                                                                                                                                                                                      | Limitations and non-duplication                                                         |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Establishment returns the exact identity, tenant, deadline, and warning policy it persisted. | A field changes, default is recomputed incorrectly, or success is returned without a record. | Public `@effect/vitest` service scenarios with controlled clock and deterministic Redis Layer; representative accepted policies. | Composed real callback/session read in quickstart.                                                                                                                                                             | Unit Layer does not establish real Redis or provider behavior.                          |
| Only usable reads expose identity/policy.                                                    | Missing/malformed/expired/deleted input yields identity or store error becomes absence.      | Public service scenarios for all outcomes and strict codec failure.                                                              | Real-store missing/deleted/expired and outage observations.                                                                                                                                                    | Explicit invalidation operation/races remain #221.                                      |
| Independent clients see identical state.                                                     | Client B misses or changes client A's record.                                                | Real Redis integration with two independently scoped NodeRedis clients and owned prefix.                                         | Manual second-client read.                                                                                                                                                                                     | Does not establish independently running protected HTTP consumption (#219/#154).        |
| Service failure is distinct and fail closed.                                                 | Redis outage produces `NoUsableSession`, usable identity, replacement, or a cookie.          | Real Redis controlled-unavailability integration at establish/read plus callback adapter error mapping.                          | Controlled manual failure when safe.                                                                                                                                                                           | Does not establish all outage recovery sequences (#221).                                |
| `session.id` correlates successful creation/read without bearer disclosure.                  | Attribute missing/mismatched or equals cookie/key; rejected/failure span implies success.    | None; durable telemetry assertions are prohibited.                                                                               | Real exported Tempo trace inspection. The temporary independent-reader probe composes `observabilityLayer` plus its Config/Node host layers, disposes its scoped runtime to flush export, and is then deleted. | Export/sampling can lose traces; telemetry does not prove cookie/store/public outcomes. |

### `packages/frontend/src/lib/authentication.ts`

**Responsibility**: Preserve provider/transaction validation and expose its already-existing trusted result type to the
bounded callback consumer.

**Actual consumers**:

- Callback Route Handler maps a successful trusted result into `SessionService.establish`.

**Proposed signature change**:

```ts
import type { TenantAlias } from "./tenant.ts"

export interface TrustedIdentity {
  readonly authenticatedAt: number
  readonly issuer: string
  readonly subject: string
  readonly tenantAlias: TenantAlias
}

export class AuthenticationService extends Context.Service<AuthenticationService, {
  readonly complete: (
    input: CompleteAuthenticationInput
  ) => Effect.Effect<TrustedIdentity, CallbackExpectedFailure>
  readonly prepare: (
    input: { readonly host: string }
  ) => Effect.Effect<PreparedAuthentication, AuthenticationUnavailable | HttpError>
}>() /* existing tag and layer */
```

Export `TrustedIdentity` and type `tenantAlias` as the branded `TenantAlias` from the tenant public module.
`AuthenticationService.complete` already returns the alias decoded by `getAlias`; this change stops widening that
value to `string`. Callback input, preparation, failures, and validation behavior remain unchanged. The callback
passes `tenantAlias` to `getConfigFromAlias` with no cast.

**Inputs and validation ownership**: Authentication retains full ownership of OIDC transaction, state/nonce, token,
issuer/audience/signature, and identity-claim validation. The session module accepts the successful result as trusted and
does not see provider tokens.

**Success semantics and invariants**: The tenant alias in `TrustedIdentity` is the callback-qualified tenant; issuer and
subject identify the user; `authenticatedAt` remains available for the owning authentication/freshness work but is not
persisted by this session slice.

**Expected errors**: Existing `CallbackExpectedFailure` and its reason/disposition semantics are unchanged. Session
failure is not added to `AuthenticationService`.

**Defects and interruption**: Unchanged from the current module.

**Effect environment requirements**: Unchanged; session dependency is not injected into authentication.

**Compatibility and relationships**: Exporting a previously internal named return interface is additive. It prevents
the callback/session handoff from duplicating the trusted-identity shape.

### Contract evidence

| Claim                                                                                             | Meaningful violation                                                                                                                                                      | Durable evidence                                                                                                                                                                 | Manual/transient evidence                                            | Limitations and non-duplication                                                                                   |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Session establishment receives a freshness-confirmed trusted result, and the alias stays branded. | Rejected completion, or a trusted result with unconfirmed freshness, invokes session creation; or `tenantAlias` is widened to `string` and cast for `getConfigFromAlias`. | Callback Route Handler scenario with confirmed, unconfirmed, and failure results, asserting `SessionService.establish` only after confirmation and a typed `TenantAlias` lookup. | Real rejected and unconfirmed returns emit no session cookie/record. | This plan does not choose the B6 freshness comparison. Existing authentication suites own validation correctness. |

### `packages/frontend/src/lib/tenant.ts`

**Responsibility**: Continue to own selected tenant configuration and effective session-policy derivation.

**Actual consumers**:

- Callback Route Handler uses the trusted alias to load the then-current config and calls
  `effectiveSessionPolicy(config)` before establishment.

**Public type export**: export the existing `TenantAlias` schema and its type from
`packages/frontend/src/lib/tenant.ts`. `getAlias` already returns that brand, and `getConfigFromAlias` already requires
it. Service operations, tags, and layers stay unchanged. The export lets authentication and session name the brand
without an unchecked cast or a second alias parser.

**Consumed signatures**:

```ts
export const TenantAlias = /* existing branded schema */
export type TenantAlias = typeof TenantAlias.Type

export class TenantConfigService extends Context.Service<TenantConfigService, {
  readonly effectiveSessionPolicy: (
    config: { readonly idleTimeoutMinutes?: number; readonly warningLeadMinutes?: number }
  ) => { readonly idleTimeoutMinutes: number; readonly warningLeadMinutes: number }
  readonly getConfigFromAlias: (
    alias: TenantAlias
  ) => Effect.Effect<TenantConfig, TenantFailure>
  // Existing getAlias/getConfigFromHost operations remain unchanged.
}>() /* existing tag and layer */
```

**Inputs and validation ownership**: The tenant module continues to decode files, enforce the 5–30 minute timeout and
warning-before-timeout relationship, and supply omitted defaults. Establishment does no fallback.

**Success semantics and invariants**: Policy is derived from the selected authentication tenant at establishment time;
another tenant cannot supply it.

**Expected errors**: Existing tenant 404/500 failure vocabulary remains. The callback maps post-authentication tenant
read failure to the existing safe no-session return rather than guessing policy.

**Defects and interruption**: Unchanged.

**Effect environment requirements**: Unchanged existing filesystem/path/config Layer graph.

**Compatibility and relationships**: Exporting the existing branded alias is the only tenant public-surface change.
`TenantConfigService` operations stay the same. Future renewal (#220) reuses the same derivation at refresh.

### Contract evidence

| Claim                                                           | Meaningful violation                                          | Durable evidence                                                                                                        | Manual/transient evidence            | Limitations and non-duplication                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| Establishment uses the effective policy for the trusted tenant. | Wrong tenant/default or invalid fallback determines deadline. | Callback composition scenario plus existing tenant-policy public tests; session service checks supplied policy mapping. | Manual configured-policy comparison. | Does not re-prove tenant-file parsing or future policy refresh. |

## Cross-module dependency direction

```text
AuthenticationService ---- trusted identity ----\
                                              callback Route Handler ---- cookie response
TenantConfigService ------- effective policy ---/          |
                                                           v
                                                   SessionService
                                                           |
                                              private codec/store children
                                                           |
                                                      Effect Redis
```

- Only `session.ts` imports `session/codec.ts` and `session/store.ts`; tests and siblings use `SessionService`.
- Authentication and tenant modules do not import the session module.
- The callback adapter may import all three public parents because it owns composition.
- Runtime composition supplies one Redis Layer; the backend, domain workspace, and UI components do not import session
  children or Redis.

## Rejected abstractions and alternatives

- Public `SessionStore`/repository interface: no current non-session owner needs raw persistence operations.
- Shared session package: no cross-process consumer exists; it would invite the backend to depend on frontend state.
- General application-value map: explicitly outside issue/spec scope.
- Public callback orchestration service: one Next Route Handler is the only current consumer.
- Session-cookie Effect service: cookie mutation is a Next framework concern and needs no reusable lifecycle.
- Tombstone/cause-retention model: not required for the common no-usable-session contract and owned by later lifecycle
  work if ever needed.
- Dedicated telemetry provider or in-memory tracer: the existing bridge owns export; observability is manual.

## Open decisions

### Blocking contract decisions

- None.

### Implementation choices left to tasks

- The small bounded count for random-reference collision retries (use the existing authentication pattern unless code
  review identifies a reason to differ).
- Exact private schema constructor names and internal helper placement, without changing the public shapes above.
- Whether controlled real-Redis expiry evidence waits for a short TTL or seeds a strict already-expired record through
  a test-only Redis setup step; neither path may expose a private child as a product API.
