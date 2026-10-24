# Authentication strategy

The root uses `SessionService.hasSession()` before request-tenant lookup. The
current production capability always reports absence and redirects to `/auth/login`;
it does not read cookies, Redis or tenant files. The enclosing layout performs no
eager tenant read and this feature has no positive-session rendering path.

The public login Route Handler resolves the request tenant through `TenantConfigService`
and prepares the configured provider's authorization request using `openid-client`.
It requests code/openid, PKCE S256, fresh state/nonce and `max_age=0`, then returns a
dynamic HTTP 307. Provider preparation has one five-second cancellable deadline.
Tenant errors retain actual login 404/500 outcomes; expected provider, credential, or
transaction failure redirects to `/login-unavailable`. Root's separate first hop remains
307 even when tenant lookup will fail.

Before redirecting, login stores a versioned recoverable attempt in Redis with atomic
`SET ... NX PX` and gives the browser only a 32-byte opaque, unpadded base64url
`oidc-correlation` cookie. The host-only cookie is `HttpOnly`, `SameSite=Lax`, scoped to
`/auth/callback`, and aligned to the attempt lifetime. State, nonce, the PKCE verifier,
credentials, tokens, and identity claims never enter that cookie.

The callback independently resolves the tenant and exact registered authority, qualifies
the correlation/state tuple, and consumes it once with Redis `GETDEL`. `openid-client`
then performs code exchange and issuer, audience, signature, state, nonce, and ID-token
validation with non-repudiation checks enabled. A successful callback requires nonempty
`sub` and integer `auth_time`.

