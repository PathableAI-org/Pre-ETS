# Research and revised decisions: initiation with an empty session boundary

**Date**: 2026-10-18. Proposed #216 design only; no implementation/provider execution is claimed.
The maintainer's session-first refinement supersedes the earlier Redis/cookie and tenant-first root design.

## 1. Session presence is a current consumer boundary

**Decision**: Introduce a minimal session-presence capability consumed by root; its real implementation always
reports false for this feature. A boolean Effect is sufficient; do not invent an Option payload/session fields or
read a store/cookie before a real lookup consumer exists. Remove root and enclosing-layout eager tenant reads.

**Rationale**: The root needs to choose anonymous login before tenant-dependent work. This makes the incomplete
state explicit and creates no fake usable session. Login still resolves its tenant before consuming configuration.
Future positive access must independently resolve/compare request and session tenants under SESSION-005.

**Alternatives considered**: Root tenant lookup duplicates responsibility before the selected login route runs.
Leaving the enclosing layout read would defeat the selected ordering. Inferring a session from any supplied cookie
would grant unsupported meaning. A fabricated Session record/Option shape would design later consumers prematurely.

Sources: maintainer direction in this task; main TENANT-003/004/005 and SESSION-001/004/005; installed Next
`docs/01-app/02-guides/authentication.md`, which explains why a layout alone does not stop child route execution.

## 2. Keep only the actual protocol dependency

**Decision**: Plan frontend `openid-client@6.8.8` for issuer discovery and authorization-request preparation.
Add no Redis client or authentication framework. Inspect installed declarations and supply-chain checks during
implementation; no package is installed in this design change.

**Rationale**: The library owns protocol primitives; current consumers need discovery, PKCE S256 and URL building.
Code/openid, fresh state/nonce, exact configured callback and `max_age=0` support the selected request baseline.
No confidential-client secret or vendor interpretation of the opaque `connection` field is needed for preparation.

**Alternatives considered**: Custom OIDC primitives increase owned protocol risk. A broad auth framework would
bring callback/session policy outside the increment. A storage client has no current consumer after narrowing scope.

