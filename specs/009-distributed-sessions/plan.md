# Implementation Plan: Establish Distributed Application Sessions

**Branch**: `156-distributed-sessions-plan` | **Date**: 2026-10-23 | **Spec**: [spec.md](spec.md)

**Input**: Approved feature contract in `specs/009-distributed-sessions/spec.md` and
`specs/009-distributed-sessions/verification.md`

## Summary

Extend the frontend-owned `SessionService` from its current fail-closed presence stub into the public capability for
initial session establishment and reads. Persist a strict, versioned record in the existing Redis dependency under an
owned prefix, issue a random opaque host-only cookie reference only after a successful write, and return explicit usable,
no-usable-session, and typed service-failure outcomes. The existing callback Route Handler becomes the bounded reference
consumer: after `AuthenticationService.complete` yields a trusted identity, it obtains the tenant's effective session
policy, establishes the session, and issues the cookie. Comprehensive request enforcement remains with #219/#154.

The design retains a separate non-bearer telemetry correlation identifier in the server-held record. Successful
establishment and usable reads annotate their Effect spans with `session.id`; rejected authentication, failed writes,
and no-usable-session reads do not emit a misleading successful-session identifier. Telemetry remains complementary
manual evidence and is never a durable test oracle.

## Technical Context

**Language/Version**: TypeScript under the repository's strict NodeNext configuration; Node.js version from
`.node-version`

**Primary Dependencies**: Next.js 16.4.2 App Router/Route Handlers, Effect 4.0.5, `@effect/platform-node` 4.0.5,
`redis` 6.3.0 through `NodeRedis`, `openid-client` 6.8.8, existing OpenTelemetry/Effect bridge

**Storage**: Frontend-owned Redis transient records with bounded TTL and an owned `SESSION_KEY_PREFIX`; no Postgres,
browser-held state beyond the opaque reference, or process-memory substitute

**Testing**: `@effect/vitest`/Vitest public-service scenarios, real Redis integration with independent clients, the
existing real-provider callback harness, repository requirements BDD only within current-main requirement authority,
and manual/transient Grafana/Tempo inspection

**Target Platform**: Next.js Node server running on the host; pinned Redis and Keycloak from local Compose for
integration and manual evidence

**Project Type**: Existing pnpm monorepo web application; implementation remains in `packages/frontend`

**Performance Goals**: No numerical throughput or latency promise is authorized. Establishment uses one bounded Redis
`SET ... NX PX` attempt at a time (with a small collision retry bound); reads use one Redis `GET`. No request creates a
new runtime or Redis client.

**Constraints**: Fail closed on malformed references, unavailable/expired/missing records, decode failures, and Redis
transport errors; host-only `HttpOnly` cookie; no provider tokens, credentials, raw cookie/store identifiers, or bearer
values in telemetry; no renewal, invalidation operation, protected-entry enforcement, arbitrary session values, or
durable telemetry assertions

**Scale/Scope**: One frontend public session module, one existing callback Route Handler, one versioned record format,
one cookie contract, and one shared Redis layer usable by independent clients. User-count/capacity targets are not set by
the approved authorities.

## Constitution Check

_GATE: Passed before research and re-checked after Phase 1 design._

| Principle / constraint                        | Pre-design gate                                                                                                                                             | Post-design result                                                                                                                                                                                                                                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Evidence-grounded specification            | `spec.md` and `verification.md` are immutable planning inputs; issue #218, the approved S2 slice, and current-main PREETS-SESSION-003/006/008 were re-read. | Pass. No product behavior was added from code or historical artifacts. Issue-only V-005–V-007 remain public-service/adapter evidence rather than requirements BDD.                                                                                                                                                |
| II. Explicit ownership and authoritative data | Session state is frontend-owned transient state; backend/domain persistence is excluded.                                                                    | Pass. Redis remains frontend-only and no shared package or backend dependency is introduced.                                                                                                                                                                                                                      |
| III. Tenant isolation                         | Callback identity and session tenant must stay identical; cookie must be host-only; protected request tenant comparison is later work.                      | Pass. Establishment copies the already trusted callback tenant, cookie sets no `Domain`, and the plan does not claim #219/#154 enforcement.                                                                                                                                                                       |
| IV. Accessible, server-rendered UI            | No UI or `@pathableai/react` change is needed.                                                                                                              | Not applicable. The existing safe callback presentation is reused for expected establishment failure.                                                                                                                                                                                                             |
| V. Meaningful behavioral tests                | Evidence must start from named claims; real Redis and real callback composition carry distinct uncertainty; observability is manual/transient.              | Pass. Module evidence, feature evidence, BDD limits, real-store evidence, cleanup, and retained-record limits are explicit.                                                                                                                                                                                       |
| VI. Simplicity and verifiable quality         | Actual consumers must justify abstractions; public contracts precede implementation details.                                                                | Pass. The existing session parent is extended, private codec/store children are introduced, and no provider interface, package, general value store, or second telemetry stack is added.                                                                                                                          |
| Architecture/workflow constraints             | Frontend owns sessions; Redis is required; Effect APIs must match installed 4.0.5 declarations; host runtime is shared.                                     | Pass. `Context.Service`, `Schema.TaggedError`, `Effect.fn`, `Effect.annotateCurrentSpan`, Redis `send`, `Layer`, and `ManagedRuntime` surfaces were checked against installed Effect 4.0.5 source/declarations. The local Effect checkout (`41cf29b5d85af7fc25bcc7713f2e05142edaa66a`) was used only as guidance. |

