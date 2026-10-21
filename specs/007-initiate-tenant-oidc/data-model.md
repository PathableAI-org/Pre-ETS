# Data model: session presence and authorization preparation

These are proposed implementation contracts. This feature adds no stored records, session cookie, Redis key,
transaction TTL, or serialized session identity.

## Session presence

The current consumer needs only a predicate. Proposed public capability:
`SessionService.hasSession(): Effect<boolean>`; the production Layer always reports false for this increment.
It does not inspect cookies, access a store, resolve the request tenant, or produce an authenticated identity.
The root consumer uses absence to choose the login route before tenant lookup.

No Option payload or Session fields are invented now. If later consumers need usable identity, deadline or typed
lookup failure, refine the public contract with those actual consumers. A future true result is not authority to
skip independent request-tenant resolution and session/tenant comparison before protected access.

## Process authentication settings

| Setting                        | Contract/default                                                                       | Failure boundary                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OIDC_CALLBACK_ORIGINS_JSON`   | Non-secret JSON object from resolved tenant alias to exact public origin; default `{}` | Malformed explicit map/origin fails startup. A missing selected alias makes login preparation unavailable; diagnostics remain usable.                |
| `OIDC_ALLOW_INSECURE_LOOPBACK` | Boolean, default false                                                                 | Invalid explicit value fails startup. True allows HTTP only at loopback issuer/discovery/authorization/callback URL boundaries, never external HTTP. |

Origins have no credentials, non-root path, query or fragment. Append fixed `/auth/callback`. The map selects
callback transport, not tenant identity, and is never returned as tenant diagnostic configuration. No tenant
file field, Redis URL/prefix, signing secret or TTL setting is introduced by this feature.
The HTTP switch uses the exact parsed-host policy in [the initiation contract](contracts/initiation.md), not a
general disable-TLS flag. No extra configuration knob or per-request timeout setting is introduced.

## Resolved login context

- `tenantAlias`: current request's independently selected alias.
- `oidc`: selected validated issuer/client/auth-mode/reference configuration; no resolved secret.
- `redirectUri`: canonical configured callback for the alias, independent of Host/forwarded/query authority.
- `authorizationEndpoint`: discovered metadata endpoint validated for issuer and transport constraints.

The login page obtains this context before provider-specific behavior. Root/layout do not obtain it on the
session-missing path. The existing public diagnostic/preview consumers retain their own tenant resolution.

## Prepared authorization attempt

Transient preparation context contains the selected tenant/integration, exact callback URI, state, nonce and PKCE
verifier/challenge relationship needed to construct the request. The provider redirect contains only public
protocol fields: client, callback, code response, openid scope, S256 challenge, state/nonce and `max_age=0`.
The verifier remains server-only and is discarded after this request. No context is embedded in a cookie, token,
HTML debug payload, telemetry record, process Map or other recoverable store.

Only the authorization destination is returned to the current login consumer. Do not export verifier/context
payloads solely for future callback consumption or synthetic tests. No persistence-provider API is added. This is not a complete
recoverable authentication transaction, even if the provider later returns a code.

## State transitions and handoff

`Root session miss → same-origin login redirect → request tenant selected → provider request prepared → provider redirect`.
Tenant failure ends at actual login 404/500; provider preparation failure ends at public sign-in failure. No step
produces usable authentication, and callback fallback cannot create it.

#217 adds a separately reviewed wire/storage/cookie contract: save correlation and verifier data before redirect,
then recover and atomically consume it on callback before accepting provider evidence. TTL, key namespace, cookie
flags, replay behavior and storage outage tests belong with that real consumer. #218 adds authenticated sessions.
