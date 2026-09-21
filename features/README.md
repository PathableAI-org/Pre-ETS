# Acceptance scenarios

Active feature: [005-tenant-config-fs](../specs/005-tenant-config-fs/spec.md).

## Filesystem tenant configuration persistence scenarios

Source: [filesystem tenant configuration specification](../specs/005-tenant-config-fs/spec.md).
Consumer type: **Human end user of UI**, detected from `next`, `react`, and `react-dom` in
`packages/frontend/package.json`. Operators and local developers are human users of the landing
page and documented setup; they are not reframed as API or CLI consumers.

| File                                                                                         | Purpose                                                                                                   | Scenarios | Outlines | Example rows | Expanded cases |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------- | -------- | ------------ | -------------- |
| [filesystem-host-tenant-configuration.feature](filesystem-host-tenant-configuration.feature) | Host-bound reads from `{alias}.json`, unknown vs configuration failure, isolation, and path safety.       | 3         | 5        | 18           | 21             |
| [filesystem-static-tenant-name.feature](filesystem-static-tenant-name.feature)               | Static mode by tenant name only, invalid names/files, and production bypass rejection.                    | 3         | 3        | 9            | 12             |
| [filesystem-tenant-source-cutover.feature](filesystem-tenant-source-cutover.feature)         | Cutover from inline JSON documents, filesystem authority when both exist, and consumer-contract preserve. | 5         | 0        | 0            | 5              |
| **Total**                                                                                    |                                                                                                           | **11**    | **8**    | **27**       | **38**         |

Expanded cases count each ordinary Scenario once and each Examples data row once; outline declarations are not
counted again. Each scenario/row starts from independent setup, including restart and overlapping-request cases.

### Filesystem-config traceability and verification boundaries

Within files tagged `@tenant-config-fs`, `@FR-nnn`, `@SC-nnn`, and `@USn` refer exclusively to specification
`005-tenant-config-fs`, not earlier tenant-resolution, session, OIDC, or idle-timeout specifications.
All 13 functional requirements and seven success criteria have scenario references. Tags express intended
coverage, not proof of runtime behavior.

- `@browser`: Navigate the running landing page and assert meaningful visible Display Name outcomes.
- `@http`: Verify refusal (HTTP 403) versus configuration failure (HTTP 500) without redirects that hide the outcome.
- `@contract`: Verify single-file reads, path confinement, source authority over inline documents, and static-versus-host context labeling without public diagnostic endpoints.
- `@production`: Production must ignore static-name / static-mode bypass settings.

Concrete environment variable names for this feature are `TENANT_CONFIG_DIR`, `TENANT_STATIC_ALIAS`, and
`TENANT_RESOLUTION` (see `specs/005-tenant-config-fs/`). Scenarios may still describe roles; step wiring should
use those names. Exact configuration-error copy remains a planning decision where the specification only
requires an understandable local error.

### Filesystem-config fixture meanings and assumptions

- Known-tenant tables create isolated synthetic `{alias}.json` files whose configuration includes at least a
  Display Name suitable for landing-page verification. Fixtures remain synthetic and free of credentials.
- A visit to a host means the landing page `/` at that authority against the local test server, not production DNS.
- Missing file for a host-bound alias is unknown-tenant HTTP 403. Malformed, mismatched, unreadable, or
  invalid-content files are configuration failures (HTTP 500) and must not expose another tenant’s Display Name.
- “Former inline multi-tenant / full static JSON documents” are the superseded environment documents from feature
  001; when both are present with the filesystem source configured, filesystem content is authoritative.
- Changing a file and restarting is setup within that scenario; live hot-reload is not required.
- Path-escape aliases are rejected; only `{alias}.json` directly under the configured directory is eligible.
- No new business-rule assumptions beyond the specification: alias equals existing slug identity; static mode
  remains development-only; consumers keep the existing tenant/configuration accessors.

### Cross-feature impact (filesystem source / 001 inline JSON)

