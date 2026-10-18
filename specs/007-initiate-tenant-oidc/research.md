# Research: tenant OIDC initiation

**Date**: 2026-10-18. **Scope**: request initiation and transaction creation only. Decisions below are proposed
engineering choices for #216, not implemented behavior or new durable requirements. Read-only parallel research
covered protocol/dependency choices and testing/telemetry; the final design consolidates those findings.

## 1. Protocol client and supported runtime

**Decision**: Plan frontend dependencies `openid-client@6.8.8` and `redis@6.2.1`, subject to installed-declaration
and repository supply-chain checks during implementation. Keep current Effect/Next pins. No dependency is added now.

**Rationale**: Current source has no OIDC discovery or Redis client. A dedicated OIDC library handles discovery
and PKCE/request construction without implementing protocol primitives or adding an authentication framework.
The official Node Redis client supplies conditional writes, expiration, bounded failure options, and resource
cleanup. The dependencies have direct consumers in this increment.

**Alternatives considered**: Custom discovery/cryptography would increase owned protocol risk. An authentication
framework introduces session/callback policy beyond this slice. A raw Redis wire implementation is unnecessary.

Sources: [OIDC client release](https://github.com/panva/openid-client/releases/tag/v6.8.8),
[OIDC client usage](https://github.com/panva/openid-client),
[Node Redis release](https://github.com/redis/node-redis/releases/tag/redis%406.2.1),
[Redis client configuration](https://github.com/redis/node-redis/blob/redis%406.2.1/docs/client-configuration.md).
Read the exact installed package declarations before coding; these researched packages are not installed here.

## 2. Authorization request and unfinished freshness

**Decision**: Discover from the configured issuer URL; request code flow, `scope=openid`, fresh PKCE S256,
state and nonce, exact callback URI, and `max_age=0`. Use a distinct opaque browser handle. Do not request
unneeded profile/email claims, resolve client credentials, or interpret `connection` as a vendor hint.

**Rationale**: Initiation needs correlation and tenant binding for #217; it does not yet need token exchange or
secrets. The selected freshness baseline applies even to a first application visit with existing provider SSO.
Starting from an issuer rather than a discovery-document URL retains library issuer validation.

**Alternatives considered**: `prompt=login` alone does not satisfy the selected evidence baseline. Missing
state/nonce or reusing state as the browser lookup handle weakens independent correlation. A vendor-specific
broker parameter would invent interpretation for the existing opaque configuration field.

Sources: [OIDC Core authorization request](https://openid.net/specs/openid-connect-core-1_0.html#AuthRequest),
[OAuth security BCP](https://www.rfc-editor.org/rfc/rfc9700.html#section-2.1.1),
[client discovery](https://github.com/panva/openid-client/blob/v6.8.8/docs/functions/discovery.md),
[upstream code-flow example](https://github.com/panva/openid-client/blob/v6.8.8/examples/oidc.ts).
B6 authentication-time comparison/tolerance and provider acceptance remain downstream gates, not research
unknowns required to prepare this request.

## 3. Transaction storage and lifetime

**Decision**: Persist a versioned tenant-bound record under a transaction-only Redis namespace and an independent
opaque handle. Use conditional insert and 600-second expiry; only then return cookie/redirect instructions.
Create/connect/finalize a client within each issuance operation's scope, with five-second network bounds,
offline queue disabled, no reconnect retry, and a sanitized error listener. No process cache or pool is added.

**Rationale**: Shared storage can support a later callback on another instance without a new encryption secret.
The short TTL bounds abandoned attempts; it is unrelated to application-session lifetime or freshness tolerance.
Request-scoped ownership keeps failure cleanup explicit and public diagnostics independent of Redis connectivity.
Use current preferred Redis `SET` condition/expiration options, verified against installed declarations.

**Alternatives considered**: Process memory loses attempts across restarts/instances. An encrypted cookie needs
an additional shared encryption secret and handling of server-only verifier data. A generic session store would
prematurely implement #218. A long-lived client/pool can be introduced later only for an observed need.

Source: [conditional Redis SET options](https://github.com/redis/node-redis/blob/redis%406.2.1/packages/client/lib/commands/SET.ts).
The public creation contract and exact schema are in [data-model.md](data-model.md). #217 will add atomic consume
and callback validation; no read/consume API is implemented solely for future use.

## 4. Browser return authority and local HTTP

**Decision**: Add a non-secret process callback-origin map keyed by resolved tenant alias, append the fixed
`/auth/callback` path, and store the exact URI. Never derive authority from forwarded headers, query input, or
`request.nextUrl`. Missing alias configuration makes initiation unavailable without selecting another tenant.
Default to HTTPS; permit HTTP only for explicit loopback testing, checking both issuer/discovered authorization
endpoint and callback origin. Keep tenant file schema unchanged.

**Rationale**: Static mode intentionally ignores arbitrary incoming hosts; callback authority must not be
controlled by those hosts. A small explicit map works for multiple host-mode tenants and static mode without
introducing a second tenant-selection registry or hostname normalization policy.

**Alternatives considered**: Request-derived origins trust unapproved metadata. One fixed callback origin cannot
preserve host-only correlation for multiple tenant hosts. Hostname templates/scheme/port composition add parsing
rules when explicit origins suffice. Required new tenant fields would expand #215's file contract unnecessarily.

Source: [OIDC client's local HTTP escape](https://github.com/panva/openid-client/blob/v6.8.8/docs/functions/allowInsecureRequests.md).
Local host-mode validation uses the already accepted literal `BASE_HOSTNAME=localhost:3000` pattern and registered
callbacks. It strips no port and changes no tenant rule; normal `BASE_HOSTNAME=localhost` does not match a Host
containing `:3000`. No proxy/ingress product or machine-local host configuration is added.

## 5. Next.js integration and module ownership

**Decision**: Use an SSR root redirect after tenant validation, then a cookie-writing Route Handler. Keep Proxy
pass-through and provider I/O out of rendering/Proxy. Add one owning `lib/authentication.ts` with private adapters;
execute its Effect through existing `Runtime`. Preserve tenant errors and use the public sign-in error route
for initiation-specific unavailability.

**Rationale**: Installed Next docs say Server Components cannot write cookies, and Proxy must not rely on state
shared with render code. The two automatic hops preserve ordinary root tenant failure presentation and give
HTTP headers a clear owner. Each request resolves its own tenant; no untrusted header carries an asserted identity.

**Alternatives considered**: Setting cookies during page render is unsupported. A broad Proxy auth rewrite would
overclaim default enforcement and duplicate shared runtime/resource concerns. Replacing the root with a Route
Handler would discard the existing page-boundary tenant failure experience and later session-aware page seam.

Local sources: installed `next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`,
`03-file-conventions/proxy.md`, `04-functions/redirect.md`; current `tenant-context.ts`, `proxy.ts`, and `runtime.ts`.
Effect checkout `41cf29b5d85af7fc25bcc7713f2e05142edaa66a`: `LLMS.md`, managed-runtime/resource/testing examples.
Installed Effect 4.0.5 declarations confirm `Context.Service`, `Layer.effect`, `Effect.tryPromise` with interruption
signal, `Effect.acquireRelease`, and `Effect.fn`; installed `@effect/vitest` supports `it.effect.prop`.

## 6. Evidence selection and remaining limitations

**Decision**: Default durable tests to public-service properties, retain named examples for discrete boundaries,
and use real HTTP/provider/browser/manual Redis evidence for composition. Inspect real logs/exported OTel data
manually; retain no telemetry assertions. Use existing test tooling and no conditional integration suite.

**Rationale**: A model store cannot establish Redis semantics; a redirect parser cannot establish provider
acceptance; a trace is not authentication evidence. Existing BDD steps must not connect to stores/mock providers.
Current E2E directory contains no active journeys, and stale Compose docs describe removed behavior.

**Alternatives considered**: Repeating every property at HTTP adds little evidence. Snapshotting current markup,
logging, spans, or exact helper calls protects implementation details. Requiring callback/session success here
depends on later issues and would misstate this feature's completion boundary.

No unresolved design clarification blocks initiation planning. Provider compatibility, signed-token validation,
old-session denial, full application enforcement, and production ingress remain explicitly unproven downstream.
