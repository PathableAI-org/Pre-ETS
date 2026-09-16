# Research: Tenant OIDC Login Initiation

Date: 2026-09-16. All planning unknowns from the Technical Context and FR-002/005/006/013 are
resolved below. This document records decisions for implementation; it does not claim runtime
behavior is already delivered.

Updated after clarify (never land without login), critique cycles through
`critiques/critique-20260916-161751.md`, and PR review: explicit `oidc.clientAuth` so public vs
confidential registration is not inferred from an absent secrets-map entry. Prior “`reuse` continues
landing” decisions remain **superseded**.

## 1. Tenant OIDC configuration fields

**Decision**: Extend `TenantConfig` with a required nested `oidc` object alongside `displayName`:

| Field             | Type                           | Rule                                                                                                                                                                                                                                  |
| ----------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `displayName`     | string                         | Existing nonempty trimmed text                                                                                                                                                                                                        |
| `oidc.issuer`     | string                         | Absolute URL; `https:` required outside development; development may use `http:` only for loopback Keycloak                                                                                                                           |
| `oidc.clientId`   | string                         | Nonempty trimmed client identifier                                                                                                                                                                                                    |
| `oidc.clientAuth` | `"public"` \| `"confidential"` | Required closed set. Trusted registration mode for **this application’s** broker client—not inferred from discovery. `"public"` = PKCE-only (no client secret). `"confidential"` = nonempty server-only secret required for that slug |
| `oidc.connection` | string \| omitted              | Nonempty trimmed broker connection id when the registration requires IdP selection; omit only when issuer+client alone reach the tenant login experience                                                                              |

Reject unknown keys at record and `oidc` object levels (same strictness as today’s Display Name parser).
Missing or invalid `clientAuth` is unusable OIDC config (HTTP 403 extended forbidden). A Display
Name-only record is invalid for login initiation and yields HTTP 403 with **extended forbidden copy**
(login cannot start + next action + a11y; no secrets)—not the `login-unavailable` page. Update
`.env.example` and local docs with Springfield/Shelbyville synthetic OIDC examples (`clientAuth:
"public"` for local Keycloak). Restart remains the documented reload procedure.

**Rationale**: Matches Gherkin columns (`issuer`, `client`, `connection`) plus an explicit
registration-mode field so “missing required credential” is implementable without guessing from
discovery. Nested `oidc` keeps presentation fields distinct from login settings while remaining in
the same env JSON source.

**Alternatives considered**: Flat top-level OIDC keys (more collision risk with future presentation
fields); optional `oidc` with login bypass (violates FR-003/007); storing SAML metadata in-app
(contradicts authentication strategy); inferring confidential vs public from discovery metadata
(unreliable for the app’s own registration; rejected—see §2).

**Evidence**: `packages/frontend/src/lib/tenant/types.ts`; `features/tenant-oidc-configuration.feature`;
`docs/authentication.md`; FR-001, FR-002, FR-007, FR-011.

## 2. Server-only client credential supply

**Decision**: Do **not** place client secrets in `TENANT_CONFIG_RECORDS_JSON` /
`TENANT_LOCAL_CONFIG_JSON`. Supply them through server-only env `OIDC_CLIENT_SECRETS_JSON`: a JSON
object mapping canonical tenant slug → secret string. **Interpretation is gated by
`oidc.clientAuth`**, not by map presence alone:

| `oidc.clientAuth` | Secrets map entry for slug        | Outcome                                                                                             |
| ----------------- | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| `"public"`        | Absent                            | Valid; PKCE-only; do not send a client secret                                                       |
| `"public"`        | Present (nonempty)                | Valid; secret unused for initiation (still never emitted to browser/logs/fixtures)                  |
| `"confidential"`  | Nonempty string                   | Valid; secret available only to server-side auth work                                               |
| `"confidential"`  | Absent, empty, or whitespace-only | Unusable login config → HTTP 403 **extended forbidden** (“missing required server-only credential”) |

Parse the secrets map lazily with session config style so clean-checkout build/typecheck needs no
secrets. Never log secret values; never emit them in redirects, HTML, diagnostics, or fixtures. Local
Keycloak clients for this slice use `clientAuth: "public"` unless a scenario explicitly sets
`"confidential"` and supplies a synthetic map entry.

