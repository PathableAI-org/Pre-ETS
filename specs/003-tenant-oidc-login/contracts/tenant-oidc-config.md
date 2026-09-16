# Contract: Tenant OIDC Configuration

Status: proposed implementation contract. Extends frontend-owned tenant configuration for login
initiation. Does not add a public configuration HTTP API.

**Requirements**: FR-001, FR-002, FR-004, FR-007, FR-009, FR-011, FR-012; SC-002, SC-003.

## Compatibility / Supersedes

**Supersedes** the Display Name-only sufficiency of
`specs/001-tenant-resolution/contracts/tenant-context.md` for **login initiation**: a resolved tenant
must present a valid `oidc` object to start login. Display Name remains required for later
authenticated landing presentation; it does **not** authorize unauthenticated application content.

Unauthenticated Proxy-matched document navigations to `/` (both `reuse` and `create`) must initiate
OIDC or fail—see [oidc-login-initiation.md](./oidc-login-initiation.md) Supersedes for
`landing-page.md`. Implementation MUST update the 001 tenant-context and landing-page contracts in
the delivery slice that lands the parser change and Proxy initiation. Optional later dual-layer
regression once authenticated SSR exists: unauthenticated `/` initiates; authenticated `/` may show
Display Name.

## Record shape

```json
{
  "slug": "springfield",
  "config": {
    "displayName": "Springfield",
    "oidc": {
      "issuer": "https://identity.example/realms/pre-ets",
      "clientId": "springfield-web",
      "connection": "springfield-idp"
    }
  }
}
```

`connection` may be omitted only when issuer + clientId alone select the tenant login experience.
Unknown keys at record, `config`, or `oidc` levels are rejected. Local Keycloak maps `connection` to
`kc_idp_hint`; other brokers are a follow-up mapping.

## Operations

| Operation                      | Input               | Output / failure                             | Owner                     |
| ------------------------------ | ------------------- | -------------------------------------------- | ------------------------- |
| `parseTenantConfig` (extended) | unknown JSON config | `TenantConfig` or unusable                   | `src/lib/tenant/types.ts` |
| `readTenantRecord`             | canonical slug      | record including `oidc`, or unknown/unusable | existing tenant source    |
| `resolveOidcClientSecret`      | canonical slug      | secret string or absent                      | `src/lib/oidc/secrets.ts` |

Mode selection, host binding, and static localhost rules remain owned by the tenant module.
Production never reads development static env vars.

## Server settings

| Variable                     | Format                     | Effect                                     |
| ---------------------------- | -------------------------- | ------------------------------------------ |
| `TENANT_CONFIG_RECORDS_JSON` | Array of extended records  | Host-mode known tenants                    |
| `TENANT_LOCAL_CONFIG_JSON`   | Single extended record     | Development static mode                    |
| `OIDC_CLIENT_SECRETS_JSON`   | `{ "<slug>": "<secret>" }` | Server-only credentials; optional per slug |

Restart the frontend process after changing tenant JSON or secrets. Do not use `NEXT_PUBLIC_` for any
OIDC setting. `.env.example` shows synthetic issuer/client/connection only; secret example values stay
empty.

## Validation outcomes for login entry

| Condition                                                 | Outcome                                                                                                                                                     |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valid `oidc` for resolved tenant                          | Eligible for initiation on unauthenticated document nav (`reuse` or `create`, subject to discovery/tx)                                                      |
| Missing `oidc`, blank fields, bad issuer URL/scheme       | HTTP 403 **extended forbidden** (“login cannot start” + next action + a11y; no secrets)—**not** `login-unavailable`; no session cookie on that failure path |
| Unreadable tenant source / invalid selected static config | Existing tenant 403/500 guidance behavior                                                                                                                   |
| Secrets map malformed                                     | HTTP 500 at lazy parse; no initiation                                                                                                                       |
| One tenant’s settings change after restart                | Only that tenant’s next unauthenticated visit changes destination                                                                                           |

**P4**: Config refusal stays on the existing HTTP 403 forbidden surface with extended copy for
login-config defects. Provider discovery / transaction failures use `/login-unavailable` (see
[oidc-login-initiation.md](./oidc-login-initiation.md)). Do not require login-unavailable PathAble
composition for config 403.

## Isolation rules

- Concurrent requests must load configuration by validated slug only.
- Caller query/header values naming issuer, client, connection, or tenant must be ignored for
  selection.
- Credentials must not appear in browser content, redirect URLs, structured diagnostics, or fixtures.
- Two tenants may share `issuer` or `displayName` while differing in `clientId` / `connection`.