Feature 005 replaces the configuration **source**. Superseded 001 scenarios for known-host
Display Name, overlapping visits, source substitution, static supply/restart/invalid-record
flows, local host happy-path display, and production static bypass were removed from the three
tenant-resolution feature files above. Remaining 001 scenarios cover host refusal, mode safety,
accessibility, and abstract configuration-failure contracts. Delivery still must retarget
harness wiring from inline JSON env documents to the filesystem directory (and static tenant
name) and bind `@tenant-config-fs` steps.

### Filesystem-config artifact validation and execution status

These three files are acceptance artifacts for filesystem-source delivery.
`tests/bdd/steps/tenant-fs.steps.ts` binds `@tenant-config-fs` steps; the three
`features/filesystem-*.feature` files are included in the default tenant suite
(`cucumber.mjs`). Structural checks cover feature/background presence, unique scenario names, Given/When/Then ordering, outline
columns, and the counts above. Default `pnpm test:bdd` discovers and runs them with the
tenant-resolution partition.

The complete inventory with these files is **15 feature files** and **273 expanded cases**: 32 tenant-resolution,
42 session, 68 OIDC, 93 idle-timeout, and 38 filesystem-config.

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
reports 32 expanded cases (20 `@production` from landing-page plus host/static
remainders after filesystem-config supersession).

## Feature index

| File                                                                                   | Purpose                                                                                             | Scenarios | Outlines | Example rows | Expanded cases |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------- | -------- | ------------ | -------------- |
| [tenant-landing-page.feature](tenant-landing-page.feature)                             | Host refusal, isolation contracts, Display Name validation (known-host display superseded by 005).  | 2         | 5        | 18           | 20             |
| [local-static-tenant-configuration.feature](local-static-tenant-configuration.feature) | Local static Display Name accessibility and keyboard journey (supply/load flows superseded by 005). | 1         | 1        | 3            | 4              |
| [local-host-tenant-resolution.feature](local-host-tenant-resolution.feature)           | Host-mode safety, static-fallback refusal, invalid mode (happy-path display superseded by 005).     | 3         | 1        | 5            | 8              |
| **Total**                                                                              |                                                                                                     | **6**     | **7**    | **26**       | **32**         |

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
before implementation; this is not runtime application verification. The tenant suite's 32-case count
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
| [tenant-oidc-login.feature](tenant-oidc-login.feature)                 | Tenant login arrival, isolation, session decisions, caller input, and request exclusions. | 6         | 7        | 27           | 33             |
| [tenant-oidc-configuration.feature](tenant-oidc-configuration.feature) | Connection settings, secret boundaries, validation, reload, and accessible failures.      | 4         | 5        | 19           | 23             |
| [local-oidc-development.feature](local-oidc-development.feature)       | Local Keycloak setup, issuer reachability, static mode, restrictions, and recovery.       | 6         | 3        | 6            | 12             |
| **Total**                                                              |                                                                                           | **16**    | **15**   | **52**       | **68**         |

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

The installed Cucumber Gherkin parser successfully parsed and expanded all **68 cases**. Unique scenario names,
outline substitution, and the FR/SC tag inventory were checked. This validates acceptance artifacts only.
OIDC features and `tests/bdd/steps/oidc.steps.ts` are wired when `CUCUMBER_OIDC=1` (or via
`pnpm test:bdd:oidc` / `pnpm test:bdd:dry`, which also sets that flag). Step definitions remain pending
stubs until implementation; dry-run checks discovery and bindings, not runtime behavior. Default
`pnpm test:bdd` still omits OIDC so unimplemented stubs do not fail unlabeled PR CI.
The nine-file inventory preceding feature 004 historically contained **162 expanded cases**: 52 tenant
(since reduced to 32 by 005 supersession), 42 session, and 68 OIDC.
Earlier tenant/session execution notes above describe their own suites and are not OIDC implementation evidence.

## Idle-session timeout scenarios

