# Data Model: Tenant OIDC Login Initiation

## Tenant configuration (extended)

Frontend-owned, process-environment JSON. Immutable for the process lifetime; restart to reload.

### `TenantRecord`

| Field    | Type           | Rule                                         |
| -------- | -------------- | -------------------------------------------- |
| `slug`   | string         | Existing canonical tenant slug               |
| `config` | `TenantConfig` | Exact supported shape; unknown keys rejected |

### `TenantConfig`

| Field             | Type              | Rule                                                           |
| ----------------- | ----------------- | -------------------------------------------------------------- |
| `displayName`     | string            | Nonempty after trim; existing meaning                          |
| `oidc`            | object            | Required for login-capable configuration                       |
| `oidc.issuer`     | string            | Absolute URL; see transport rules below                        |
| `oidc.clientId`   | string            | Nonempty after trim                                            |
| `oidc.connection` | string \| omitted | Nonempty after trim when present; broker connection / IdP hint |

Transport rules for `issuer` (and derived authorization endpoints):

- Production / non-development: `https:` only
- Development: `http:` allowed only for loopback hosts (`127.0.0.1`, `localhost`) used by local Keycloak
- Non-loopback `http:` is never accepted

Display Name-only records (no valid `oidc`) are rejected by the OIDC-aware parser used for login
initiation and yield HTTP 403 with **extended forbidden copy** (login cannot start + next action +
a11y; no secrets)—distinct from `/login-unavailable`. Shared issuer or Display Name across tenants
does not merge identity; `connection` and `clientId` remain tenant-specific.

### Server-only secrets map

Env `OIDC_CLIENT_SECRETS_JSON`: JSON object `Record<slug, secretString>`. Not part of `TenantConfig`.
Missing slug entry means no confidential credential. Invalid JSON / non-object shapes fail closed at
lazy parse (HTTP 500). Values never appear in logs, HTML, redirects, or committed examples.

## Session context (unchanged ownership)

Owned by `002-setup-session`. Record remains `{ tenantId, expiresAt }` with no authenticated-user
field in this slice. Login entry consumes ready `outcome`: `"reuse"` | `"create"` for lifecycle and
cookie mapping. Neither anonymous outcome grants application landing content or suppresses login
initiation.

**Authenticated short-circuit (E7)**: a later feature may attach an **authenticated user id** to the
session record (per `docs/session-state.md` “Authenticated user”). That field is the **sole**
predicate that short-circuits initiation into SSR landing. Until present, always initiate for ready
unauthenticated outcomes. Creating a session during the request does not mark authentication complete.

## OIDC login transaction

Frontend-owned Redis string JSON. Key: `{OIDC_TX_KEY_PREFIX}{state}` (default prefix
`pre-ets:oidc-tx:`). Tests isolate via prefix or Redis DB; never `FLUSHALL`.

| Field          | Type              | Rule                                                      |
| -------------- | ----------------- | --------------------------------------------------------- |
| `tenantId`     | string            | Canonical slug; must match validated tenant               |
| `issuer`       | string            | Exact configured issuer used for discovery                |
| `clientId`     | string            | Exact configured client id                                |
| `connection`   | string \| omitted | Exact configured connection when present                  |
| `redirectUri`  | string            | Approved `{origin}/auth/callback` for that tenant host    |
| `nonce`        | string            | Fresh unpredictable value for this attempt                |
| `codeVerifier` | string            | PKCE verifier; server-only; never in cookies or redirects |
| `sessionId`    | string            | Anonymous session id created/bound on this request        |
| `expiresAt`    | integer           | Unix seconds; Redis `EXAT`; default TTL 600s              |

`state` is the key suffix: cryptographically random unpadded base64url (same generation quality as
session ids). Atomic create with `NX` + `EXAT`. On collision, one retry with a new state; then fail
closed. No update-in-place of another tenant’s transaction.

## Browser correlation cookie

Cookie name: `pathable-oidc`. Compact signed token (HS256 via `jose`).

| Claim    | Type    | Rule                                 |
| -------- | ------- | ------------------------------------ |
| `state`  | string  | Matches Redis transaction key suffix |
| `tenant` | string  | Canonical slug                       |
| `exp`    | integer | Aligns with transaction expiry       |

Attributes: `Path=/`, `HttpOnly`, `SameSite=Lax`, host-only (no `Domain`), `Secure` outside
development. Short-lived; not an authentication session. Signing secret:
`OIDC_TX_SIGNING_SECRET` if set, otherwise reuse `SESSION_SIGNING_SECRET`.

## Configuration settings

| Setting                                                   | Default / validation                                  |
| --------------------------------------------------------- | ----------------------------------------------------- |
| `TENANT_CONFIG_RECORDS_JSON` / `TENANT_LOCAL_CONFIG_JSON` | Extended record shape with `oidc`; restart to apply   |
| `OIDC_CLIENT_SECRETS_JSON`                                | Optional object map; lazy parse; no committed secrets |
| `OIDC_TX_KEY_PREFIX`                                      | Optional; default `pre-ets:oidc-tx:`                  |
| `OIDC_TX_TTL_SECONDS`                                     | Default `600`; finite positive safe integer           |
| `OIDC_TX_SIGNING_SECRET`                                  | Optional; if unset, use `SESSION_SIGNING_SECRET`      |

Discovery metadata is an in-process cache keyed by issuer URL string—not durable storage. After local
Keycloak reprovision, restart the frontend (or wait for a future cache TTL).

## Lifecycle

```text
document GET `/`
  → setupSession
      → terminal 403/500/503 → stop (no pathable-session from this feature’s initiation path)
      → ready reuse | create without authenticated identity
          → validate tenant oidc config
              → invalid/missing oidc → 403 extended forbidden
                 (login cannot start + next action + a11y; not login-unavailable;
                  no Set-Cookie pathable-session; Redis create orphan may TTL)
              → discover metadata (cached) → fail → login-unavailable
                 (no Set-Cookie pathable-session)
              → persist transaction + correlation cookie → fail → login-unavailable
                 (no Set-Cookie pathable-session)
              → 302 Location=authorization URL
                 + Set-Cookie pathable-session ONLY when outcome was create
                   (setup cookieValue on successful document IdP redirect)
                 + Set-Cookie pathable-oidc
                 (reuse: keep existing session cookie; do not SSR landing)
non-document `/` needing login → 401, no IdP Location, no pathable-session Set-Cookie
`/login-unavailable` → outside (app); no initiation; works without session cookie
`/auth/callback` → pass-through stub (no initiation, no completion)
later: session record with authenticated user id (E7 sole short-circuit) → SSR landing (out of scope)
```

## State transitions (initiation only)

| From                                        | Event                                       | To                                                             |
| ------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| Unauthenticated ready (`reuse` or `create`) | Successful transaction write + document nav | Redirect pending at provider                                   |
| Unauthenticated ready                       | Config refusal                              | 403 extended forbidden; no session cookie issued by initiation |
| Unauthenticated ready                       | Discovery/tx failure                        | login-unavailable; no session cookie issued by initiation      |
| Unauthenticated `create` + success 302      | IdP redirect response                       | Session cookie attached; browser at provider                   |
| Unauthenticated `reuse` + success 302       | IdP redirect response                       | Existing session cookie retained; browser at provider          |
| Session with authenticated user id (later)  | Application navigation                      | Landing SSR (E7 short-circuit; out of scope)                   |
| Transaction record                          | TTL / explicit future callback consume      | Expired / consumed (callback out of scope)                     |

Initiation never transitions the anonymous session into an authenticated-user session. Anonymous
`reuse` / `create` never unlock Display Name landing.
