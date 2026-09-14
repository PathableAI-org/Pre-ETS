# Tenant-resolution acceptance scenarios

Source: [active specification](../specs/001-tenant-resolution/spec.md), including the Display Name clarification.
Supporting design: [plan](../specs/001-tenant-resolution/plan.md) and
[validation guide](../specs/001-tenant-resolution/quickstart.md).

Consumer type: **Human end user of UI**, detected from the frontend's Next, React, and React DOM dependencies.
Developers are human users of the local landing page; they are not reframed as API clients.

These Gherkin files are the executable acceptance suite for tenant resolution.
Cucumber bindings live in `tests/bdd/` and `pnpm test:bdd` is required CI
evidence. Dry discovery still reports 52 expanded cases (27 `@production`, 25
remaining).

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
and the counts above. `pnpm test:bdd:dry` proves discovery of every expanded case. `pnpm test:bdd` executes both
partitions and is the acceptance evidence for this suite.
