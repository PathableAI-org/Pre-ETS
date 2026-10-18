# Data model: tenant authentication initiation

All structures below are proposed. They contain no authenticated user/session identity or domain records.

## Process authentication settings

Decode through Effect Config/Schema at process configuration boundaries in the owning authentication module.
Provide settings through its Layer graph; do not change the existing tenant service's public interface.

| Setting                        | Contract/default                                                                                          | Failure boundary                                                                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OIDC_CALLBACK_ORIGINS_JSON`   | JSON object from tenant alias to exact public origin; omitted means `{}`                                  | Malformed explicit map/origin fails startup. A valid map lacking the selected alias makes that initiation unavailable, without breaking diagnostics.                                         |
| `REDIS_URL`                    | Server-only Redis connection URL, default `redis://127.0.0.1:6379`; credentials, if present, are redacted | Invalid explicit process value fails startup; unavailable server fails initiation only. Never copy the URL to tenant JSON or diagnostics.                                                    |
| `OIDC_TX_KEY_PREFIX`           | Nonempty transaction namespace, default `preets:oidc:tx:`; scenario-owned value in tests                  | Invalid explicit value fails startup; never flush the shared store.                                                                                                                          |
| `OIDC_ALLOW_INSECURE_LOOPBACK` | Boolean, default `false`                                                                                  | Invalid explicit setting fails startup. `true` permits HTTP only for literal loopback IPs, `localhost`, or `.localhost` names at the relevant URL boundaries, never arbitrary external HTTP. |

Origins must have a permitted scheme/authority, no credentials, path other than `/`, query, or fragment. Validate
with Schema at the actual boundary and URL semantics; do not add public-suffix/hostname rules to tenant selection.
The callback is the canonical origin plus `/auth/callback`. The map has no effect on request tenant resolution.
Environment settings are not included in full tenant diagnostic JSON. No tenant schema field is added.

## Resolved initiation context

- `tenantAlias`: validated result from the existing tenant service.
- `oidc`: validated selected issuer/client/auth-mode/reference data. Do not reparse or mutate tenant file content.
- `redirectUri`: exact callback URI selected from process settings for that alias.
- `authorizationEndpoint`: metadata-validated configured provider endpoint, not constructed from a vendor path.

The current consumer needs issuer and client ID, not a resolved client secret. `connection` remains opaque data.

## Authentication transaction record, version 1

| Field                              | Meaning / invariant                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `version`                          | Literal `1`, so #217 can reject incompatible data rather than guess a format                             |
| `tenantAlias`                      | Originating resolved tenant; part of the storage key scope                                               |
| `issuer`, `clientId`, `clientAuth` | Integration snapshot for the initiated attempt; no client secret/reference required in the stored record |
| `redirectUri`                      | Exact URI used in authorization request and later token exchange                                         |
| `state`, `nonce`                   | Independent fresh protocol correlation values                                                            |
| `pkceVerifier`                     | Server-only verifier; authorization request exposes only S256 challenge                                  |
| `initiatedAt`, `expiresAt`         | Unix seconds from the Effect clock; `expiresAt = initiatedAt + 600`                                      |

Generate after discovery succeeds so slow discovery does not spend most of the transaction's lifetime.
Use independent cryptographic random handle/state/nonce/verifier values; deterministic sources are scenario
dependencies only. Do not claim entropy from finite sample uniqueness tests.

Key: `<OIDC_TX_KEY_PREFIX><tenantAlias>:<opaqueHandle>`. Use conditional insert with an expiry no longer than
the remaining 600-second lifetime. Preserve record semantics through encoding; write failure/collision returns
no prepared redirect/cookie. A timeout can leave an unreferenced record if the server applied the write; bounded
TTL handles that ambiguity. Do not retry uncertain writes or claim rollback that did not occur.

## Browser cookie

`preets_oidc_tx` contains only the opaque handle; `HttpOnly`, `SameSite=Lax`, `Path=/auth/callback`, no `Domain`,
and `Secure` except explicit local HTTP operation. Its maximum age is bounded by the record's remaining lifetime.
Use the plan's code/query return flow compatible with Lax; form-post callback support is not introduced here.
No identity, verifier, state, nonce, or transaction JSON is embedded. It is not an application session cookie.

There is one current handle per browser host. Re-initiation replaces that cookie; older records expire and are
not reachable by the replaced browser cookie. Multiple simultaneous login tabs are not a supported completion
claim here. Authentication session-sharing behavior remains #155/#219/#154 work.

## Transitions and #217 handoff

`No attempt → provider prepared → record persisted → cookie + provider redirect returned`.
Tenant/configuration/provider/storage failure stops before successful issuance. No transition grants protected
access. Abandoned records expire. #217 will add cookie/state/nonce/tenant checking, schema decode of untrusted
stored records, atomic consume, callback cleanup, token validation, and freshness comparison after relevant B6
decisions. Do not add unused read/consume/session APIs to implement only the creation side.
