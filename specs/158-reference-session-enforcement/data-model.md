# Data Model: Reference Session Enforcement

This feature adds no database, Redis record, or migration. It consumes the existing versioned session record through
`SessionService` and adds request-scoped enforcement values plus a short-lived synthetic effect receipt.

## Existing authoritative values

### `TenantAlias`

- Branded, validated tenant slug produced by `TenantConfigService`.
- Selected independently from the request host or configured static tenant.
- Authoritative for the request; a session tenant never replaces it.

### `UsableSession`

| Field                           | Type                 | Rule                                                                                 |
| ------------------------------- | -------------------- | ------------------------------------------------------------------------------------ |
| `_tag`                          | `"UsableSession"`    | Discriminator returned only by the existing session read contract.                   |
| `identity.issuer`               | non-empty string     | Trusted provider issuer stored by session establishment.                             |
| `identity.subject`              | non-empty string     | Trusted provider subject stored by session establishment.                            |
| `tenantAlias`                   | `TenantAlias`        | Authentication tenant; admission requires exact equality with the request tenant.    |
| `idleDeadlineEpochMilliseconds` | positive integer     | Authoritative current session deadline; this feature does not renew or recompute it. |
| `warningLeadMinutes`            | non-negative integer | Effective stored warning policy; this feature does not present warnings.             |

The existing session module owns decoding, expiry classification, and non-disclosure. No consumer receives these fields
from an absent, malformed, missing, expired, invalidated, or unreadable record.

### `NoUsableSession`

- Shape: `{ readonly _tag: "NoUsableSession" }`.
- Represents absent, malformed, missing-record, expired, or invalidated references when a more specific cause is not
  already available.
- Carries no identity, tenant, deadline, policy, or recovery instruction.

## New public contract values

### `ReadSessionForTenantInput`

| Field         | Type              | Validation owner                                                                        |
| ------------- | ----------------- | --------------------------------------------------------------------------------------- |
| `reference`   | optional `string` | `SessionService.read` validates the untrusted opaque cookie value.                      |
| `tenantAlias` | `TenantAlias`     | `TenantConfigService` validates and supplies the independently resolved request tenant. |

The input deliberately contains no host, tenant configuration, cookie object, Next.js request, or provider data.

### `SessionTenantMismatch`

- Fieldless tagged expected error.
- Means a decoded, otherwise usable session belongs to a tenant other than `ReadSessionForTenantInput.tenantAlias`.
- Carries neither tenant value nor identity and maps to forbidden behavior only at the framework edge.

### Tenant-bound read outcome

`SessionService.readForTenant` has four semantic outcomes:

| Outcome                     | Effect channel | Consumer meaning                                                                              |
| --------------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| `UsableSession`             | Success        | Admit only the supplied request tenant and preserve the existing identity/deadline/policy.    |
| `NoUsableSession`           | Success        | No protected identity exists; page and action choose their distinct missing-session mappings. |
| `SessionTenantMismatch`     | Expected error | Deny as forbidden; do not reveal or substitute either tenant.                                 |
| `SessionServiceUnavailable` | Expected error | State could not be determined; fail closed and do not begin replacement login.                |

Defects and interruption remain outside the expected error channel.

## Private request-composition values

### Resolved request context

```ts
interface ResolvedRequestContext {
  readonly config: TenantConfig
  readonly tenantAlias: TenantAlias
}
```

- Constructed by the private `(app)` adapter. The adapter accepts `headers().get("host")` with the same rules as
  authentication's `parseRequestHost`, then calls `TenantConfigService.getAlias` with only the lowercase hostname and
  `getConfigFromAlias` with the resulting alias. `alias.localhost:3000` yields `getAlias("alias.localhost")`.
- An unparseable host does not produce this context. It is the existing tenant 404 and does not call `getAlias`.
- `getAlias`, `getConfigFromHost`, and the diagnostic route keep the raw-host contract described in
  [research.md](research.md) Decision 2.
- Cached only for the current render/request using React request memoization.
- Does not persist, widen, or serialize the tenant alias.

### Reference action state

Defined in `packages/frontend/src/app/(app)/reference-action-state.ts`, a sibling with neither `"use server"` nor
`server-only`:

```ts
export type ReferenceActionState =
  | { readonly _tag: "Ready" }
  | { readonly _tag: "Denied"; readonly message: string }
  | { readonly _tag: "Succeeded"; readonly message: string }

export const initialReferenceActionState: ReferenceActionState = {
  _tag: "Ready"
}
```

`packages/frontend/src/app/(app)/actions.ts` has a file-level `"use server"` directive. Its only runtime export is:

```ts
export async function runReferenceOperation(
  previousState: ReferenceActionState,
  formData: FormData
): Promise<ReferenceActionState>
```

It imports `ReferenceActionState` as a type and does not export the initial state. The client island imports
`ReferenceActionState` and `initialReferenceActionState` from the sibling module and `runReferenceOperation` from the
server module. It receives no tenant config, cookie, session reference, or identity props.

- `Ready` is client initialization only.
- `Denied` is returned only for `NoUsableSession`; it contains no protected result and starts no OIDC flow.
- `Succeeded` is returned only after a matching usable session and the synthetic effect.
- Tenant mismatch and service failure are not converted into action state; they retain forbidden/server-failure
  semantics.

Messages are bounded reference copy, not a durable policy, domain record, or final #154/#157 recovery experience.

### Reference effect receipt

- One short-lived host-only response cookie created after successful re-enforcement of the Server Action.
- Attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`, bounded lifetime, and `Secure` outside explicit
  loopback development.
- Contains no identity, tenant, session reference, provider value, protected result, or business data.
- Its value is not evidence and is never retained. Evidence observes only that one successful invocation emitted one
  receipt and denied invocations emitted none.

This is temporary synthetic UI state, not a session store extension or durable business entity.

## State transitions

```text
incoming page/action request
  -> normalize Host with the parseRequestHost acceptance rules
     -> unparseable: existing tenant 404, stop
     -> lowercase hostname: getAlias, then getConfigFromAlias
        -> tenant failure: existing 404/500, stop
        -> tenant success: read opaque session reference for that tenant
           -> no usable session
              -> page: redirect to same-origin /auth/login
              -> action: return Denied, no effect
           -> tenant mismatch: forbidden 403, no effect
           -> service unavailable: server failure, no effect, no replacement login
           -> usable matching session
              -> page: render protected identity/policy and action control
              -> action: emit one receipt, return Succeeded
```

No transition creates, renews, invalidates, or revives an application session. Session establishment remains owned by
the validated callback; renewal and invalidation remain #220/#221.

## Validation and confidentiality invariants

- The request tenant is resolved before session admission and is never sourced from session state.
- Only the existing session codec decodes the bearer reference and stored record.
- Only a matching `UsableSession` can expose identity, deadline, warning policy, protected content, or protected result.
- Expected errors, page copy, action state, logs, traces, screenshots, and retained evidence contain no cookie values,
  session references, provider tokens, credentials, Redis records, PHI, or identifying partner data.
- Public resources do not invoke the protected consumer and do not become tenant/configuration bypasses.