No constitutional exception or complexity waiver is required.

## Project Structure

### Documentation (this feature)

```text
specs/009-distributed-sessions/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── verification.md
├── spec.md
└── contracts/
    ├── callback-http.md
    └── modules.md
```

### Source Code (repository root)

```text
packages/frontend/
├── src/
│   ├── app/auth/
│   │   ├── callback/route.ts        # bounded trusted-callback consumer
│   │   └── cookie.ts                # framework cookie write/clear helpers and names
│   └── lib/
│       ├── authentication.ts        # existing trusted-identity producer; export its result type
│       ├── runtime.ts               # one shared Redis layer and ManagedRuntime composition
│       ├── session.ts               # public SessionService and public result/error types
│       └── session/
│           ├── codec.ts             # private reference and stored-record schemas/encoding
│           └── store.ts             # private Redis key/config/command adapter
└── tests/
    ├── integration/
    │   └── session-redis.test.ts     # independent real-Redis clients and failures
    ├── lib/
    │   └── session.test.ts           # public SessionService scenarios with controlled clock/world
    └── unit/
        └── authentication-entry.test.ts # callback response/cookie mapping

tests/integration/
└── session-callback-keycloak.test.ts    # real Keycloak callback plus independent public session client

tests/bdd/
├── requirements/tenant-oidc-callback.feature # remove superseded no-session success assertion; no issue-only expansion
└── steps/authentication.ts                    # keep assertions within current-main requirement authority
```

**Structure Decision**: Preserve the frontend workspace and extend the existing `lib/session.ts` parent. Put record
codec and Redis mechanics beneath that parent so callers and tests use the public service. Keep Next cookie mutation in
the existing auth adapter, not inside the Effect service. No package/workspace promotion is warranted because the
backend must not consume frontend Redis sessions and no other process owns this state.

## Phased Engineering Design

### Phase 1 — Module architecture

1. Extend `lib/session.ts` as the single public owner of session establishment/read semantics. Decompose only its
   persistence codec and Redis commands into private `lib/session/` children. Preserve `hasSession()` as the current
   fail-closed compatibility operation for the root reference entry; it continues to report false until #219 migrates
   that consumer to an independently tenant-bound read.
2. Preserve `lib/authentication.ts` as the trusted-identity producer. Export its existing `TrustedIdentity` result type
   so the callback adapter can map it explicitly into the session input; session storage does not absorb OIDC validation.
3. Preserve `TenantConfigService` and consume its existing `getConfigFromAlias` and `effectiveSessionPolicy` operations
   at establishment time. Do not duplicate policy defaults or validation in the session module.
4. Extend the existing callback Route Handler as the bounded reference consumer. Keep Next response/cookie mutation at
   that framework edge; no general callback coordinator service is justified by one consumer.
5. Recompose the existing process runtime around one `NodeRedis.layer` value shared by authentication transactions and
   sessions. The host-owned `ManagedRuntime` still acquires and disposes the resource once.
6. Use the existing observability layer. Add a useful `SessionService.establish`/`SessionService.read` Effect span and
   annotate only successful usable-session paths with the record's non-bearer `session.id`. Add no exporter or telemetry
   service abstraction.

The detailed ownership decisions are recorded in [contracts/modules.md](contracts/modules.md).

### Phase 2 — Public module contracts

[contracts/modules.md](contracts/modules.md) defines the exact TypeScript shapes for `SessionService`, its usable and
no-usable-session values, `SessionServiceUnavailable`, the exported authentication identity, and the unchanged tenant
policy dependency. The Effect success channel distinguishes usable from no usable session; the typed error channel is
reserved for inability to determine or persist state. Identity and policy exist only on `UsableSession`.

[contracts/callback-http.md](contracts/callback-http.md) defines the bounded callback HTTP/cookie mapping. A successful
trusted callback writes the Redis record before emitting `pathable-session`; an establishment failure uses the existing
safe return presentation, clears consumed correlation, and emits no session cookie. This does not define protected-entry
consumption.