**Rationale**: Mirrors `SESSION_SIGNING_SECRET` discipline (FR-002, constitution III). Explicit
`clientAuth` makes the configuration-feature defect “missing required server-only credential”
implementable: confidential without a usable secret fails closed; public without a secret succeeds.
Discovery must not decide registration mode.

**Alternatives considered**: Absent map entry alone means public (ambiguous vs missing required
secret—rejected by review); per-tenant env var name embedded in config (`clientSecretEnv`)—more
indirection for the same security property; secret inside tenant JSON—easy to commit/leak; shared
global client secret—breaks tenant isolation tests; remove the missing-credential acceptance case—
weaker than naming the mode.

**Evidence**: FR-002; `features/tenant-oidc-configuration.feature` (server-only credential + missing
required credential); `packages/frontend/.env.example` session secret pattern; constitution
credentials rule.

## 3. Entry decision: reuse vs create (unauthenticated → initiate)

**Decision**: After `setupSession` returns ready, distinguish `outcome` for lifecycle/cookie mapping,
then:

- `"reuse"` or `"create"` **without authenticated identity** — for Proxy-matched **document**
  navigations to `/`, **initiate OIDC** (subject to usable OIDC config, discovery, and transaction
  rules). **Do not** SSR Display Name / `(app)` landing. Anonymous matching sessions do not suppress
  login.
- Terminal `"403"` / `"500"` / `"503"` — unchanged; no login initiation.
- **Authenticated short-circuit (E7)**: when a later slice stores an **authenticated user id** on
  the session record (per `docs/session-state.md`), that field is the **sole** short-circuit to SSR
  landing without re-initiating. Until present, always initiate for ready outcomes. Out of scope to
  implement now.

Do not infer “sessionless” from cookie absence after setup: setup may create or reuse a tenant-bound
anonymous session. Creating or reusing that session must not suppress login (FR-005 clarification;
stakeholder product rule superseding earlier same-day “reuse continues landing”).

**Superseded prior decision**: “`reuse` → continue existing SSR landing; do not initiate OIDC.” That
is no longer valid.

**Rationale**: Product rule: a user must never reach the tenant application landing page without
logging in. Spec FR-005/SC-002 require both unauthenticated ready outcomes to initiate (or fail).
The merged session module still exposes `reuse`/`create` for cookie rules.

**Alternatives considered**: Treat any session cookie as authenticated (wrong—records have no user
id); require session setup to return “sessionless” (conflicts with merged behavior); initiate login
from the React tree (cannot set cookies + redirect cleanly on first paint); preserve anonymous
`reuse` landing after abandon-IdP (rejected by clarify/P3 product decision).

**Evidence**: `packages/frontend/src/lib/session/setup.ts` `SetupSessionResult`;
`packages/frontend/src/proxy.ts`; spec Clarifications 2026-09-16 (P3); FR-005; SC-002.

## 4. Initiation boundary and session cookie rules (E1)

**Decision**: Perform initiation in `src/proxy.ts` (or a dedicated module invoked only from Proxy)
immediately after a ready unauthenticated `"reuse"` or `"create"` outcome on a participating document
navigation.

**Successful document IdP `302` MUST**:

1. On **`create` only**: Set the new `pathable-session` cookie from setup’s `cookieValue` (same
   attributes as today’s ready path). On **`reuse`**: do not re-set `pathable-session` unless cookie
   attributes require refresh; the existing cookie remains.
2. Set a short-lived signed OIDC correlation cookie (see §6).
3. `Location` = broker authorization URL from `openid-client`.

**Never** `Set-Cookie` `pathable-session` on: OIDC config 403, `login-unavailable`, transaction
failure, or non-document `401`. Redis rows created by setup on a failed `create` path may
TTL-expire; optional best-effort delete is allowed. Never serve tenant application HTML on initiation
or failure responses in this slice.

Keep Redis I/O limited to session setup + one transaction write + discovery (cached).

**Rationale**: Issuing the create cookie on failure would make the next visit `reuse` and historically
could SSR landing—violating FR-007 and the never-land-without-login rule. Same first-request
cookie-before-body constraint as session research; Server Components cannot set cookies during render.

**Alternatives considered**: Attach cookie on every ready setup (unsafe on failure); Route Handler
`/auth/start` requiring an extra hop; middleware-only without session cookie on successful create
redirect (loses tenant-bound session continuity for callback later).

