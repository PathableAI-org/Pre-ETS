# Implementation Plan: Initiate tenant OIDC authentication

**Branch**: `154-initiate-tenant-oidc` | **Date**: 2026-10-18 | **Spec**: [spec.md](spec.md)

**Input**: #216 / S2-B. Maintainer refinement: introduce a session-presence boundary that always reports absence;
check it before tenant lookup, and resolve the tenant in the login route. Persist recoverable attempts with #217.

**Baseline**: Main `9f83d3bcf623f4fa4d8aa6ee7918033c259387be`; previous design commit `713e20b` is superseded
where it put Redis, transaction cookies, and root-first tenant validation in #216. This revision is design only.

## Summary

The root page first asks the session capability whether a usable session exists. Its real implementation always
returns false for this feature, so `/` automatically redirects to `/auth/login` without looking up the request
tenant. The login server page resolves the tenant, prepares a standards-based provider request, and redirects to
that provider. There is no local credential form, authenticated identity, usable session, cookie, or stored attempt.

Remove eager tenant reads from both the root and `(app)/layout.tsx`; otherwise the layout could perform the lookup
before the session gate. The login page preserves ordinary tenant 404/500 outcomes at its own request boundary.
Public diagnostics/previews retain their explicit tenant checks. Do not rely on layout gating to prevent child
rendering: the root consumer makes its own decision before returning content.

#217 owns recoverable transaction persistence and the correlation cookie, including the initiation-side write
before redirect and callback-side recovery/consumption. #218 owns application-session establishment. Before any
future positive session can grant protected access, independently resolve and compare the request tenant under
SESSION-005. The current predicate alone grants no access and does not establish that future positive path.

See [research.md](research.md), [data-model.md](data-model.md), [module contracts](contracts/modules.md),
[HTTP contracts](contracts/initiation.md), and [manual validation](quickstart.md).

## Technical Context

**Language/Version**: Strict TypeScript 6.0.3; private ESM frontend; Node 26-compatible runtime.

**Primary Dependencies**: Existing Next.js 16.4.2, React 19.3.1, Effect/@effect/platform-node 4.0.5,
`@effect/vitest` and PathAble React. Plan only `openid-client@6.8.8` as a new frontend dependency in the
implementation PR. No Redis client, encryption/session secret, or signing package is needed here. Check installed
OIDC declarations and supply-chain policy before coding; no dependency is installed by this planning change.

**Storage**: No new storage. Existing filesystem tenant configuration remains authoritative. Prepared attempt
context is transient server-local data; it is not recoverable after redirect. No process-memory store/cache,
Redis namespace, TTL policy, transaction wire format, correlation cookie, or persistence-provider interface.

**Testing**: Public consumer/service properties by default; named examples for protocol/configuration/framework
boundaries; requirement-tagged partial HTTP/browser BDD; manual real-Keycloak and exported OTel inspection.
No durable telemetry tests and no test that merely repeats a constant-false implementation.

**Target Platform**: Existing Next Node server and Compose Keycloak; optional LGTM for exported traces. Redis is
not required by this increment. Running the full existing BDD suite may still follow its documented infrastructure
setup; that is not a dependency of the new initiation capability.

**Project Type**: Frontend authentication orchestration and the minimal session-presence boundary it consumes.

**Performance Goals**: No new product SLO. Bound provider preparation to five seconds with cancellation and no
application retry machinery; this is an internal failure bound, not a login completion guarantee.

**Constraints**: Tenant lookup precedes tenant-dependent provider work, not the tenant-independent anonymous
redirect. Preserve actual login/diagnostic 404/500, ordinary missing-page presentation, safe full diagnostic JSON,
public exceptions, recursive module ownership, shared runtime execution, and the single OTel exporter.

**Scale/Scope**: One session-missing reference entry, two distinguishable tenants, host/static resolution modes.
The session predicate has no supported positive result in this feature. Callback acceptance, complete round-trip
correlation, session recognition/storage, and comprehensive application protection remain incomplete.

## Constitution Check

Pre-/post-design gates pass within the refined scope:

| Principle                  | Assessment                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Evidence-grounded scope | Main requirements govern. The maintainer selected session-first routing; the delivery supplement records the narrower #216/#217 handoff. No durable requirement is silently rewritten.                 |
| II. Ownership              | Session presence and provider initiation remain frontend-owned. No session/domain persistence or backend work.                                                                                         |
| III. Tenant isolation      | Root redirects without tenant-dependent behavior; login resolves one tenant before consuming its configuration. Future positive access must resolve/compare request and session tenants independently. |
| IV. Accessible SSR         | Root and login are server pages; no cookie-writing adapter is needed yet. Public error/retry and ordinary missing-page UI remain usable. No new client component or library workaround.                |
| V. Meaningful tests        | Test consumer outcomes and protocol invariants, not the implementation's literal false value. Keep BDD at application boundaries, tagged and partial; telemetry manual.                                |
| VI. Simplicity/quality     | One actual OIDC dependency; the session boundary has a real current consumer. No unused store, speculative session representation, cookie/TTL machinery, new infrastructure, or test runner.           |

Moving the tenant failure observation to the tenant-dependent login request follows TENANT-003/004/005. Root is
now a session-routing request: its raw 307 is neither tenant success nor tenant failure. Browser navigation through
the automatic hop still ends on the ordinary missing page for an invalid tenant. Retain actual status assertions
at the new responsible request; do not accept a text-only error or 307 as evidence for a promised 404/500.

## Project Structure

### Documentation (this feature)

```text
specs/007-initiate-tenant-oidc/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/{initiation,modules}.md
└── checklists/requirements.md
```

No `tasks.md` is generated by planning.

### Source Code (proposed implementation)

```text
packages/frontend/src/
├── app/(app)/layout.tsx                 # remove eager request-tenant lookup
├── app/(app)/page.tsx                   # session-first missing-session redirect
├── app/auth/login/page.tsx              # resolve tenant; prepare provider redirect
├── lib/session.ts                      # public session-presence capability; always absent now
├── lib/authentication.ts               # public provider preparation capability
├── lib/authentication/{config,provider}.ts
└── lib/runtime.ts                     # compose capabilities through the shared host runtime
packages/frontend/tests/
├── lib/authentication.test.ts          # real preparation service in controlled worlds
└── unit/authentication-entry.test.ts   # root/login consumer outcomes and ordering
```

**Structure Decision**: Session presence and OIDC preparation are separate owning modules with current consumers.
A minimal `SessionService.hasSession(): Effect<boolean>` is sufficient for the current consumer; its production
Layer always supplies false and performs no cookie/store/tenant lookup. Do not invent an Option payload, session
fields, or future lookup arguments solely for this feature. Future stored-session work can refine the public
contract when identity and failure outcomes have actual consumers.

Only `authentication.ts` imports its private children. External tests and runtime consume parent interfaces.
The existing `(app)/tenant-context.ts` remains for the public on-site preview's explicit tenant read; do not add
cross-route imports of that private helper. `proxy.ts` stays pass-through.

## Implementation Sequence

### 1. Introduce session presence at its consumer

Add the minimal public session capability and its always-absent production Layer. The root runs that capability
through the existing ManagedRuntime before any request-tenant lookup. On absence it redirects to `/auth/login`.
Remove both root and enclosing-layout eager reads; do not leave a child preload/metadata read that defeats the
ordering. Runtime construction may parse process configuration but must not resolve/read a request tenant.

Do not implement a positive-session rendering path, accept a cookie as proof of authentication, or use a fake
session to display protected content. The future positive branch requires real lookup and independent tenant
binding before any protected consumer runs. A simple presence check is routing information, not authorization.

### 2. Prepare the tenant's authorization request

Define the public preparation operation `AuthenticationService.prepare({ host })`. It obtains the selected alias
and file from `TenantConfigService`, then validates callback authority and prepares a provider request. Return a
prepared authorization destination, or existing tenant errors / a separate safe `AuthenticationUnavailable`.
Keep transient attempt context private; do not expose it solely for future persistence. No runtime is started inside the operation.

Use the real OIDC client with controlled transport in service tests. Discover from issuer, use code/openid/PKCE
S256/state/nonce and `max_age=0`, and keep the verifier server-only. Do not resolve confidential client secrets or
interpret `connection` as a vendor hint. Callback origins come from a process-owned alias-to-origin map, never
Host/forwarded/query authority. Explicit loopback-only local HTTP is allowed by a named setting; HTTPS is default.

Keep transport adaptation private in `authentication/provider.ts`. Supply the configured issuer to discovery,
not a direct `.well-known` document shortcut that skips the pinned client's issuer comparison. Validate the actual
outbound discovery URL and the returned authorization destination as well as the issuer/callback. Preserve the
client's manual-redirect mode and reject discovery redirects; do not follow a target outside the validation boundary.
The library's general `allowInsecureRequests` escape alone does not enforce the application's loopback restriction.

