# Acceptance scenarios

Active feature: [003-tenant-oidc-login](../specs/003-tenant-oidc-login/spec.md).

## Tenant-resolution acceptance scenarios

Source: [tenant-resolution specification](../specs/001-tenant-resolution/spec.md), including the Display Name clarification.
Supporting design: [plan](../specs/001-tenant-resolution/plan.md) and
[validation guide](../specs/001-tenant-resolution/quickstart.md).

Consumer type: **Human end user of UI**, detected from the frontend's Next, React, and React DOM dependencies.
Developers are human users of the local landing page; they are not reframed as API clients.

These Gherkin files are the executable acceptance suite for tenant resolution.
Cucumber bindings live in `tests/bdd/`. Pull request CI requires
`pnpm test:bdd:dry` (discovery and step binding). Full `pnpm test:bdd` is
acceptance evidence on `main`, or on a PR labeled `ci:bdd`. Dry discovery still
reports 52 expanded cases (27 `@production`, 25 remaining).

## Feature index

| File                                                                                   | Purpose                                                                                              | Scenarios | Outlines | Example rows | Expanded cases |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------- | -------- | ------------ | -------------- |
| [tenant-landing-page.feature](tenant-landing-page.feature)                             | Known-tenant display, host refusal, isolation, and configuration contracts.                          | 4         | 6        | 20           | 24             |
| [local-static-tenant-configuration.feature](local-static-tenant-configuration.feature) | Supplied local configuration, changed names, invalid data, and accessible text.                      | 4         | 2        | 10           | 14             |
| [local-host-tenant-resolution.feature](local-host-tenant-resolution.feature)           | Explicit local host resolution, safe defaults, production bypass rejection, and local accessibility. | 3         | 3        | 11           | 14             |
| **Total**                                                                              |                                                                                                      | **11**    | **11**   | **41**       | **52**         |

Expanded cases count each ordinary Scenario once and each Examples data row once; outline declarations are not
counted again. Each scenario/row starts from independent setup, including restart and overlapping-request cases.

## Traceability and execution layers

`@FR-nnn` and `@SC-nnn` refer to the source specification; `@US1` through `@US3` identify its user stories.
All 16 functional requirements and seven success criteria have scenario references. Tags express intended coverage,
not proof that every architectural constraint can be verified through the UI.

- `@browser`: Navigate the running landing page and assert meaningful visible/accessibility/keyboard outcomes.
- `@http`: Verify the actual response to a visitor's request, including Access denied / no redirect.
  Prefer HTTP 403; a 200 `forbidden.tsx` document is acceptable if Next.js streams the interrupt.
  These remain human-facing workflows even when a test client supplies the request's Host.
- `@contract`: Verify source substitution, host binding, and injected failures at the lower
  layer. Do not add diagnostic UI, public test endpoints, or browser inspection of framework internals.

Mixed outcomes may require complementary layers. For example, a local visit's visible name is browser-verifiable,
while its canonical identity is a lower-layer assertion. Preserve the intent instead of forcing all assertions into
Playwright. The adopted runner is Cucumber (`@cucumber/cucumber`), with the Playwright library for browser/HTTP
steps and pure modules for contract steps. Support code lives in root `tests/bdd/`; the feature files remain
Cucumber inputs. Vitest tests supplement boundary coverage. `cucumber.mjs` and the root `test:bdd`
scripts define ESM imports, per-scenario state, and production-first partitions.

FR-006 ownership and exclusion of durable storage, and FR-011 synthetic-data/documentation restrictions, also require
code/document review. The source contract uses only Display Name as configuration and keeps slug as identity; no
extra configuration field is introduced to make a test easier. Do not claim scenario tags prove ownership or absence
of credentials throughout the repository.

## Fixture and step meanings

- Known-tenant tables create isolated synthetic records whose only configuration field is Display Name; `slug` is
  identity metadata. The common tables are replaced explicitly when a scenario gives both tenants the same name.
- A visit to a host means the landing page `/` at that authority; tests connect to the local test server rather than
  contacting production DNS. Start the test process on the port named by each case. Port 3100 is an independent case.
- An authoritative host is the trusted input described by the context contract. Competing forwarded/tenant headers
  and query values must not alter it. Lower-layer binding tests also cover path values without inventing another page.
- Missing/malformed host cases apply to requests reaching the application boundary. A browser may not be able to
  create them; use the appropriate HTTP/boundary harness. HTTP-server rejection before application entry is separate.