**Evidence**: Critique E1/X1; `specs/002-setup-session/research.md` §1; Next.js Proxy cookie /
`NextResponse` behavior; FR-007.

## 5. Library and authorization request shape

**Decision**: Add `openid-client` for issuer discovery (`discovery`) and authorization URL
construction with `code` response type, S256 PKCE, `state`, `nonce`, `redirect_uri`, and `client_id`
from the resolved tenant. **Pin a compatible released version** in the lockfile during implementation
and record the chosen major in `plan.md` Primary Dependencies (E10). When `oidc.connection` is
present, pass it as Keycloak **`kc_idp_hint`** for local Keycloak only (E5); document that other
brokers may use a different parameter later—do not silently assume identical mapping. Request
`openid` scope. Do not exchange the code in this slice. Cache discovered metadata in-process keyed by
issuer string for the worker lifetime; on discovery failure, fail closed without redirect.

**Discovery cache note (E3)**: After local Keycloak recreate/reprovision, restart the frontend worker
(or document a future cache TTL). Do not treat stale discovery as a production multi-broker problem
in this slice.

**Rationale**: `docs/authentication.md` already selects `openid-client` and forbids Better Auth /
Auth.js as session owners. Connection-as-IdP-hint matches broker-mediated tenancy for Keycloak.

**Alternatives considered**: Hand-rolled URL builder (easy to miss PKCE/discovery edge cases);
Auth.js (second session model); hard-coded Keycloak paths without discovery (fragile across versions);
hardcoding `kc_idp_hint` as a universal broker parameter (risks wrong-IdP selection later).

**Evidence**: `docs/authentication.md`; FR-006; openid-client documentation; critique E3/E5/E10.

## 6. Protected transaction storage and browser binding

**Decision**: Store each initiation attempt in Redis under
`{OIDC_TX_KEY_PREFIX}{state}` (default prefix `pre-ets:oidc-tx:`), isolated from session keys.

Transaction record (exact fields in [data-model.md](./data-model.md)):

- `tenantId`, `issuer`, `clientId`, `connection` (optional), `redirectUri`, `nonce`, `codeVerifier`,
  `sessionId`, `expiresAt`

TTL: default 600 seconds (`OIDC_TX_TTL_SECONDS`), absolute `EXAT` from the application clock. PKCE
verifier exists only in this server record. Issue HttpOnly host-only cookie `pathable-oidc` (signed
with `SESSION_SIGNING_SECRET` or a dedicated `OIDC_TX_SIGNING_SECRET` defaulting to the session
secret) carrying `{ state, tenantId, exp }` so callback (later) can correlate browser ↔ Redis without
trusting query alone. If the transaction cannot be written or the correlation cookie cannot be minted,
do not redirect to the provider and do not attach `pathable-session` on a `create` failure path.

**Rationale**: FR-006 requires server-side verifier and binding to browser, tenant, issuer, client,
connection, and approved return destination. Redis is already the frontend ephemeral store.

**Alternatives considered**: Encrypted cookie-only transaction (size/rotation hazard for verifier);
in-memory Map (lost on restart, multi-worker unsafe); storing verifier in the session record (mixes
auth attempt with anonymous session lifecycle).

**Evidence**: FR-006; `docs/session-state.md`; session store patterns in `lib/session/store.ts`.

## 7. Approved return destination

**Decision**: `redirect_uri` is always
`{request-scheme}://{validated-tenant-host}/auth/callback` derived from the trusted host binder /
static mode’s configured application host—never from query parameters. Host mode uses the request’s
canonical tenant host (`{slug}.localhost:port` or `{slug}.pathable.com`). Static mode uses the
developer’s configured application origin for bare localhost (document the exact origin in
quickstart). Reject initiation if the computed URI would use non-loopback `http:` outside
development.

**Rationale**: FR-004/006 forbid caller-selected return hosts; authentication strategy example uses
`/auth/callback` on the same host.

**Alternatives considered**: Open redirect allow-list from config (unnecessary complexity for one
callback path); backend-hosted callback (wrong ownership).

**Evidence**: `docs/authentication.md`; FR-004; FR-006.

## 8. Route categories (FR-013)

**Decision**: Map categories as follows—no new health endpoints.

