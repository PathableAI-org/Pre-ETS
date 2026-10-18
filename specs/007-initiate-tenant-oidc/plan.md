# Implementation Plan: Initiate tenant OIDC authentication

**Branch**: `154-initiate-tenant-oidc` | **Date**: 2026-10-18 | **Spec**: [spec.md](spec.md)

**Input**: Issue #216 / S2-B, from `specs/007-initiate-tenant-oidc/spec.md`.

**Inspection**: Feature commit `93c9f71fb1305722f89332dc7a8c14a13a417201`; refreshed main
`9f83d3bcf623f4fa4d8aa6ee7918033c259387be`. This is a proposed design, not implemented authentication
or executed provider, Redis, browser, or telemetry evidence.

## Summary

Implement the frontend's reusable tenant OIDC initiation capability and a reference browser entry. The root
server page preserves tenant validation, then automatically redirects to a new public `/auth/login` Route
Handler. That handler executes an Effect through the shared application runtime, prepares the selected tenant's
authorization request, persists a short-lived Redis transaction, sets an opaque transaction cookie, and redirects
to the provider. Both application redirects are automatic; the application never collects credentials.

Use a standards-based OIDC client for discovery, code flow, PKCE S256, state, nonce, and `max_age=0`. Tenant
selection remains the existing public tenant service's responsibility. Keep transaction storage separate from
authenticated session storage; no token exchange, callback acceptance, user identity, or application session is
created here. #217 receives the transaction handoff; #218/#219/#154 supply later session/enforcement composition.

