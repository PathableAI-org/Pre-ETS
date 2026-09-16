# Implementation Plan: Tenant OIDC Login Initiation

**Branch**: `003-tenant-oidc-login` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/003-tenant-oidc-login/spec.md` on `003-tenant-oidc-login`.

## Summary

Extend frontend-owned tenant configuration with per-tenant OIDC issuer, client id, and broker
connection selection. After the merged session setup runs, **unauthenticated** ready outcomes
(`reuse` or `create`) both enter the login-initiation path for Proxy-matched document navigations to
`/`: neither grants Display Name landing or application content. A newly created session may attach
`pathable-session` only on a successful document-navigation IdP `302`; failures never issue that
cookie. Add local Keycloak beside Redis in Compose for two synthetic tenant login experiences.
Callback completion and authenticated identity remain out of scope—so in this slice successful
document visits initiate OIDC (or fail); they do not SSR landing.

Accepted need evidence: `docs/authentication.md`, `docs/docker-compose.md`, and the merged session
module. Cost of inaction: without initiation plus local Keycloak, tenant-isolated login cannot be
demonstrated before callback work.

**Rollback (P6)**: If initiation errors block all first visits, revert the Proxy login-entry /
OIDC branch; local Compose services (Redis, Keycloak) may remain. Operational detail lives in
[quickstart.md](./quickstart.md).

Research decisions are in [research.md](./research.md). This plan is Phase 0 research and Phase 1
design only; it does not make pending OIDC Cucumber steps pass.

## Technical Context

**Language/Version**: Strict TypeScript 6.0.x, ESM, Node >=24; pnpm 12.4.1 (repository root).

**Primary Dependencies**: Existing Next.js 16.3.5 / React 19.3.0 / `jose` / `redis` / PathAble React.
Add `openid-client` to the frontend during implementation—**pin a compatible released version** in
the root lockfile and record the chosen major here once known—for discovery and authorization-code +
PKCE URL construction. No Better Auth, Auth.js, shared auth package, or backend dependency.

**Storage**: Existing frontend Redis for sessions. Add a second key namespace for short-lived OIDC
login transactions (PKCE verifier, state/nonce bindings). Tenant OIDC settings remain in process
environment JSON (same immutability/restart model as Display Name). Client credentials live in a
separate server-only secrets map env var—never in tenant JSON, browser output, or committed fixtures.
Local Keycloak uses its embedded `start-dev` database; no Postgres in this slice.

**Testing**: Existing Vitest frontend unit suite; root Cucumber/Playwright harness with
`pnpm test:bdd:oidc` (`CUCUMBER_OIDC=1`, `@tenant-oidc-login`). Add unit contracts for config parsing,
entry branching, transaction protection, redirect construction, and **session-cookie-on-failure
absence**. HTTP/`@contract` acceptance covers initiation outcomes without requiring live Keycloak in
CI. **CI policy (E8)**: CI runs `@contract` / `@http` without live Keycloak browser provider-arrival;
`@browser` usable IdP arrival is local / `pnpm test:bdd:oidc` with Compose Keycloak until CI gains a
Keycloak service. **Delivery gate (E5)**: the OIDC delivery PR MUST keep `pnpm test:bdd:session`
green **after** session scenarios are retargeted under initiate-or-fail (see Behavioral supersession
inventory); treat that partition as a mandatory regression gate alongside OIDC acceptance.

**Target Platform**: Host-run Next.js Node server; production HTTPS tenant hosts; local HTTP host
association and explicit static mode. Compose services on loopback only.

**Project Type**: SSR web frontend with external session store and local OIDC broker; backend
untouched.

**Performance Goals**: Soft expectation that discovery (cached per issuer) plus one transaction write
complete well under the existing session store timeout on a healthy local stack. Hard bound: Redis
transaction operations share the session store timeout default (2s) and fail closed. No new formal
latency SLO. Discovery metadata is cached in-process per issuer URL for the process lifetime.
**Cold path (E7)** may include one discovery RTT on first create/initiate per issuer per worker; warm
path uses the cache; both still fail closed under store timeout.

**Constraints**: Login initiation uses only resolved-tenant configuration; caller query/body cannot
override issuer, client, connection, or return host. PKCE verifier never leaves the server. Entry
distinguishes session `reuse` vs `create` for lifecycle and cookie rules, but **both unauthenticated
ready outcomes initiate login** (subject to config/provider/tx rules) for document navigations—never
SSR `(app)` landing without authenticated identity. Missing/invalid OIDC config → HTTP 403 with
**extended forbidden copy** (login cannot start + one clear next action + a11y; no secrets)—distinct
from the `login-unavailable` page used for provider/tx failures. Provider metadata or
transaction-establishment failures → accessible `login-unavailable` without IdP redirect or
application content. Automatic HTML login redirect applies only to document navigations of
participating application pages. Secure transport for issuer/authorization URLs outside explicit
local development. Preserve Redis Compose service; pin Keycloak image; no committed credentials.
Safe diagnostics (E9): stderr/structured outcome class only
(`reuse` / `redirect` / `403-config` / `login-unavailable` / `401-nondoc`)—never verifiers, secrets,
or raw tokens.

**Scale/Scope**: Participating path `/` (existing matcher) plus reserved `/auth/callback` pass-through
that must not re-enter login initiation. Two synthetic tenants, static localhost mode, local Keycloak
realm with distinguishable connections. No callback token exchange, logout, account provisioning,
backend authorization, durable tenant DB, or production broker deployment.

## Constitution Check

_GATE: Evaluated before Phase 0 and re-evaluated after Phase 1 (post-clarify / post-critique update)._

| Principle                          | Pre-research assessment                                                                                         | Post-design assessment and evidence                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Evidence-grounded specification | PASS: FR-001–013 and SC-001–006; clarify forbids anonymous landing; strategies name openid-client and Keycloak. | PASS: [research.md](./research.md) resolves field schema, secrets, unauthenticated initiate-for-both, cookie-on-success-only, transaction store, routes, Compose pin, CI Keycloak policy; contracts map observables to FR/SC; Supersedes 001 landing for all unauthenticated `/`.                                                                                                                                                            |
| II. Explicit ownership             | PASS: frontend owns tenant config and OIDC orchestration.                                                       | PASS: all modules under `packages/frontend`; Redis namespaces frontend-owned; backend untouched; no shared writable tables.                                                                                                                                                                                                                                                                                                                  |
| III. Tenant isolation              | PASS: host binding first; fail closed; no IdP substitution.                                                     | PASS: initiation binds slug/issuer/client/connection/return host server-side; tampering cases required; secrets never cross tenants; shared issuer does not merge tenant identity; cookie withheld on failure so next visit cannot silently land.                                                                                                                                                                                            |
| IV. Accessible SSR UI              | PASS: failure UX must be accessible; success is provider-hosted.                                                | PASS: app-owned failures are server-rendered (403 extended forbidden for config; PathAble `login-unavailable` for provider/tx) outside `(app)` as applicable; no client boundary for initiation; PathAble guidance required before failure UI; keyboard/focus on recovery actions (P4/P5).                                                                                                                                                   |
| V. Meaningful behavioral tests     | PASS: Gherkin already names browser login arrival and isolation.                                                | PASS: local `test:bdd:oidc` proves usable provider controls; CI `@contract`/`@http` without live Keycloak; unit layer covers PKCE/state binding and cookie-on-failure absence; no string-inventory E2E. OIDC Gherkin asserts anonymous `reuse` re-initiates (no landing). Behavioral supersession inventory requires same-slice retarget of session + 001 landing Gherkin; `pnpm test:bdd:session` stays green on the OIDC delivery PR (E5). |
| VI. Simplicity and quality         | PASS: one RP library and one local broker answer stated requirements.                                           | PASS: `openid-client` (pin on implement) + Redis transaction keys + Keycloak service; existing gates retained; no parallel auth stack.                                                                                                                                                                                                                                                                                                       |

Post-design review passes with no constitutional exceptions. Proxy remains the narrow boundary that
may issue the session cookie and the OIDC redirect on the same first-request response when
`outcome === "create"` and initiation succeeds with a document-navigation IdP `302`. Principles III
and V still pass under the never-land-without-login rule.

### Compatibility / Supersedes (001 landing-page)

**Supersedes** `specs/001-tenant-resolution/contracts/landing-page.md` Successful visit / modes table
for Proxy-matched document navigations to `/` **without authenticated identity** (both setup
`outcome: "reuse"` and `outcome: "create"`): those requests MUST initiate OIDC (or fail per FR-007)
and MUST NOT serve tenant application Display Name content first. Display Name landing remains only
after authenticated identity exists (callback / authenticated SSR—out of scope this slice). Critique
suggested wording that preserved Display Name obligations for `reuse` is **superseded** by this
product rule.

Implementation MUST update `specs/001-tenant-resolution/contracts/landing-page.md` in the **same
delivery slice** as Proxy initiation (same pattern as 002’s Refusal supersede). Do not edit that 001
file in this planning pass. Once authenticated landing exists, keep dual-layer regression: unauthenticated
`/` initiates (or fails); authenticated `/` may SSR Display Name.

### Compatibility / Behavioral supersession inventory (E1 / X1)

**Behavioral supersession (same delivery slice as Proxy initiation)**

The following active scenarios currently assert unauthenticated `/` serves tenant application or
Display Name content and MUST be rewritten or retagged when initiation ships so they no longer
conflict with FR-003/SC-002:

- `features/session-continuity.feature` — replace “existing Springfield tenant page” with session
  established + IdP redirect (or fail closed); no application content
- `features/session-recovery.feature` — same
- `features/local-session-development.feature` — replace “existing Springfield tenant page” with
  session retained/created + IdP redirect (or fail closed); no application content
- `features/tenant-landing-page.feature`, `features/local-host-tenant-resolution.feature`,
  `features/local-static-tenant-configuration.feature` — **retarget unauthenticated `/` to
  initiate-or-fail in this delivery slice; authenticated Display Name landing remains a later
  slice**

Session setup/cookie/tenant-binding contracts remain authoritative; only the post-setup document
response for unauthenticated visitors changes. Do not leave dual approved behavioral surfaces
(landing vs initiate-or-fail) in active Gherkin when Proxy initiation merges.

**Delivery note (E5)**: After that retarget, `pnpm test:bdd:session` MUST remain green on the OIDC
delivery PR.

## Project Structure

### Documentation (this feature)

```text
specs/003-tenant-oidc-login/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
└── contracts/
    ├── tenant-oidc-config.md
    ├── oidc-login-initiation.md
    └── local-keycloak.md