A trusted identity is not itself authority to establish a session: the callback must also
confirm that the authentication event is fresh. That freshness comparison and clock
tolerance are unresolved ([#158](https://github.com/PathableAI-org/Pre-ETS/issues/158)), so
the callback currently treats every trusted result as unconfirmed. It returns the safe
"No authentication could be established" page with a cleared correlation cookie and issues
no `pathable-session`. Once freshness is confirmed, the callback derives the tenant's
effective session policy, establishes a Redis-backed session through `SessionService`, and
only then writes the host-only `pathable-session` cookie alongside the cleared correlation
cookie; establishment or tenant failure fails closed to the same safe page with no session
cookie. See [session-state.md](./session-state.md) for the session contract.

Unqualified input and qualified lookup misses preserve correlation so the original valid
return can still complete. Actual consumption and ambiguous in-flight consumption clear
it. Denial uses the existing safe "Authentication return" presentation and never re-emits
callback parameters or provider/storage details. Public diagnostics remain independent of
provider availability. The proxy remains pass-through.

## Callback and local-provider settings

`OIDC_CALLBACK_ORIGINS_JSON` is a non-secret JSON map from resolved tenant alias to
exact public origin, default `{}`. Origins forbid credentials, non-root paths, query
and fragment. Login appends `/auth/callback`; incoming Host, forwarded headers and
query data cannot supply the callback authority. A malformed explicit map fails
runtime startup; an absent selected alias makes preparation unavailable while
diagnostics remain usable.

`OIDC_ALLOW_INSECURE_LOOPBACK` defaults to false. Explicit true permits HTTP only for
`localhost`, `.localhost` names, `127.0.0.0/8` and `::1`, checked separately at issuer,
actual discovery, authorization and callback boundaries. External HTTP, lookalikes,
wildcard addresses, direct metadata-document issuer shortcuts and discovery redirects
are rejected. Invalid explicit boolean configuration fails startup. HTTPS is the default.

Redis is a process-readiness dependency. `REDIS_URL` defaults to
`redis://127.0.0.1:6379`; the production client disables the offline queue, sends a
response-aware PING every second, and applies a 5-second socket inactivity timeout. The
runtime awaits Redis acquisition before instrumentation declares the process ready. A
failed initial connection requires a corrected dependency and a fresh process.

`OIDC_TX_TTL_SECONDS` defaults to 600 and accepts only base-10 integers from 1 through
600. `OIDC_TX_KEY_PREFIX` defaults to `preets:oidc-tx:v1`; deployments and concurrent test
runs should set an owned prefix. Keys and values are versioned, bounded recovery artifacts,
not sessions. Do not flush shared Redis to operate or test this flow.

For the tracked Keycloak realm, start Redis and Keycloak and verify realm discovery before
opening the app or running callback BDD. Example frontend settings (other required tenant
settings remain in `.env.example`):

```dotenv
OIDC_CALLBACK_ORIGINS_JSON={"springfield":"http://localhost:3000","shelbyville":"http://shelbyville.localhost:3000"}
OIDC_ALLOW_INSECURE_LOOPBACK=true
OIDC_TX_KEY_PREFIX=local:oidc-tx:v1
OIDC_TX_TTL_SECONDS=600
REDIS_URL=redis://127.0.0.1:6379
```

Host-mode browser checks use the registered `springfield.localhost:3000` and
`shelbyville.localhost:3000` origins. BDD supplies those explicit callback origins
independently of its logical request Hosts and random application ports. Nightly/manual
BDD remains main-only and provisions pinned Redis and Keycloak dependencies with bounded
readiness, scenario-owned transaction prefixes, diagnostics and unconditional owned
provider cleanup. Callback scenarios compose two independent Next processes on the same
registered authority to prove cross-instance recovery.
See the [verification guide](../specs/007-initiate-tenant-oidc/quickstart.md).

Only the tracked Keycloak provider is executed by repository BDD. Microsoft, broker
chains, a real confidential-provider round trip, and `auth_time` age/tolerance policy are
not established here. #218 implements the session handoff behind the unresolved freshness
confirmation; #219/#154 retain later enforcement/application integration; #158 owns the
freshness comparison and tolerance that gate live establishment.

## Configuration for OIDC consumers

Every tenant file requires `oidc.issuer`, `oidc.clientId`, and `oidc.clientAuth`.
Issuer and client ID must be nonempty strings containing a non-whitespace character.
`clientAuth` is `public` or `confidential`; the optional `connection` string preserves
provider integration data without introducing provider-specific application logic.

A public client has no credential reference. A confidential client must supply a
nonempty, non-secret `oidc.clientSecretRef` lookup key. Credentials, tokens, private
keys, and provider credentials do not belong in tenant files. Unknown fields,
including embedded credential fields, are rejected at root and nested boundaries.
This validation cannot detect a secret pasted into an otherwise permitted text field;
configuration producers remain responsible for those values.

The non-secret reference remains configuration data. The server-only
`OIDC_CLIENT_SECRETS_JSON` map resolves it only when authentication needs the selected
confidential client. An absent map is valid and empty. Malformed explicit JSON prevents
process readiness without echoing its value; an absent selected reference fails only that
request. Tenant loading and diagnostics never resolve or disclose the secret.

## Rollout and rollback

Deploy initiation and callback handling together. An attempt begun on an old instance
cannot complete on a new callback, and a new recoverable attempt cannot complete through
an old callback. During a mixed-version rollout, an in-flight login may be denied but must
never be accepted with guessed or partial state. Rollback needs no migration: bounded,
versioned Redis keys, host-only callback-path correlation cookies, and TTL-bounded
session records all expire naturally. A remaining `pathable-session` cookie grants no
protected access and must not be treated as authenticated state by a prior revision.

## Session policy handoff

[TenantConfigService](../packages/frontend/src/lib/tenant.ts) provides validated
integration data and shared effective timeout/warning values through
`service.effectiveSessionPolicy(config)`. The Config recipe and policy implementation
are private children of the tenant module. File parsing preserves omitted fields;
the policy derivation supplies omitted defaults
without changing the diagnostic document. See the
[policy contract](./multi-tenancy.md#idle-timeout-and-warning-policy) for the accepted
values and examples.

Session establishment ([#218](https://github.com/PathableAI-org/Pre-ETS/issues/218)) and
policy refresh ([#220](https://github.com/PathableAI-org/Pre-ETS/issues/220)) use this
derivation with the then-current validated tenant configuration. Credential
resolution and callback exchange belong to
[#217](https://github.com/PathableAI-org/Pre-ETS/issues/217). This configuration work
does not implement expiration enforcement, warning UI, or session policy adoption.
See [session-state.md](./session-state.md) for the current session boundary.