- A missing Display Name omits the field; numeric means the number 42, not the string "42"; empty means `""`;
  whitespace-only means `"   "`. The invalid local identity case supplies contradictory identities, not merely a
  Display Name that differs from the slug. Source tests can inject a mismatched record without a production backdoor.
- Changing a name and restarting is setup within that scenario; it never relies on a previous scenario's server.
- A configuration failure is distinct from an unknown tenant and must not expose another tenant's data. The spec
  does not fix an exact configuration-error status/copy; the plan supplies those implementation decisions.
- Readable text and keyboard assertions concern the composed page and actual focus behavior. Literal markup-like
  names must not become HTML or executable content. Distinct-name fixtures support negative assertions; the
  same-name case instead checks distinct slug identities at the contract layer.

## Assumptions and selected mode policy

No new business-rule assumptions were needed. Scenarios retain the specification's established defaults: slug is
identity, local tenant hosts use `.localhost`, missing local data fails visibly, and restart is an acceptable way to
apply static changes. They do not introduce billing, authentication, sessions, durable stores, or a tenant editor.

**FR-014 resolution**: Unsupported mode values preserve host association and emit a safe `invalid-mode`
diagnostic with accepted-mode guidance. They do not select local static data or produce a mode-only 500.
Missing/invalid selected static records retain their configuration-error behavior.

The plan's acceptance evidence matrix distinguishes pure contract results, response-adapter checks, and live-page
assertions. Repeated consumers, source substitution, and injected source failures are contract checks; they make no
rendering claim. Mixed equal-name and invalid-name scenarios share fixtures but retain separate contract and live
results. `@production` partitions run before all remaining scenarios; rebuilding is required before another full suite.

## Validation of these artifacts

Reviewed against the source stories, requirements, success criteria, and edge cases. Structural checks validate
feature/background presence, unique names, Given/When/Then ordering, outline columns and substitution names, tags,
and the counts above. `pnpm test:bdd:dry` proves discovery of every expanded case and is the
pull-request CI gate. `pnpm test:bdd` executes both partitions and is the acceptance evidence
for this suite on `main` or on a PR labeled `ci:bdd`.

## Session setup scenarios

Source: [session setup specification](../specs/002-setup-session/spec.md).
Consumer type: **Human end user of UI**, detected from the frontend's Next.js and React dependencies.
Local setup uses the developer as a human operating the development environment.

| File                                                                   | Purpose                                                                                              |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [session-continuity.feature](session-continuity.feature)               | First visit, repeat visits, restart continuity, cookie protections, expiry, and resource exclusions. |
| [session-recovery.feature](session-recovery.feature)                   | Unusable references, tenant isolation, storage failures, and recovery.                               |
| [local-session-development.feature](local-session-development.feature) | Compose setup, local tenant modes, service restart, and production restrictions.                     |

These files define acceptance behavior before session implementation. Their 76 throwing stubs live in
`tests/bdd/steps/session.steps.ts`. Default `cucumber.mjs` / `pnpm test:bdd` load only the tenant suite so
unimplemented session stubs do not fail the default runner or unlabeled PR CI. Set `CUCUMBER_SESSION=1`
(or run `pnpm test:bdd:session` / `pnpm test:bdd:dry`) to include session features and stubs. Existing
tenant bindings remain intact. Dry discovery with `CUCUMBER_SESSION=1` matches all 94 expanded cases to
exactly one definition per step. An isolated session run produced 42 failing scenarios, as expected
before implementation; this is not runtime application verification. The tenant suite's 52-case count
above applies only to the three tenant-resolution files.

### Session traceability and verification

Within files tagged `@session-setup`, `@FR-nnn`, `@SC-nnn`, and `@USn` refer exclusively to specification
`002-setup-session`, not the tenant-resolution specification. Select `@session-setup` when querying its tags.

- `@http`: Visitor request/response outcomes and cookies.
- `@contract`: Request ordering, state ownership at runtime, session reuse, expiry, and injected store failures.
  Use lower-layer observations; do not expose diagnostic UI or public test endpoints.
- `@local-services`: Execute documented local setup against real Compose services.
- `@production`: Requires production-mode tenant behavior.

FR-001–008 and FR-011 have request/contract scenarios; FR-009–010 have local-service scenarios.
FR-012's single-session flow has a contract scenario, while simplicity and readability require plan/code review.
Dependency declaration, absence of committed credentials, frontend-only store ownership, absence of unrelated
Compose services, and absence of domain data in session storage also require repository review. Scenario tags
alone do not prove these architectural constraints. SC-001–005 are represented across the three files.