After tenant resolution, put one five-second deadline around the entire provider-preparation Effect. Bridge the
client with `Effect.tryPromise` and close over its interruption signal in the client's `customFetch`; combine that
signal with the library's supplied signal using `AbortSignal.any`, forwarding other request options unchanged.
Keep the library's own safety timeout; it cannot renew the enclosing deadline. Deadline expiry yields safe
`AuthenticationUnavailable` after cancelling transport, while caller interruption remains interruption and defects
remain defects. Do not add per-fetch application timers, retry machinery or a general HTTP service.

There is deliberately no persistence sink. Context generated for preparation is discarded after the response;
no in-memory replacement store, cookie, Redis client, namespace, or TTL is introduced. This flow cannot complete
an accepted authentication round trip, and the public callback remains a denying fallback.

### 3. Integrate the login server page and actual failure presentation

The login page executes preparation through Runtime and redirects to the provider outside any catch that would
swallow Next navigation interrupts. Because this feature writes no cookies, use a server page rather than a
Route Handler. Map tenant errors through the existing page error boundary so invalid tenants have ordinary
missing-page UI and actual 404; preserve tenant 500 separately. Initiation-specific failure goes to the existing
public sign-in error page without protected content or unsafe query payloads.

Keep root/login redirects before streaming/Suspense commits a response. Verify production HTTP 307 and no-store
behavior; a mock of `redirect()` is not enough. The root first-hop redirect is independent of tenant validity;
only the login request can establish the tenant/provider outcome. Public callback/error/test/recovery/assets and
unrelated methods/actions do not automatically initiate OIDC as a consequence of this change.

### 4. Reconcile and retain requirements evidence

Use the spec's planned `@partial` initiation/public-resource features. Tag root missing-session delegation with
SESSION-001/004; observe tenant-specific provider selection and actual failures at `/auth/login`, with existing
tenant IDs where supported. The constant-false service is an implementation choice, not a new Gherkin product
promise or evidence of full session recognition.

Move current tenant-root-200 and failure assertions to the responsible login boundary, or explicitly follow the
single same-origin hop while retaining both response observations. Do not globally alter the generic status step.
Keep independent diagnostic JSON comparisons and unrelated missing-path behavior. Browser interception must not
follow redirects internally with the wrong Host: preserve logical application authority, let the browser perform
the hop, and do not forward external provider navigation back to Next. Add a narrow harness regression only if a
new helper introduces a meaningful continuing guarantee. No BDD store clients or mock identity providers.

The new success cases require real provider discovery. Update `tests/bdd/support/world.ts` and `server.ts` so each
scenario explicitly supplies `OIDC_CALLBACK_ORIGINS_JSON` and `OIDC_ALLOW_INSECURE_LOOPBACK`; do not inherit a
developer's callback map or rely on the stale `BDD_ALLOW_LOOPBACK_HTTP` variable. Default Keycloak scenario origins
are `http://springfield.localhost:3000` and `http://shelbyville.localhost:3000`, matching the tracked realm's clients.
Keep Next's random transport port and logical `example.test` request Hosts: neither determines callback authority.
These scenarios stop at provider arrival, so fixed callback ports need not host a listener. Missing-map scenarios
override the map explicitly. Negative tenant/root-routing and diagnostic checks must remain valid without provider
availability; do not add a provider probe to every scenario's application startup.

Update `features/README.md`, step guidance and relevant README/authentication instructions with local real-Keycloak
prerequisites. Update `.github/workflows/ci-bdd.yml` to start the existing pinned Keycloak image after checkout,
mount the tracked realm, and wait for successful realm discovery before the requirements suite. Use an owned,
ephemeral container with bounded readiness, useful startup-failure diagnostics and unconditional owned-container
cleanup. Provisioning/readiness belongs outside BDD product assertions; steps continue to observe the application
and browser journey. Preserve nightly/main-only scheduling, manual dispatch restrictions, existing Redis service,
report upload and independent smoke execution. This adds no Redis use to initiation, new provider topology,
wildcard callback registration, CI cadence or PR BDD job.

### 5. Validate and hand off

Follow [quickstart.md](quickstart.md) for browser, production HTTP, failures, and real exported telemetry.
Record revision/conditions and incomplete claims. Update active authentication/environment docs with this exact
partial state. Retain request/provider fixtures for #217. That increment must add persistence on the initiation
side before redirect together with callback recovery/consumption; do not pretend storing only after return is
sufficient. #218 still owns authenticated sessions and later enforcement remains #219/#154.

