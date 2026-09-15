# Tenant-resolution acceptance scenarios

Source: [active specification](../specs/001-tenant-resolution/spec.md), including the Display Name clarification.
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
`tests/bdd/steps/session.steps.ts` and are loaded by `cucumber.mjs`. Existing tenant bindings remain intact.
All 94 expanded cases match exactly one definition per step. An isolated Cucumber run of the session stubs
produced 42 failing scenarios, as expected before implementation; this is not runtime application verification.
The tenant suite's 52-case count above applies only to the three tenant-resolution files.
No runner exclusions or placeholder passing steps have been added.

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