### Session fixture meanings and assumptions

- Each scenario gets independent synthetic tenants, cookies, time, and isolated session storage. Production-style
  URLs target the local test frontend with the appropriate trusted host; they do not contact production DNS.
- A valid session precondition supplies a correctly signed, unexpired cookie and matching stored record.
  Unknown ids use a valid signed reference to a nonexistent record, distinct from a tampered cookie.
- Cookie application claims exclude standard signing metadata; no user identity or session payload is allowed.
- The lifetime cases inherit the specification's configurable fixed 24-hour default and no sliding renewal.
- Cookie lookup precedes tenant resolution; tenant validation still precedes accepting or persisting the binding.
- A controlled service failure means an unsuccessful response without normal tenant content. The specification
  does not choose an exact status code or error message; these scenarios do not invent one.
- Resource cases use existing static/framework resource URLs discovered during implementation, not invented routes.
- Independent simultaneous cookie-less requests may create separate sessions. Cross-tab coordination and
  uniqueness claims based only on random samples are not acceptance requirements. Review secure id generation.
- Local HTTP cookies retain host-only and HttpOnly restrictions; production cookies additionally require Secure.
- No additional product decisions were introduced. The expiry default remains a specification assumption for review.

Session suite totals: **3 files, 11 ordinary scenarios, 9 outlines, 31 example rows, 42 expanded cases**.
The combined tenant and session inventory is 94 expanded cases. Session files were syntax-validated using the
installed Cucumber Gherkin parser; step execution and runtime behavior remain unverified.

## Tenant OIDC login scenarios

Source: [tenant OIDC login specification](../specs/003-tenant-oidc-login/spec.md).
Consumer type: **Human end user of UI**, detected from `next`, `react`, and `react-dom` in
`packages/frontend/package.json`. Local provisioning uses a developer operating the environment;
it does not make the product a CLI or API consumer.

| File                                                                   | Purpose                                                                                   | Scenarios | Outlines | Example rows | Expanded cases |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------- | -------- | ------------ | -------------- |
| [tenant-oidc-login.feature](tenant-oidc-login.feature)                 | Tenant login arrival, isolation, session decisions, caller input, and request exclusions. | 6         | 6        | 25           | 31             |
| [tenant-oidc-configuration.feature](tenant-oidc-configuration.feature) | Connection settings, secret boundaries, validation, reload, and accessible failures.      | 4         | 5        | 19           | 23             |
| [local-oidc-development.feature](local-oidc-development.feature)       | Local Keycloak setup, issuer reachability, static mode, restrictions, and recovery.       | 6         | 3        | 6            | 12             |
| **Total**                                                              |                                                                                           | **16**    | **14**   | **50**       | **66**         |

### OIDC traceability and verification boundaries

Within `@tenant-oidc-login` files, `@FR-nnn`, `@SC-nnn`, and `@USn` refer to **003** only.
All 13 functional requirements and five success criteria have scenario references. Tags identify intended
coverage, not proof of runtime behavior or architectural compliance.

- `@browser` checks real navigation to usable provider login controls, accessible error structure, or keyboard
  recovery. Provider arrival must not be asserted solely through tenant strings in application markup.
- `@http` checks redirects, refusals, and absence of application content or browser-visible secrets.
- `@contract` checks trusted configuration, session decisions, tenant/return binding, protected authorization transactions, safe diagnostics, and
  request classification without public diagnostic routes or assumptions about Redis record internals.
- `@local-services` exercises documented setup and recovery using real local Keycloak and the existing session service.
- `@production` checks production restrictions; isolated fixtures must keep the session service available so a
  storage outage does not mask host refusal.

Repository review must additionally verify server-only credential supply, absence of committed credentials,
frontend ownership, pinned and loopback-only Compose services, preservation of existing services, and complete
local instructions. FR-011 documentation review includes upgrading Display Name-only examples, startup/readiness,
synthetic tenant/client/connection provisioning, local credential supply, registered return destinations,
reload/restart, and configuration/provider recovery. No scenario tag alone proves those constraints.

### OIDC fixture meanings and unresolved planning choices

- Each scenario and example row starts independently, with isolated tenant configuration, provider fixtures,
  browser contexts, and session results. Prior failures, changes, and reloads in Given steps are setup within
  that scenario, never dependencies on another scenario.