### Phase 3 — Module contract evidence

Evidence follows consumer → claim → violation → boundary → limitation:

- Public-service `@effect/vitest` scenarios use fresh deterministic Redis service Layers and a controlled Effect clock
  for reference validation, initial deadline/policy, public outcome separation, strict decoding, and non-disclosure.
- A real Redis integration creates through client/runtime A and reads through independently scoped client/runtime B,
  then exercises missing/expired/deleted records and controlled unavailability. This is the smallest boundary that can
  establish shared-store semantics and transport failure.
- Callback adapter tests establish cookie attributes and no-cookie failure mapping without retesting private Redis
  commands. A retained root integration test reuses the real-Keycloak browser/process harness, then reads the issued
  reference through an independently scoped public `SessionService`; a fabricated identity alone is insufficient for
  V-001.
- Requirements-backed BDD is not expanded to issue-only distinctions. Because this slice has no protected read that
  externally exposes user/tenant binding, the new successful-establishment BDD claim is deferred to #219/#154 rather
  than adding a diagnostic endpoint. Existing callback scenarios retain only assertions justified by current-main
  requirements, carry `@preets-session-003`/`@partial` where applicable, and drop the superseded success-path
  “creates no application session” assertion.
- Span/attribute/exporter behavior has no durable assertion. Manual or temporary inspection of live Tempo data supplies
  complementary observability evidence.

### Phase 4 — Implementation architecture

1. Define strict branded session references and a version-1 stored-record schema. Generate a 32-byte random unpadded
   base64url cookie reference, derive the Redis key by SHA-256 under the configured prefix so the bearer reference is not
   present as the key, and generate a separate random UUID telemetry identifier. Neither internal identifier is returned
   in `UsableSession`.
2. At establishment, obtain the Effect clock, derive `idleDeadlineEpochMilliseconds` from the already validated
   `idleTimeoutMinutes`, encode the record, and send `SET key payload NX PX ttl`. Retry only bounded random-reference
   collisions. Translate every Redis/codec inability to persist into `SessionServiceUnavailable`; an ambiguous write
   never produces a cookie and any unreachable record expires by TTL.
3. At read, decode the untrusted cookie reference before storage access, `GET` the derived key, decode the strict stored
   record, and compare the stored deadline with the Effect clock. Malformed/missing/expired/deleted records return the
   common `NoUsableSession`; Redis transport or corrupt stored data returns `SessionServiceUnavailable`. No tombstone or
   invalidation operation is introduced.
4. Create `Effect.fn("SessionService.establish")` and `Effect.fn("SessionService.read")` tracing boundaries. After a
   successful write or usable decode, call the installed `Effect.annotateCurrentSpan("session.id", telemetryId)` API.
   Do not annotate rejected authentication, failed writes, malformed/missing/expired reads, or errors with a successful
   session identifier. Never attach the cookie, derived Redis key, identity claims, provider values, or credentials.
5. In the callback Route Handler, call `AuthenticationService.complete`; only its success branch loads the same tenant
   configuration by trusted alias, derives current effective policy, and calls `SessionService.establish`. On success,
   clear the correlation cookie and set `pathable-session` with `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`, a
   `Secure` value consistent with the existing loopback rule, and lifetime bounded by the initial idle deadline. On
   failure, clear correlation after its prior consumption, reuse the private/no-store safe return, and set no session
   cookie.
6. In `runtime.ts`, construct one `NodeRedis.layer` with the existing URL, offline-queue, ping, and socket-timeout
   settings, then supply that same Layer value to both authentication and `SessionService.layer`. Preserve eager runtime
   acquisition/readiness and host disposal.
7. Update documentation/config examples for `SESSION_KEY_PREFIX` and the new session behavior during implementation,
   then sequence public-service evidence, real adapter evidence, callback mapping, real-provider composition, manual
   verification, and repository gates. Do not add implementation for renewal, invalidation, application-wide reads, or
   warning UI.

### Phase 5 — Feature verification integration

[verification.md](verification.md) remains the accepted claim/evidence design. [quickstart.md](quickstart.md) turns it
into an implementation-aware run guide with exact local-service, test, real-callback, live-trace, cleanup, and retained-
record steps. Module tests do not replace the composed manual feature procedure.

The execution order is: public-service scenarios → real Redis independent-client scenarios → callback adapter and
real-provider composition → applicable BDD regression without issue-only assertions → live browser/cookie/store
inspection → Tempo `session.id` correlation and secrecy inspection → cleanup → repository quality gates. Evidence must
name the exercised revision and limitations; generated artifacts or passing static checks are not runtime proof.