Detailed decisions and alternatives are in [research.md](research.md), wire/HTTP expectations in
[contracts/initiation.md](contracts/initiation.md), and manual observations in [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: Strict TypeScript 6.0.3, private ESM workspace; Node 26-compatible runtime.

**Primary Dependencies**: Existing Next.js 16.4.2, React 19.3.1, Effect/@effect/platform-node 4.0.5,
`@effect/vitest`, and `@pathableai/react` 0.3.0. Add frontend-owned `openid-client@6.8.8` and `redis@6.2.1`
in the implementation PR, with one root lockfile. No dependency installation is part of this plan change.
Confirm their installed declarations before coding; official release/source research does not substitute for that.

**Storage**: Existing Redis service, transaction-only namespace and 600-second technical expiry; existing
filesystem tenant configuration remains authoritative. No authenticated session record, Postgres change, signing
key, secret provider, or domain persistence is introduced.

**Testing**: Public-service Vitests, properties by default, using real application implementations with scenario
dependencies; small framework examples; requirements-backed HTTP/browser BDD; manual real Redis/Keycloak/browser
and exported OTel inspection. No durable telemetry assertions or new test framework/integration runner.

**Target Platform**: Next.js Node server on the host, Compose Redis/Keycloak; current OTel exporter and optional LGTM.

**Project Type**: Frontend authentication orchestration within the existing multi-workspace application.

**Performance Goals**: No product latency, throughput, or availability SLO is added. Bound provider operations
and Redis operations to five seconds each with cancellation and no automatic retries/offline command queue;
these are technical failure bounds, not promises about provider uptime or total browser login duration.

**Constraints**: Preserve tenant 404/500/startup mappings, independent tenant selection, non-secret diagnostic
JSON, public exceptions, recursive module boundaries, shared runtime execution, and a single OTel exporter.
Provider HTTPS is required except explicit loopback-only local testing. Browser return origins are process-owned.

**Scale/Scope**: Two distinguishable synthetic tenants, both resolution modes, one reference protected-page
entry, one outstanding transaction cookie per browser host. Full entry-point coverage and concurrent-login-tab
semantics remain downstream. B6 comparison/tolerance/provider acceptance decisions do not block request creation.

## Constitution Check

Pre-research and post-design assessments both pass for this bounded proposal:

| Principle                            | Assessment and evidence boundary                                                                                                                                                                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Evidence-grounded specification   | Main-branch requirements govern; spec FR-001–008 are traced below. B6 response-validation decisions stay explicit downstream gates; no inferred policy or full verification claim.                                                                                                |
| II. Ownership and authoritative data | All implementation stays frontend-owned; Redis holds transient login attempts only. No backend, business authorization, shared writable tables, or domain records.                                                                                                                |
| III. Tenant isolation                | Resolve once per request through `TenantConfigService`; pass the resulting context into initiation. Bind the transaction to tenant/client/issuer/callback. Ignore caller-supplied tenant/return authority and forwarded-host claims.                                              |
| IV. Accessible SSR UI                | Root remains a server page; initiation is automatic. Retain the existing public callback/error UI and semantic retry link. No new client component/library workaround. If presentation changes, read the installed PathAble guide and verify composed keyboard/focus/AT behavior. |
| V. Meaningful tests                  | Properties protect public invariants; examples address discrete protocol/framework/failure conditions. BDD uses main requirement tags and `@partial`; real-provider acceptance and telemetry have distinct manual evidence.                                                       |
| VI. Simplicity and quality           | Two dependencies support actual discovery and persistence. No authentication framework, new infrastructure, generic session service, caches, polling, retry machinery, or telemetry test suite. Run existing quality gates.                                                       |

No constitution exception is requested. Existing strategy documents with historical login/session claims are
context only; current source and the inspected requirements override those implementation assumptions. The
tenant-configured provider may be a broker; this design selects no new deployment topology or Microsoft product.

## Project Structure

### Documentation (this feature)

```text
specs/007-initiate-tenant-oidc/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── initiation.md
│   └── modules.md
└── checklists/requirements.md
```

`tasks.md` belongs to the later `$speckit-tasks` phase and is not created here.

### Source Code (repository root)

Proposed additions below describe implementation work, not files already created:

```text
packages/frontend/src/
├── app/(app)/page.tsx                   # automatic entry after existing tenant validation
├── app/auth/login/route.ts              # new GET/HEAD initiation host adapter
├── lib/authentication.ts                # public Effect initiation boundary
├── lib/authentication/
│   ├── config.ts                        # private settings recipe/validation
│   ├── provider.ts                      # private OIDC library adapter
│   └── transactions.ts                  # private Redis issuance adapter
└── lib/runtime.ts                      # compose authentication Layer once per application host
packages/frontend/tests/
├── lib/authentication.test.ts           # public-service properties and meaningful failure examples
└── unit/authentication-entry.test.ts    # narrow Next response/entry mappings
tests/bdd/
├── requirements/tenant-oidc-initiation.feature
├── requirements/authentication-public-resources.feature
├── steps/authentication.ts
└── support/                            # owned process/config and response observations
```

**Structure Decision**: One owning public module, private children imported only by that parent. Runtime and
external tests import `lib/authentication.ts`, never its descendants. Expose dependency capabilities through
the parent only as needed for actual composition/scenario Layers; do not publish unused callback/session APIs.
The full before/after module inventory is [contracts/modules.md](contracts/modules.md).

## Implementation Sequence

### 1. Establish the public consumer contract and scenario worlds

Define `AuthenticationService.begin({ host })` returning a prepared provider redirect and transaction-cookie
instructions, or existing tenant `HttpError` / bounded `AuthenticationUnavailable`. The caller supplies request
data, not process policy. The service gets configuration, tenant selection, transport, time/randomness, and
transaction persistence through its Layer graph. No operation starts a runtime internally.

Introduce only the dependency seams needed to supply the service's real world in tests. Keep the provider and
transaction implementations real when checking their behavior; supply deterministic fetch responses, clock,
cryptographic-value source, and recording conditional storage below them. Do not replace the service under test
with a canned successful implementation. Start the durable properties before wiring HTTP.

### 2. Implement protocol preparation and transaction issuance

Discover from the configured issuer URL; validate metadata and use library URL/PKCE operations. Request only
`openid`, code response, S256, state, nonce, exact configured callback, and `max_age=0`. Do not map the existing
opaque `connection` setting to a vendor-specific hint or resolve confidential-client secrets during initiation.

Add process settings through the owning authentication module: callback-origin map, Redis URL, transaction key
prefix, and explicit insecure-loopback switch. See [data-model.md](data-model.md) for defaults and validation.
The map selects only callback transport, never tenant identity/configuration. An absent alias entry makes
initiation unavailable; it does not prevent diagnostics from loading or invent tenant fallback.

Persist an independently generated opaque handle's tenant-bound record with conditional insertion and expiry
before returning cookie/redirect instructions. No records or external connections are created by ordinary
tenant reads/diagnostics. Keep actual resource acquisition within the request operation's Effect scope: connect,
write, and finalize one bounded Redis client per issuance, rather than adding a process cache/pool now. Install
a sanitized client error listener; disable offline queuing and reconnect retries. On interruption or failed close,
destroy the owned socket. Redis is shared across instances; no process-local current transaction exists.

### 3. Integrate the actual reference entry and preserve public paths

After `requireTenantConfig()`, the root server page performs an automatic same-origin redirect to `/auth/login`.
Keep that decision before any streaming/Suspense boundary that could commit HTTP 200 and substitute a client-side
meta redirect. Verify the actual production HTTP 307; a mocked navigation helper cannot establish it.
No protected welcome markup is emitted first. The public GET/HEAD handler independently resolves its own request
tenant through `begin`, then returns HTTP 307 with a host-only transaction cookie and provider `Location` only
after persistence succeeds. Set `Cache-Control: private, no-store` on initiation-handler responses so per-attempt
redirect/cookie data is not cached. It ignores query return destinations and caller-supplied tenant context.

For initiation-specific failures, redirect to the existing `/login-unavailable` without a transaction cookie or
protected content. Keep tenant errors separate: preserve their status; direct handler errors can use existing
safe HTTP error mapping, while `/` continues to use its existing ordinary missing-page/500 presentation before
the first redirect. The direct handler does not promise a separate missing-page UI. Do not broaden `HttpError`'s
404/500 vocabulary to represent provider outages or swallow defects as tenant failures.

The existing Proxy remains pass-through, with no discovery, Redis I/O, or application-runtime sharing assumption.
Other methods, Server Actions, public callback/error/test routes, assets, and absent paths do not begin OIDC as
a consequence of this change. Explicitly designate `/auth/login` as the public initiation transport; it returns
no protected data. Root success is a documented two-hop automatic flow, not a new login control.

### 4. Extend retained requirement evidence

Use the two planned feature-level `@partial` BDD files and scenario-specific requirement tags from the spec.
Resolve the current main requirement versions again when authoring. HTTP steps may follow the one documented
same-origin `/auth/login` hop explicitly to inspect the final application-to-provider redirect; never blindly
follow arbitrary `Location` values or assert real provider acceptance from URL parsing.

Preserve existing tenant diagnostic JSON comparisons and 404/500/missing-page assertions. Revise root-200
reachability expectations semantically, not the generic status step. Existing missing-page browser interception
forwards every URL to Next; do not reuse it for provider navigation without restricting it to the application
origin. BDD supplies scenario-owned callback origins/prefix and real provider configuration; it does not open
Redis, read transaction records, or mock providers. Existing historical signing/session settings in the harness
are not a substitute for the new runtime settings. Scope harness cleanup to owned resources; TTL removes abandoned
transaction records without flushing shared Redis.

### 5. Validate the composed increment and hand off

Run durable tests and actual application scenarios, then follow [quickstart.md](quickstart.md) for real
Keycloak, Redis, browser, failure, and exported OTel observations. Update active authentication/environment docs
with the delivered partial behavior and limitations; correct touched historical cache/env claims rather than
copying them. Record revision, commands, conditions, results, and remaining gaps. Hand #217 the record/cookie
contract and retained fixtures; implement no callback consume/read/token operation solely for this handoff.

## Durable Vitest Decisions

Choose a property unless a discrete protocol boundary or framework outcome makes a named example stronger.
Properties run through the public parent module with fresh scenario Layers for every generated/shrinking attempt.
Use installed `@effect/vitest` `it.effect.prop` / `it.effect`; pure/Next adapters use ordinary Vitest or
`@fast-check/vitest`. A finite property run is not proof of all inputs or cryptographic entropy.

| Claim / affected boundary                                                                                  | Durable evidence and choice                                                                                                                                                                        | Why / important limits                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selected tenant controls issuer/client/callback for A/B/A entries                                          | Required service property over distinguishable valid configs, both modes, valid host labels/static host strings                                                                                    | Detects mutable current-tenant/config substitution. Supply independent expected fixture values; no duplicate private parser tests.                                        |
| Every prepared request retains code/openid/S256/state/nonce/`max_age=0` and binds the same record          | Required property over valid configs and deterministic fresh attempt values, using the real protocol adapter and controlled discovery transport                                                    | Detects missing freshness request, mismatched verifier/challenge, wrong tenant/return binding; does not prove provider acceptance or randomness quality.                  |
| Issuance preserves encoded transaction meaning, expiry and conditional-write semantics                     | Required property through public initiation/persistence capabilities with the real adapter and a recording Redis command boundary                                                                  | Assert independently decoded record fields and non-overwrite behavior, not helper invocation order. Actual Redis behavior remains a distinct manual check.                |
| Failed discovery, malformed metadata, issuer mismatch, failed persistence, collision, timeout/interruption | Required named examples with real service and failed/delayed dependencies                                                                                                                          | Discrete externally distinct failures; confirm typed outcome and no prepared cookie/redirect. No raw error/log assertions. Clock-controlled cancellation where supported. |
| Process callback map cannot be replaced by Host/forwarded input; static selection is host-independent      | Required configuration/service properties over hostile header/host variation, valid map entries and scheme/origin domains                                                                          | Do not narrow the existing tenant host domain or derive callback authority from request metadata.                                                                         |
| Explicit invalid config / missing callback entry / loopback override boundaries                            | Named examples for malformed JSON, credentials/path/query origins, HTTPS/default, allowed local HTTP and forbidden external HTTP; generated valid origins for preservation                         | Distinct startup failure versus request-time unavailable is specified in the contract; no made-up tolerance or full URL grammar proof.                                    |
| Next entry/handler maps effects to useful responses and cookie policy                                      | Required small examples: root automatic hop, handler provider 307/no-store, transaction cookie flags, failure redirect without new cookie, preserved tenant statuses, public callback still public | Framework examples are clearer than generating route names; do not duplicate the service's whole tenant matrix or snapshot exact markup.                                  |
| Existing tenant schema, policy service, and Proxy                                                          | No new durable Vitests unless implementation changes their public contract; retain existing tests                                                                                                  | They keep their contracts. Do not add tests simply because runtime composes them.                                                                                         |
| Runtime Layer lifetime                                                                                     | Service examples for owned-resource release on success/failure/interruption; real HTTP verifies host composition                                                                                   | Avoid private Layer wiring assertions or a runtime instance-count test.                                                                                                   |
| Logs, spans, attributes, payload secrecy, and exporter wiring                                              | No durable Vitest; manual/ad hoc inspection of real logs and exported spans                                                                                                                        | Repository policy expressly forbids telemetry tests, including in-memory logger/tracer tests.                                                                             |

The Redis command-boundary tests do not prove real server TTL/conditional writes. This plan deliberately uses
owned-prefix manual Redis inspection plus real HTTP/provider execution for that remaining adapter uncertainty;
it does not add a conditional/skipped integration suite or another test runner. Reassess a durable real-Redis lane
when #218/#220 introduce application-session lifecycle/race promises.

## Validation and Completion Boundary

Implementation validation order: focused service/adapter Vitests; full frontend Vitests; Gherkin lint/format and
dry discovery; real HTTP/BDD; manual browser/provider/Redis and OTel; repository typecheck/build/lint/unused/format
and pre-commit changed-code audit. Actual commands and expected observations are in the quickstart.

Spec FR-001/002/005 map to entry, tenant properties and HTTP BDD; FR-003 to protocol/issuance properties and
real provider request inspection; FR-004/006 to public/diagnostic preservation and manual content assessment;
FR-007 to failure mapping and composed browser accessibility; FR-008 to the retained contracts/fixtures and
the #217 handoff. No completed issue or passing check establishes whole-requirement verification.

After this increment, callback validation, signed `auth_time` freshness, session establishment, valid-session
reuse, comprehensive entry-point protection, logout/activity/idle/warning/recovery, Microsoft/broker compatibility,
and production ingress remain incomplete. Do not claim authentication success from reaching the provider or
returning to the current callback fallback.