Sources: [release](https://github.com/panva/openid-client/releases/tag/v6.8.8),
[issuer discovery](https://github.com/panva/openid-client/blob/v6.8.8/docs/functions/discovery.md),
[code-flow example](https://github.com/panva/openid-client/blob/v6.8.8/examples/oidc.ts),
[OIDC request contract](https://openid.net/specs/openid-connect-core-1_0.html#AuthRequest),
[PKCE security guidance](https://www.rfc-editor.org/rfc/rfc9700.html#section-2.1.1).

## 3. Move recoverable transaction persistence together with callback consumption

**Decision**: #216 prepares and discards server-local attempt context after issuing the provider redirect.
#217 connects persistence before redirect with correlation/recovery/atomic consumption on return. No temporary
in-memory store, persistence-provider interface, cookie/TTL contract, or complete transaction claim in #216.

**Rationale**: Callback processing needs saved verifier/correlation data, but that consumer does not exist here.
Deferring both halves avoids unused infrastructure while preserving an honest initiation-only boundary. Saving
only after the callback would be too late; the write must be wired into initiation when #217 enables consumption.

**Alternatives considered**: Earlier design added Redis, cookies, namespaces, timeouts and persistence tests before
any callback could use them. An in-memory or encrypted-cookie substitute would introduce another temporary design.
Application-session storage is separately #218 and should not be pulled forward to make this step look complete.

Source: [upstream example's recoverable verifier/correlation requirement](https://github.com/panva/openid-client/blob/v6.8.8/examples/oidc.ts).
The callback remains a denying fallback, including after actual provider sign-in. No authentication can succeed yet.

## 4. Callback authority and local provider transport

**Decision**: Keep a process-owned alias-to-canonical-origin map and fixed `/auth/callback`. Never use forwarded
headers/query/Host as callback authority. HTTPS is default; explicitly allow HTTP only at loopback testing URLs.
No tenant file schema change or separate tenant-selection registry is introduced.

**Rationale**: Static tenant selection intentionally ignores arbitrary Host. Canonical return authority must stay
operator-controlled. Two host-mode integrations can have separate explicit origins without new hostname rules.

**Alternatives considered**: Host-derived URLs trust unapproved input; a single shared callback host cannot later
carry host-only tenant correlation for multiple origins. Scheme/port templates add unnecessary parsing policy.

Source: [library local-HTTP escape](https://github.com/panva/openid-client/blob/v6.8.8/docs/functions/allowInsecureRequests.md).
The tracked local realm supports `localhost:3000` for Springfield and tenant-specific `.localhost:3000` callbacks.
Host-mode local validation can configure the already accepted literal `BASE_HOSTNAME=localhost:3000`; no port
stripping or tenant contract change is needed. Normal base `localhost` still rejects a retained-port Host.

## 5. Use server pages until cookies are real behavior

**Decision**: Root performs the session check and redirects; public `/auth/login/page.tsx` performs tenant/provider
preparation. No Route Handler is needed now because no response cookie is written. Preserve page-boundary ordinary
404/500 at login and keep Proxy pass-through. #217 selects a cookie-writing adapter when persistence is connected.

**Rationale**: Server pages support async preparation/redirects and the existing ordinary missing-page boundary.
The previous Route Handler existed to write a cookie now removed from scope. Inspect actual HTTP before streaming;
a mock redirect result does not establish 307 or the final browser missing page.

**Alternatives considered**: Keeping the unused cookie transport adds machinery and complicates page-error rendering.
Putting provider I/O in Proxy introduces unnecessary host/runtime concerns. Root/layout tenant prechecks defeat the
maintainer's ordering, and layout-only auth checks are insufficient to guard child consumers.

Local sources: installed Next `04-functions/{redirect,not-found,cookies}.md` and authentication guide; current root,
layout, Runtime and tenant modules. Effect checkout `41cf29b5d85af7fc25bcc7713f2e05142edaa66a` was inspected with
`LLMS.md` and managed-runtime/testing examples; installed Effect 4.0.5 and `@effect/vitest` declarations govern APIs.

## 6. Evidence follows the narrower responsible boundary

**Decision**: Consumer properties establish session-missing delegation independently of tenant availability.
Preparation properties establish selected integration/protocol fields; examples cover discrete failures and host
mapping. Real HTTP/browser evidence observes root 307 separately from login actual 404/500/provider redirect.
Telemetry inspection is manual and expects no root tenant-read operation or Redis/cookie/session-created signal.

**Rationale**: A separate test of the literal false constant would mirror implementation. The meaningful claim is
that the consumer denies/delegates correctly without prematurely consuming tenant configuration. Moving tenant
assertions to login preserves requirements evidence rather than relaxing actual failure checks.

**Alternatives considered**: Pretending raw root 307 satisfies tenant 404/500, silently following arbitrary redirects,
weakening generic status steps, or claiming a passing initiation slice verifies callback/session behavior.

No new unresolved design question blocks initiation. B6 comparison/tolerance, recoverable attempts, callback
acceptance, actual session lookup/storage, positive-session tenant binding and provider compatibility remain later.

## 7. Make real-provider BDD prerequisites explicit

**Decision**: The implementation must supply scenario-owned callback origins and the named loopback switch to
the owned Next process. Use the realm's existing fixed tenant `.localhost:3000` callback origins, retaining random
Next transport ports and logical `example.test` Hosts. Provision the pinned real Keycloak image and wait for realm
discovery outside product steps, both locally and in nightly CI. Stop initiation evidence before callback.

**Rationale**: Current `tests/bdd/support/server.ts` sets neither proposed OIDC setting. Its historical
`BDD_ALLOW_LOOPBACK_HTTP` is not the new setting. `.github/workflows/ci-bdd.yml` currently starts only Redis, while
successful login preparation now needs discovery. Realm registrations already cover both fixed callbacks;
there is no need to change them to match scenario transport ports. Root/tenant-failure/diagnostic evidence does
not itself require a reachable provider.

**Alternatives considered**: Inheriting a machine callback map makes evidence environment-dependent. Mock providers,
wildcard callback registration and skipping active scenarios would weaken the intended boundary. A new PR BDD job
or changed schedule is unrelated. Keep existing Redis service setup, independently owned smoke and report handling.

Local sources: `tests/bdd/{support/server.ts,support/world.ts,steps/presentation.ts}`, `fixtures/tenant-config/`,
`docker/keycloak/pre-ets-realm.json`, `compose.yaml`, `features/README.md`, `.github/workflows/ci-bdd.yml`.

## 8. Own the narrow transport and cancellation boundary

**Decision**: Keep a private per-preparation `customFetch` adapter. Validate the actual outbound discovery target,
retain manual redirect handling and reject redirects. Apply the documented parsed-host HTTP policy independently
of the client's broad insecure-HTTP escape. Pass the configured issuer to discovery, not a direct metadata URL.
Use one five-second Effect deadline after tenant resolution; propagate its interruption signal through the private
transport, combined with the library signal. Timeout becomes safe unavailability, while caller interruption and
defects retain their separate meanings.

**Rationale**: The pinned client supports custom fetch and a library timeout, but neither establishes the
application's narrower HTTP policy or propagates an enclosing Effect interruption automatically. Its direct
`.well-known` URL shortcut skips issuer comparison. Keeping the transport private avoids a speculative general
HTTP service and needs no persistence interface or cache.

**Alternatives considered**: Checking only the configured issuer leaves discovered destinations unchecked.
Following redirects adds another validation surface. Racing a Promise without aborting underlying fetch leaves
work alive. Per-fetch application timers can reset a whole-operation budget. Retain the client's safety timeout
without allowing it to extend the enclosing deadline; use installed `Effect.timeoutOrElse` and `tryPromise` semantics.

Sources: pinned [custom-fetch contract](https://github.com/panva/openid-client/blob/v6.8.8/docs/variables/customFetch.md),
[discovery options](https://github.com/panva/openid-client/blob/v6.8.8/docs/interfaces/DiscoveryRequestOptions.md),
[issuer comparison implementation](https://github.com/panva/openid-client/blob/v6.8.8/src/index.ts),
and installed frontend `effect/dist/Effect.d.ts` (`tryPromise`, `timeoutOrElse`). These are design/API checks,
not executed cancellation or provider evidence. Named failure examples and URL-domain properties are in the plan.