Source: [idle-session timeout specification](../specs/004-idle-session-timeout/spec.md).
Consumer type: **Human end user of UI**, detected from `next`, `react`, and `react-dom` in
`packages/frontend/package.json`. Authorized tenant representatives use the existing trusted configuration
management process; these scenarios do not introduce an administration screen or new administrator role.

| File                                                                     | Purpose                                                                                                                     | Scenarios | Outlines | Example rows | Expanded cases |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | --------- | -------- | ------------ | -------------- |
| [idle-session-expiration.feature](idle-session-expiration.feature)       | Authoritative deadlines, qualifying activity, shared tabs, independent sessions, lifetime limits, and failed authorization. | 5         | 7        | 27           | 32             |
| [idle-session-recovery.feature](idle-session-recovery.feature)           | Running-app revalidation modal, multi-tab recovery consistency, temporary-data clearing, tenant login, and resume paths.    | 6         | 3        | 11           | 17             |
| [tenant-idle-timeout-policy.feature](tenant-idle-timeout-policy.feature) | Default and all permitted durations, invalid choices, configuration authority, persistence, and new-session-only changes.   | 4         | 4        | 40           | 44             |
| **Total**                                                                |                                                                                                                             | **15**    | **14**   | **78**       | **93**         |

### Idle-timeout traceability and execution layers

Within `@idle-session-timeout` files, requirement and success-criterion tags refer only to feature **004**.
`@US1`, `@US2`, and `@US3` map to the corresponding specification stories. All 23 source acceptance scenarios
are represented, expanded into boundary, failure, and alternative-flow cases.

| Requirements / outcomes                    | Coverage and remaining evidence                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001–002; SC-001 permitted-value portion | Policy scenarios exercise all 26 whole-minute choices, the default, rejection, and invalid stored configuration.                                                                                                                                                                                                  |
| FR-003; SC-004                             | Policy scenarios cover authorized management, tenant isolation, persistence, and shorter/longer changes for new sessions only. Expiration and recovery cover isolated policy and login-again sessions.                                                                                                            |
| FR-004–007; SC-002, SC-004                 | Expiration scenarios cover deadlines, browser independence, qualifying versus passive activity, shared tabs, separate sessions, late/concurrent reports, absolute lifetime, and anonymous continuity.                                                                                                             |
| FR-008; SC-003 cause accuracy              | Expiration and recovery scenarios distinguish missing, evicted, unavailable, and otherwise expired access from established inactivity.                                                                                                                                                                            |
| FR-009–010; SC-003                         | Recovery scenarios cover running-app revalidation that confirms inactivity with the server, multi-tab protected-content clearing, meaningful modal semantics, keyboard/focus operation, assistive technology, tenant authentication, existing provider sign-in, failure, clearing, and preserved durable records. |
| FR-011; SC-001 approval/rationale portion  | **Policy/document review required:** identify the approver, justify the default and full supported range against risk/client obligations, and check regulatory currency. Scenario tags cannot establish legal sufficiency or approval.                                                                            |
| FR-012; SC-005                             | **Validation planning remains incomplete:** agree the protected-operation inventory, representative workflows, timing precision, interruption/data-loss thresholds, evidence retention, and evidence owner. These scenarios cover known behavior but do not supply the unresolved workflow-impact thresholds.     |

- `@browser` requires the composed experience: semantic modal name/description, real focus movement, keyboard
  activation of the named button, removal of protected content, and successful or failed recovery outcomes.
  Matching text alone does not prove accessibility or successful login.
- `@contract` verifies authoritative time, access rejection, isolation, policy persistence, and temporary-state
  clearing through the appropriate owned boundaries. Browser behavior cannot establish server enforcement.
  Mixed browser/contract cases need complementary evidence; do not expose a diagnostic UI or public test endpoint.
- Policy approval and workflow-impact evidence remain review obligations, not invented automated pass conditions.

### Idle-timeout fixture meanings and assumptions