## Durable Vitest Decisions

Use properties by default when a rule holds over a meaningful input domain. Use `@effect/vitest` `it.effect.prop`
and real services with fresh scenario Layers; ordinary Vitest/`@fast-check/vitest` fits native host adapters.
Never turn randomness uniqueness sampling into a claim about cryptographic entropy.

| Claim / boundary                                                                                                | Durable evidence                                                                                                                                             | Reason and limit                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root cannot obtain protected content and delegates without tenant lookup in the current session-missing profile | Required consumer property over valid/invalid host inputs, absent/unusable tenant files and harmless/forged cookies, using the real always-absent capability | Assert raw same-origin redirect and no protected response. The unusable-tenant worlds detect an eager root/layout lookup; do not merely mock `hasSession` false or inspect private helper calls. Actual HTTP verifies layout composition. |
| Session module literal false result                                                                             | No separate durable test of the constant expression                                                                                                          | A stand-alone `expect(false)` mirrors implementation. The consumer property protects meaningful denial/routing; later session implementations need their own public behavior tests.                                                       |
| Login uses the selected issuer/client/callback for interleaved A/B/A and static arbitrary Host                  | Required public-service properties with distinguishable independent configuration expectations                                                               | Finds wrong-tenant/mutable-context substitution. Property domains follow current tenant contracts, not a new hostname parser.                                                                                                             |
| Prepared request consistently binds callback, PKCE challenge, state/nonce and `max_age=0`                       | Required property with real protocol adapter, deterministic generated attempt inputs and controlled discovery transport                                      | Context is transient and server-only; does not establish persistence, callback validation or provider acceptance.                                                                                                                         |
| Invalid process settings / callback map / TLS override                                                          | Generated valid-domain preservation properties plus named malformed JSON, invalid-origin, missing-map and loopback-only examples                             | Missing alias is request-time unavailability; invalid explicit process config is startup failure. No Redis/signing settings exist here.                                                                                                   |
| Provider metadata mismatch, unavailable discovery, timeout/interruption                                         | Required named service examples with controlled dependencies                                                                                                 | Distinct typed outcomes and cancellation, without raw error/log assertions or retry machinery.                                                                                                                                            |
| Root/login/framework outcomes                                                                                   | Small examples for root hop, login provider redirect, actual tenant status mapping, sign-in failure, no newly issued app/correlation cookie                  | Framework mappings are discrete. Do not duplicate the whole tenant matrix or snapshot UI copy. Full 404 page/307/no-store requires real production HTTP/browser evidence.                                                                 |
| Tenant service/Proxy/public preview                                                                             | Retain existing tests unless their own contract changes                                                                                                      | Root/layout consumers change, not the tenant decoder or Proxy. Preserve explicit preview tenant checks.                                                                                                                                   |
| Runtime, logs, spans, attributes/exporter                                                                       | Manual host/resource/telemetry evidence only; no durable telemetry assertions                                                                                | Existing single exporter/global bridge remains; no private Layer wiring/count tests.                                                                                                                                                      |

No durable persistence tests or real-Redis checks belong to #216 after this refinement. Those tests and failure
cases move with the real persistence implementation to #217, rather than being weakened or simulated here.

For the transport row, use public preparation outcomes with the real client: external HTTP is rejected even with
the local switch enabled; a discovery redirect never fetches its destination; a stalled discovery is cancelled
when the Effect test clock passes the deadline; caller cancellation produces an interrupted exit and no destination.
Include a mismatched issuer document. URL-domain properties protect transport policy; these distinct failure modes
are named examples. No retained telemetry assertions or test of workflow text/configuration presence is warranted.

## Validation and Completion Boundary

Run focused and full frontend Vitests; Gherkin lint/format/discovery; actual production HTTP/BDD; manual
Keycloak/browser/OTel observations; repository typecheck/build/lint/unused/format and the pre-commit audit.
FR-009/root routing is covered by the consumer property and actual first-hop HTTP; FR-001/002/005 by delegation
and login-boundary tenant evidence; FR-003 by protocol properties and provider request inspection; FR-004/006 by
public/diagnostic preservation; FR-007 by failure/accessible presentation; FR-008 by retained preparation fixtures.

Completion establishes an always-missing session boundary and tenant-specific delegation only. Recoverable
attempts, callback acceptance, actual stored sessions, positive-session access, independent session/tenant match,
verified provider freshness, browser session coordination and Microsoft/broker compatibility remain downstream.