- `identity.example` and the production-style tenant addresses are synthetic fixtures resolved by the test
  harness; do not contact production DNS. Local service cases use real local hosts. Client and connection
  names are fixture values, not a prescribed configuration schema or query parameter naming convention.
- Usable provider arrival means an identifiable, operable login experience for the intended connection.
  These cases stop before submitting credentials or completing a callback. No authenticated session,
  callback completion, token exchange, logout, or backend authorization is claimed.
- Session validity and rejection remain authoritative in feature 002. The recovery cases use its ready/create outcome, and refusal cases use its terminal outcome; there is no
  sessionless result variant. The entry decision distinguishes a reusable session presented with the request
  from a new or replacement session created during setup for lifecycle and cookie rules, but **neither
  unauthenticated ready outcome** (`reuse` or `create`) suppresses login initiation or grants Display Name
  landing. A tenant-bound anonymous session does not establish authenticated user identity. Unidentified
  tenants remain forbidden. Re-initiating login on later unauthenticated document visits until callback
  exists is expected; that must not become an automatic Proxy↔IdP redirect loop.
- Caller override attempts may be rejected or ignored; the specification fixes the security outcome but not
  which response to use. Neither path may select caller-supplied destinations or grant application access.
- Missing or unusable required tenant login configuration returns HTTP 403 with **extended forbidden**
  copy: explains that login cannot start, offers a clear next action, remains accessible, and exposes no
  secrets or cross-tenant details. That outcome is **not** the `login-unavailable` route; provider metadata
  and transaction (and similar) service failures use `login-unavailable`. Initiation failure responses for
  config 403, `login-unavailable`, transaction failure, and non-document 401 must not include
  `Set-Cookie` for `pathable-session`. Planned OIDC fields include `issuer`, `clientId`, required
  `clientAuth` (`public` \| `confidential`), and optional `connection`; secrets are supplied only via
  `OIDC_CLIENT_SECRETS_JSON` and are required when `clientAuth` is `confidential`. Defect
  “missing required server-only credential” means confidential mode without a usable secret—not a
  public client with an absent map entry. If an interactive recovery action is offered, its keyboard
  behavior must satisfy the scenario; guidance-only errors need no invented button.
- Request-category examples require planning to map concrete existing resource, health, initiation, and return
  routes and non-navigation behavior. They do not authorize adding health endpoints or implementing callbacks.
  Exact response codes for non-navigation requests remain a planning decision.
- Required connection selection depends on the provider registration. App-detectable defects fail before
  redirect; failures after the browser leaves the app may appear as a browser/provider error instead.
- HTTP provider destinations are permitted only in explicit local development. The local issuer URL, pinned
  Keycloak version, provisioning commands, transaction storage/encoding, and return route paths remain planning choices.
  Authorization-code initiation with PKCE and tenant-bound state/nonce is required by FR-006; it is not optional planning scope.

### Cross-feature impact (OIDC / 001 session landing)

When 003 Proxy initiation ships (**same delivery slice**), retarget inventoried unauthenticated `/`
scenarios in session + 001 landing/local features (`session-continuity.feature`,
`session-recovery.feature`, `local-session-development.feature`, `tenant-landing-page.feature`,
`local-host-tenant-resolution.feature`, `local-static-tenant-configuration.feature`) to
initiate-or-fail (see [`specs/003-tenant-oidc-login/plan.md`](../specs/003-tenant-oidc-login/plan.md)
Behavioral supersession inventory). Do not mass-edit those files in the planning/BDD-authoring pass.
OIDC delivery PR MUST keep `pnpm test:bdd:session` green after retarget.

See [the traceability report](TRACEABILITY.md) for requirement-level coverage and separate repository-review obligations.

### OIDC artifact validation and execution status

The installed Cucumber Gherkin parser successfully parsed and expanded all **66 cases**. Unique scenario names,
outline substitution, and the FR/SC tag inventory were checked. This validates acceptance artifacts only.
The existing Cucumber configuration explicitly lists the tenant and session files; these new OIDC files are
**not yet wired into that runner and have no generated step bindings**. The BDD scaffold step should add
bindings and discovery before implementation. Existing dry-run commands do not validate OIDC behavior.
The nine-file repository inventory now contains **160 expanded cases**: 52 tenant, 42 session, and 66 OIDC.
Earlier tenant/session execution notes above describe their own suites and are not OIDC implementation evidence.