```

`tasks.md` is generated later by speckit-tasks, not by this planning command.

### Source Code (planned changes)

```text
compose.yaml                                 # Redis preserved; add pinned Keycloak
docs/docker-compose.md                       # Keycloak start/ready/provision; Redis retained
docs/authentication.md                       # Align initiation wording with unauthenticated initiate
README.md                                    # Local OIDC prerequisites pointer
.github/workflows/ci-bdd.yml                 # No live Keycloak required yet (E8); document partition
packages/frontend/
├── .env.example                             # OIDC fields + OIDC_CLIENT_SECRETS_JSON (empty)
├── package.json                             # add openid-client (pin compatible release)
├── src/proxy.ts                             # setup → unauthenticated initiate; cookie on 302 only
├── src/lib/tenant/                          # extend TenantConfig parsers; keep restart semantics
├── src/lib/oidc/
│   ├── types.ts                             # transaction record, config validation helpers
│   ├── secrets.ts                           # server-only slug→secret map
│   ├── discovery.ts                         # openid-client discovery + in-process issuer cache
│   ├── transaction.ts                       # Redis create/read helpers (verifier server-side)
│   ├── initiate.ts                          # build auth URL; fail-closed outcomes
│   └── cookie.ts                            # short-lived signed browser correlation cookie
├── src/app/(app)/page.tsx                   # landing SSR only after authenticated identity (later)
├── src/app/login-unavailable/page.tsx       # outside (app); accessible failure; no initiation
└── src/app/auth/callback/page.tsx           # reserved pass-through; no login re-entry; no completion
features/*.feature                           # OIDC + same-slice session/001 landing retarget (inventory)
tests/bdd/steps/oidc.steps.ts                # complete pending steps
packages/frontend/tests/                     # unit contracts for config, branch, cookie, tx, URL
```

**Structure Decision**: Keep OIDC initiation in the frontend beside session and tenant owners. Split
config validation, secrets, discovery, transaction persistence, and redirect construction at seams
that need independent failure tests. Do not introduce a shared auth workspace, Auth.js, or backend
OIDC routes.

**login-unavailable (E11 / P5)**: Route lives **outside** the `(app)` group so it is not gated by
AppLayout session requirements, is **unmatched** by the login-initiation document matcher path that
would re-enter redirect, and must work **without** a `pathable-session` cookie. PathAble composition
sketch for reviewers: explain that login cannot start; one keyboard-operable next action (e.g. “Try
again later” link/button with visible focus); no credentials or other tenant’s details. Read installed
`agent-guidance/pathable-react/SKILL.md` before implementing the failure UI.

## Request and Rendering Design

1. Keep Proxy matcher coverage for `/` (including document navigations). Add `/auth/callback` to the
   matcher only so Proxy can strip reserved headers and **pass through without** login initiation or
   recursive redirect. Do not invent operational health endpoints for FR-013.
2. Run existing `setupSession` first. Terminal `403` / `500` / `503` remain authoritative and unchanged.
3. Ready `outcome === "reuse"` or `"create"` **without authenticated identity** → enter the
   login-initiation path for document navigations (validate OIDC, discover, persist tx, redirect—or
   fail closed). **Never** SSR `(app)` landing / Display Name for unauthenticated requests.
4. **Authenticated short-circuit (E7)**: name the future gate now—session record gains an
   **authenticated user id** (per `docs/session-state.md` “Authenticated user”). That field is the
   **sole** short-circuit out of initiation into SSR landing. Until the field is present on the
   Redis session record, always initiate for ready unauthenticated outcomes (`reuse` / `create`).
   Implementing the field and short-circuit remains out of scope for this slice.
5. Cookie and failure rules on the initiation path:
   - **`create` + successful document IdP `302`**: attach `pathable-session` from setup’s new
     `cookieValue` on that redirect response (plus correlation cookie + Redis tx).
   - **`reuse` + initiate**: do not re-set `pathable-session` unless cookie attributes require it;
     do **not** SSR landing; still issue correlation cookie + Redis tx on successful redirect.
   - **Never** `Set-Cookie` `pathable-session` on: OIDC config 403, `login-unavailable`, transaction
     failure, or non-document `401`. Redis create orphans may TTL-expire; optional best-effort delete.
     HTTP acceptance (BDD `@http`/`@contract`) MUST assert absence of that Set-Cookie on those
     failure classes (E2).
   - Valid settings + non-document request (RSC/prefetch) → `401` without IdP `Location` or
     application content. **Early proof (E4)**: before broad BDD, prove one real Next 16.3.5 RSC /
     `Accept` shape for `/` and record the chosen signal + client-visible outcome in research/contract.
   - Missing/invalid OIDC config → HTTP 403 **extended forbidden** UX (login cannot start + next
     action + a11y; no secrets)—**not** the `login-unavailable` page (P4).
   - Discovery or transaction persistence failure → accessible `login-unavailable`; never unprotected
     provider redirect; never session cookie.
6. Connection hint (E5): config value remains `oidc.connection`; local Keycloak maps it to
   `kc_idp_hint=<connection>`. Other brokers are a follow-up mapping—not assumed identical.
7. `/auth/callback` is reserved for a later slice. This feature ships a minimal server-rendered stub
   that does not complete login and does not re-trigger entry redirect.

## Complexity Tracking

> No constitutional violations requiring justification.