| Category                      | Concrete mapping                                                                            | Login initiation?                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Application page navigation   | Document navigations to `/` without authenticated identity                                  | Yes when OIDC config valid (`reuse` or `create`)                                 |
| Authenticated landing (later) | `/` with authenticated user id on session                                                   | No initiation; SSR landing (out of scope)                                        |
| Static / framework assets     | Outside Proxy matcher (`_next/*`, etc.)                                                     | No                                                                               |
| Operational health            | None exist; do not invent for this slice                                                    | N/A                                                                              |
| Login initiation              | Occurs as redirect from `/`; no separate `/auth/login` required                             | N/A (must not recurse)                                                           |
| Authentication return         | `/auth/callback` stub in matcher pass-through                                               | No initiation; no code exchange                                                  |
| App-owned initiation failure  | `/login-unavailable` outside `(app)`                                                        | No initiation; works without session cookie (E11)                                |
| Non-navigation / RSC for `/`  | Same matcher; detect via Next RSC / `RSC` / `next-router-*` headers / non-document `Accept` | No HTML IdP redirect; `401` without application content; prove signal early (E4) |

**Rationale**: Spec and features README warn against inventing health routes solely for exclusion
lists. Matcher discipline already protects assets. Unauthenticated document `/` always initiates or
fails—never anonymous landing.

**Alternatives considered**: Broaden matcher to all pages prematurely; treat RSC as document
navigation (would break client navigations with HTML redirects); leave `/login-unavailable` under
`(app)` (would require session cookie / AppLayout gate).

**Evidence**: FR-013; `packages/frontend/src/proxy.ts` matcher; critique E4/E11.

## 9. Failure taxonomy, accessible UI, and diagnostics

**Decision**:

| Failure class                                    | HTTP / UX                     | Session cookie issued? | Notes                                                                                       |
| ------------------------------------------------ | ----------------------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| Unknown/invalid tenant                           | 403 `Access denied.`          | No                     | Existing host/tenant refusal                                                                |
| Missing/invalid required OIDC tenant config      | 403 **extended forbidden**    | No                     | “Login cannot start” + one next action + a11y; no secrets; **not** `login-unavailable` (P4) |
| Invalid OIDC secrets JSON shape (process config) | 500 generic                   | No                     | Lazy parse                                                                                  |
| Provider discovery / metadata unavailable        | App-owned `login-unavailable` | No                     | P5 PathAble composition; no auto loop                                                       |
| Transaction persistence / correlation failure    | Same `login-unavailable`      | No                     | No provider redirect                                                                        |
| Non-document request needing login               | `401`                         | No                     | No Location to IdP                                                                          |

**P4 vs P5**: Config refusal stays HTTP 403 with extended forbidden copy. Provider/tx (and similar)
service failures use `/login-unavailable`. Do not collapse config 403 into the login-unavailable
route or PathAble composition.

**P5 PathAble outcomes** (`login-unavailable`): explain that login cannot start; one understandable
keyboard-operable next action (e.g. retry later / contact support); expose no credentials or other
tenant’s details. Use PathAble components after reading installed
`agent-guidance/pathable-react/SKILL.md`. Extended forbidden 403 for OIDC config must meet the same
copy/a11y bar without requiring the login-unavailable page.

**E9 diagnostics**: emit minimal stderr/structured outcome class
(`reuse` / `redirect` / `403-config` / `login-unavailable` / `401-nondoc`) without verifiers, secrets,
or raw tokens.

**Rationale**: FR-007 distinguishes configuration refusal (403) from provider/transaction service
failures; FR-008 requires accessible recovery; E1 forbids cookie-on-failure.

**Alternatives considered**: Collapse all failures to 403 (loses diagnostics for operators); client-only
error toast (violates SSR-first and initiation timing); attach create cookie then show failure
(creates next-visit `reuse` hazard).

**Evidence**: FR-007; FR-008; constitution IV; critique E1/E9/P5.

## 10. Local Keycloak Compose

**Decision**: Add service `keycloak` to root `compose.yaml`:

- Image: `quay.io/keycloak/keycloak:26.7.4` (pinned; not `latest`)
- Command: `start-dev`
- Ports: `127.0.0.1:8080:8080`
- Env: `KC_BOOTSTRAP_ADMIN_USERNAME` / `KC_BOOTSTRAP_ADMIN_PASSWORD` from Compose env file or shell
  env—**not** committed real passwords; document placeholders