- Every scenario and Examples row has isolated synthetic tenants, users, configuration, time, sessions, and data.
  `Given` steps describe setup within that case, never work left over from another case. The example note titles
  are synthetic temporary and durable records; they do not select a new domain workflow or prescribe a schema.
- Times are on one synthetic date, measured by authoritative time. Browser clock offsets are separate inputs.
  Second-level examples illustrate ordering, not an allowed enforcement grace period or a selected timing tolerance.
  Unless explicitly overridden, the absolute deadline is later than the idle deadline. No absolute-lifetime policy
  is introduced by the example values.
- A protected-work attempt is an authorization-boundary observation. It does not implicitly supply preceding
  qualifying activity. The selected rules count deliberate keyboard/pointer/touch/scroll input, not the protected
  request itself. Contract cases must be able to attempt expired access while the browser is closed or offline.
  “Accepted for evaluation” of a late activity report does not mean it qualifies to renew the session.
- Qualifying activity in a shared session applies across its tabs. A separate browser session or device has its
  own inactivity period; a per-device configurable policy is not introduced. Expired-access clearing is scoped to
  the affected session, and must not delete durable business records.
- Invalid choices describe semantic inputs rather than a chosen configuration encoding: `5.5 minutes` is a
  fractional duration, `disable expiration` requests disablement, and `malformed text` is an unusable explicit
  value. An omitted choice is distinct from invalid stored configuration. Exact schema and error copy/status
  belong to planning and the existing configuration boundary.
- “Establishes” or “proposes” a tenant duration means the trusted management process from assumption D-002;
  it does not imply a new product form, endpoint, or role. Persistence is checked across the session boundary.
- Authenticated session write via the OIDC callback path and Redis `userId` already exists; idle scenarios extend
  that path and do not absorb a general authentication redesign. Planning must still enumerate protected operations
  and independent credentials (D-003); one placeholder operation cannot prove revocation of every credential.
- The user selected existing provider sign-in as an allowed way to complete new application authentication.
  It does not silently revive the expired session. Recovery begins with the user's “Log in again” action.
- A suspended application cannot guarantee an exact repaint instant. On resumption, protected content must be
  removed before further interaction; expired access remains authoritatively denied throughout. While the
  application is running, client-driven revalidation must confirm inactivity with the server and surface recovery
  without waiting for a later full navigation; shared-session tabs must promptly clear protected content together.
  Operational idle-expiry metrics and alerting are out of scope for this feature.
- No new business-policy choices were needed. The spec's D-001–D-006 dependencies remain explicit, particularly
  SC-005's unresolved workflow-impact thresholds. No warning countdown, autosave, broader logout, or new
  authentication implementation is added by these acceptance artifacts.

### Idle-timeout artifact validation and execution status

The installed Cucumber Gherkin parser parsed and expanded **93 cases** across the three files. Scenario names,
outline substitutions, structure, and requirement tags were checked.

`cucumber.mjs` loads idle features and `tests/bdd/steps/idle.steps.ts` when `CUCUMBER_IDLE=1`
(or via `pnpm test:bdd:idle` / `pnpm test:bdd:dry`). **`@contract`** idle scenarios run via an
in-process harness (`tests/bdd/support/idle.ts`) and are green under `pnpm test:bdd:idle:contract`.
Pure **`@browser`** recovery scenarios run under `pnpm test:bdd:idle:browser` (Playwright against
Next + Redis + mock IdP via `tests/bdd/support/idle-browser.ts`). Dual-tagged scenarios stay on the
contract harness. Release gates **D-001 / D-005 / D-006** are outside Speckit automation and are not
claimed here.

Default `pnpm test:bdd` still omits idle; labeled `ci:bdd` runs the idle contract and browser partitions.

The complete inventory after feature 004 was **12 files / 255 expanded cases** (52 tenant, 42 session, 68 OIDC, 93 idle). Feature 005 adds three filesystem-config files (38 cases) and supersedes 20 tenant-resolution cases (tenant suite is now 32); see the active-feature section above for the current combined total.