- Healthcheck suitable for `docker compose up -d --wait keycloak`
- Preserve existing `redis:8.2.9` unchanged

Issuer identity for browser and Node: `http://127.0.0.1:8080/realms/pre-ets` (prefer `127.0.0.1`
consistently to avoid localhost vs IPv6 mismatch). Manual documented realm/client/IdP-hint
provisioning is sufficient; optional import scripts may be added later without blocking the slice.
Update `docs/docker-compose.md` in the same implementation increment.

**CI Keycloak policy (E8)**: CI runs `@contract` / `@http` **without** live Keycloak browser
provider-arrival. `@browser` usable IdP arrival is **local** / `pnpm test:bdd:oidc` with Compose
Keycloak until CI gains a Keycloak service. Do not thrash workflow filters between “Redis+Keycloak in
CI” and “local-only” without an explicit change to this decision.

**Rationale**: FR-010/011; docker-compose strategy already sketched Keycloak; 26.7.4 is current stable
as of plan date; E8 removes CI ambiguity.

**Alternatives considered**: Mock IdP skipping browser login (forbidden by strategy); Authentik local
stack (heavier); unpinned `latest` (non-reproducible); require Keycloak in CI immediately (deferred
until `ci-bdd.yml` gains the service).

**Evidence**: FR-010; `docs/docker-compose.md`; Keycloak 26.7.4 release notes 2026-09-16; critique E8.

## 11. Strategy and contract synchronization

**Decision**: During implementation, update:

- `docs/docker-compose.md` — Redis + Keycloak current layout; restart frontend after Keycloak
  reprovision (stale discovery cache)
- `docs/authentication.md` — unauthenticated document `/` initiates for both `reuse` and `create`;
  slice ends at provider page; anonymous session ≠ landing eligibility
- `specs/001-tenant-resolution/contracts/tenant-context.md` — TenantConfig now includes required `oidc`
  for login-capable records (compatibility note / supersession for Display Name-only sufficiency)
- `specs/001-tenant-resolution/contracts/landing-page.md` — **all** unauthenticated Proxy-matched
  document navigations to `/` initiate OIDC (or fail); Display Name landing only after authenticated
  identity (apply exact Supersedes text from [plan.md](./plan.md) / [oidc-login-initiation.md](./contracts/oidc-login-initiation.md) in the same delivery slice as Proxy initiation—do not leave dual approved contracts)
- OIDC feature runner docs if `features/README.md` still claims OIDC is unwired
- OIDC Gherkin aligned: anonymous `reuse` re-initiates without landing; HTTP acceptance asserts no
  `Set-Cookie: pathable-session` on config 403 / `login-unavailable` / tx failure / non-doc `401` (E2)
- **Behavioral supersession inventory (same delivery slice as Proxy initiation)** — rewrite/retag so
  unauthenticated `/` outcomes become initiate-or-fail (no application / Display Name content);
  session setup/cookie/tenant-binding observables remain authoritative:
  - `features/session-continuity.feature` — replace “existing Springfield tenant page” with session
    established + IdP redirect (or fail closed); no application content
  - `features/session-recovery.feature` — same
  - `features/local-session-development.feature` — replace “existing Springfield tenant page” with
    session retained/created + IdP redirect (or fail closed); no application content
  - `features/tenant-landing-page.feature`, `features/local-host-tenant-resolution.feature`,
    `features/local-static-tenant-configuration.feature` — **retarget unauthenticated `/` to
    initiate-or-fail in this delivery slice; authenticated Display Name landing remains a later
    slice**
- After that retarget, keep `pnpm test:bdd:session` green on the OIDC delivery PR (E5)

**Rationale**: Constitution governance requires explicit conflict resolution when behavior changes.
Same delivery-slice pattern as 002 Refusal supersede. Critique E1/X1 requires naming session and 001
landing Gherkin—not only the 001 landing-page contract.

**Alternatives considered**: Leave strategy docs stale until a docs-only PR (causes false evidence);
update 001 landing-page during planning only (user instructed: require in Supersedes/delivery note,
edit in implementation slice); defer session Gherkin retarget past initiation merge (dual approved
surfaces—rejected).

**Evidence**: constitution Governance; 001/002 plan sync patterns; critique E1/X1/E2/E5.
