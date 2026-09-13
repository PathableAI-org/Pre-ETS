# Implementation Plan: Tenant Resolution

**Branch**: `001-tenant-resolution` | **Date**: 2026-09-13 | **Spec**: [spec.md](spec.md)

**Input**: `specs/001-tenant-resolution/spec.md`, including Display Name as the only configuration field and the
landing page as the visible acceptance outcome.

## Summary

Introduce frontend-owned host binding and a replaceable configuration read contract. Next Proxy rejects invalid or
unknown tenants with HTTP 403 before rendering. An explicit development-only static mode supplies configuration on
`localhost`. A server-only current-context accessor gives the landing page its tenant's Display Name, rendered with
the existing PathAble text component. No database, backend workflow, authentication, or client state is introduced.

Research decisions and primary sources are recorded in [research.md](research.md). This plan describes future work;
no runtime behavior or feature tests have been implemented or executed.

## Technical Context

**Language/Version**: TypeScript 6.0.3 with root strict settings; Node 24.21.0; pnpm 12.4.1, verified from manifests.

**Primary Dependencies**: Existing Next 16.3.5, React/React DOM 19.3.0, PathAble React 0.0.5. Add the standard
`server-only` import marker for the current-context/settings entry points and frontend development dependency
`vitest`, `@cucumber/cucumber`, and `playwright` as frontend development dependencies for Gherkin acceptance and browser/HTTP interaction. Pin compatible versions in the existing root lockfile during implementation.
No new application framework, tenancy library, database client, schema framework, or additional unit-test framework beyond Vitest.

**Storage**: None durable. Explicit server environment JSON supplies immutable static records behind one async source
contract. Display Name is the sole configuration field; slug is the separate identity key. Missing production records
mean no known tenants, not an implicit demo tenant.

**Testing**: Vitest tests for pure policy/source/orchestration contracts; Cucumber runs the root Gherkin scenarios with Playwright Chromium for observable
landing-page behavior and real HTTP status. Strict typechecking also includes test/config files. Existing repository
quality gates remain required. See [quickstart.md](quickstart.md).

**Target Platform**: Node-hosted Next frontend, local development and production-build validation. A deployed ingress
must deliver trustworthy Host and prevent origin bypass; no deployment is performed by this feature.

**Project Type**: SSR-first web application with an independently owned backend, untouched by this slice.

**Performance Goals**: No invented latency/scale target. One host determination per application request; only static
lookups; no durable I/O. Reuse current context within each server render without global tenant state or persistent
HTML/configuration caching.

**Constraints**: Genuine 403 before rendering; no fallback tenant; local static mode only under development runtime;
Display Name is non-blank text; no secrets/real client fixtures; no host parsing or storage knowledge in the page.

**Scale/Scope**: One existing page, two synthetic known tenants for acceptance, two local modes, one static source
implementation and one future-facing read contract. No real tenant onboarding or production persistence claim.

## Constitution Check

_GATE: Evaluated before Phase 0 and re-evaluated after Phase 1._

| Principle                            | Pre-research assessment                                                          | Post-design assessment and evidence                                                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Evidence-grounded specification   | Pass: approved Option B and user Display Name correction are controlling inputs. | Pass: contracts map observable names/refusals to FR/SC; older all-fields-deferred wording is superseded in the spec.                                                              |
| II. Ownership and authoritative data | Pass: configuration belongs to frontend.                                         | Pass: all implementation stays in `packages/frontend`; no backend/shared package/domain persistence or session storage.                                                           |
| III. Tenant isolation                | Pass with explicit local-only exception described below.                         | Pass with the same bounded exception: one Host binder, overwritten internal headers, matching record validation, no production bypass, per-request context, fail-closed errors.   |
| IV. Accessible server-rendered UI    | Pass: one presentational addition to existing page.                              | Pass: installed PathAble guidance reviewed; `Text` displays Display Name as escaped text; existing heading and keyboard route retained; no client boundary.                       |
| V. Meaningful behavioral tests       | Pass: named successful and rejection workflows.                                  | Pass: real 403 and name outcomes, cross-tenant concurrency, Vitest policy/source cases; no text inventory or implementation-only E2E assertions.                                  |
| VI. Simplicity and quality           | Pass: one source contract answers a stated requirement.                          | Pass: Vitest unit runner, Cucumber acceptance runner with Playwright browser library, no persistence framework; strict test coverage and existing quality/hook policies retained. |

**Local-only exception to Principle III**: The literal rule says each request binds through Host. The user's recorded
local enable/disable answer and approved Option B explicitly allow local static configuration without host binding.
This design records that exception rather than reclassifying static data as host binding. Scope: development runtime,
configuration work, and the landing page only. Production remains host-bound. Removal/reassessment trigger: later
host-bound authentication/session work or replacement of the local static workflow. Carry the authorization and scope
into maintainer review; this planning command does not modify constitution text or extend the exception.

**Strategy synchronization**: Implementation must update the affected strategy statements listed in research decision 8:
403 replaces not-found; static Display Name configuration is the current increment; durable stores and later fields
remain future architecture. Those documentation edits are part of this feature, not prerequisites requiring new scope.

**Post-design result**: No unresolved gate failure. The explicit local exception is the only deviation. External ingress
trust must be checked before deployment; it is not evidence of deployment readiness today.

## Project Structure

### Documentation (this feature)

```text
specs/001-tenant-resolution/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
└── contracts/
    ├── tenant-context.md
    └── landing-page.md
```

`tasks.md` is intentionally reserved for `$speckit-tasks`.

### Source Code (repository root)

Planned paths; only the existing page, package/configuration files, and strategy documents exist today.

```text
packages/frontend/
├── .env.example                         # documented synthetic settings for both modes
├── package.json                         # frontend-owned test scripts/dependencies
├── tsconfig.json                        # strict inclusion of tests/config, native TS imports
├── vitest.config.ts                     # Node environment; tests/unit/**/*.test.ts only
├── cucumber.mjs                         # root feature paths and ESM support-code imports
├── src/
│   ├── proxy.ts                         # HTTP adapter and one host-binding entry point
│   ├── app/page.tsx                     # async current config read and PathAble Text
│   └── tenant/
│       ├── model.ts                     # readonly identity/config/context and failure types
│       ├── host.ts                      # pure trusted-authority-to-slug parser
│       ├── settings.ts                  # server-only environment composition
│       ├── source.ts                    # async read contract and static record validation
│       ├── resolve.ts                   # pure orchestration with injected settings/source
│       ├── handoff.ts                   # internal identity header encoding/validation
│       └── current.ts                   # server-only React-cached current context/config
└── tests/
    ├── unit/tenant-policy.test.ts
    ├── unit/tenant-source.test.ts
    ├── unit/tenant-context.test.ts
    └── bdd/
        ├── steps/tenant.steps.ts         # deduplicated Given/When/Then bindings
        └── support/
            ├── world.ts                 # scenario-local data, contexts, and responses
            ├── hooks.ts                 # lifecycle and cleanup
            └── server.ts                # owned test process, readiness, restart, teardown

features/*.feature                       # existing executable acceptance source

README.md                                 # local modes, validation commands, current pnpm pin
.gitignore                                # browser artifacts only
pnpm-lock.yaml                            # requested feature dependencies
.github/workflows/ci.yml                  # feature validation added to existing jobs
docs/multi-tenancy.md                     # status, local mode, source/current contract
docs/authentication.md                    # unknown-tenant status consistency only
docs/domain-persistence.md                # current configuration vs future fields
docs/docker-compose.md                    # static increment needs no external services
```

**Structure Decision**: Frontend contains presentation and tenant configuration. Pure model/parser/source/orchestration
code does not import Next, React, or environment globals. Framework entry points adapt runtime inputs and outputs.
No new workspace or backend endpoint is necessary. `server-only` protects server-facing consumers; ordinary model
and validation modules remain directly testable.

## Phase 0: Research outcome

Resolved: reliable 403 handling, trusted host input, local mode selection, non-durable source shape, current-context
reuse, safe text rendering, and validation tooling. See [research.md](research.md) for decisions, alternatives,
installed evidence, and official sources. No technical clarification remains open.

## Phase 1: Design

### Request flow and ownership

1. Proxy discards caller-supplied `x-preets-tenant-*` values and loads validated runtime settings. An absent or unsupported mode selects host association. For unsupported values, emit the safe `invalid-mode` diagnostic and accepted-mode guidance without the raw value; never use local static data. The normal host/source outcome applies, not a mode-only 500. Missing or malformed selected static records remain configuration errors.
2. In host mode, the pure binder validates only Host and returns the canonical slug. The separate source reader
   resolves and validates that slug's record. Unknown/invalid host or missing record returns 403; malformed source
   returns 500; unavailable source returns 503. In local static mode, validate the supplied record without binding Host.
3. Proxy writes only the established slug and origin as upstream request headers. It never returns these as response
   headers. All tenant-consuming request variants traverse this boundary.
4. `getCurrentTenant()` validates the internal identity, reads the matching immutable configuration through the source,
   and memoizes within the Server Component render. `getCurrentTenantConfig()` delegates. Neither interprets Host.
   Missing/mismatched internal context fails; it never reconstructs tenancy from another input.
5. `HomePage` obtains configuration and adds `Tenant: {displayName}` using PathAble `Text` below the existing heading.
   It remains a Server Component; no context mode/debug information is displayed to users.

Proxy prevalidation and the current accessor may each read the small static source. This does not repeat host binding.
The source is fixed for the process lifetime and changes require restart; a future durable source must revisit this
choice. Request headers force request-dependent rendering. Do not introduce `use cache`, persistent config caching,
or a shared mutable current-context singleton. Tenant responses/refusals must be non-shared-cacheable; verify actual
production response headers and content separation rather than assuming development behavior proves it.

### Interfaces and failures

[data-model.md](data-model.md) defines the closed record/context/failure vocabulary.
[contracts/tenant-context.md](contracts/tenant-context.md) defines settings, read operations, host grammar, header trust,
and outcome mapping. [contracts/landing-page.md](contracts/landing-page.md) defines user-visible behavior and acceptance.
Errors carry safe diagnostic categories; they do not dump JSON, names, request headers, or raw exceptions to users/logs.

### Validation and sequencing

- First establish failing pure policy/source cases, then implement the small source and resolver contracts.
- Prove the real 403 boundary with a production build and custom Host requests before wiring the page.
- Add current-context access and Display Name, then run browser journeys for host/static modes, changed static data,
  safe text rendering, readable semantics, keyboard continuity, and overlapping tenants against one server.
- Add only the required browser test tooling in its own focused setup commit when implementation reaches that step.
  Pin it through pnpm, add strict test includes and artifact ignores, and preserve shared root policies.
- Extend existing CI Quality with Vitest unit tests and CI Build with `test:bdd` after build. Install Chromium
  with the pinned Playwright CLI. Cucumber runs scenarios serially; do not create new required-check names or alter
  remote branch rules. Pending, undefined, ambiguous, and failed steps must fail acceptance. Dry-run discovery does
  not count as a passing suite.
- Validate using all existing repository gates plus the feature commands in [quickstart.md](quickstart.md).
  Fallow must discover actual test entries/config; investigate findings and add narrow entry declarations only if needed.

## Complexity Tracking

| Deviation                                                          | Why needed                                                                | Simpler alternative rejected because                                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Development-only static context does not bind Host (Principle III) | Explicit approved local workflow; context origin records the distinction. | Requiring a tenant-shaped host for every local visit reverses the user's enable/disable requirement. Production retains the full rule. |

## BDD execution design

The user's 2026-09-13 decision adopts the BDD extension's Cucumber choice. The existing `features/*.feature` files
are executable acceptance inputs, not documentation mirrored into a separate Playwright Test suite. No
`@playwright/test`, `playwright.config.ts`, or `playwright test` command is planned.

Keep dependencies, configuration, and TypeScript support code in `packages/frontend`. Configure `cucumber.mjs` to
load `../../features/*.feature` and import `tests/bdd/**/*.ts` using ESM. Adapt the extension's generic root-level
CommonJS stubs to these workspace-owned paths and imports; do not change the extension itself. Use native Node 24
TypeScript execution with erasable syntax and explicit `.ts` imports; strict typechecking must include all support
files. Verify the pinned Cucumber/Node combination loads them during scaffolding before adding application code.

Cucumber owns scenario selection, Examples expansion, hooks, and reports. Playwright's library owns browser contexts,
page navigation, locators, and HTTP request contexts inside steps. Use Node assertions and explicit bounded waits
for observable readiness; do not borrow Playwright Test fixtures or its automatic web-server lifecycle. Each scenario
has its own typed World containing fixture records, selected runtime/mode, owned processes, browser contexts, and
results. Steps sharing World use Cucumber-compatible function callbacks. No global current tenant or fixture state.

Given steps accumulate the scenario's settings before starting the server, including overrides of Background setup.
Start lazily when the scenario first needs the running page; restart within the changed-name scenario. Run scenarios
serially, with all production scenarios before any development scenarios as specified below. Own each test process, reject occupied ports rather than reusing servers,
wait for process/listener readiness with a timeout, and allow intentional 403/500 responses without treating them as
startup failure. Always close browser/request contexts and terminate owned processes after success or failure.
Overlapping-tenant scenarios still create concurrent requests against one owned process. Production builds are made
once before the suite; local scenarios run development servers. Map production browser hosts to loopback in the test
browser, and send production HTTP requests to loopback with Host headers; never contact live production tenants.

`@browser`, `@http`, and `@contract` select interaction layers, not separate competing runners. Contract-tagged steps
invoke pure source/orchestration contracts with injected fixtures. The evidence matrix below separates contract results from live-page evidence; no contract result or mocked HTML counts as a rendered-page assertion. Vitest unit tests cover additional boundary combinations rather than duplicate all
52 expanded Gherkin cases. Keep synthetic payloads and logs isolated; Cucumber results must account for all examples.

Scaffold non-passing steps before implementation, validate discovery with `test:bdd:dry`, then use `test:bdd` to prove
behavior as steps are implemented. A full passing suite must contain no pending or undefined scenarios. The FR-014 mode policy is synchronized across the spec, settings contract, model, research, and acceptance scenario: unsupported values preserve host association and report `invalid-mode`.

### Acceptance evidence matrix

| Scenario / assertions                                                              | Execution and evidence                                                                                                                                                                                                                                                                                                                    | Traceability                           |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Multiple consumers use one established tenant determination                        | In the Cucumber World, call the pure resolver once with a counted binder, then repeatedly call `readBoundTenant` with the established slug/origin. Assert matching identity/configuration and no additional binding. Review the page/accessor dependency boundary separately; this does not claim to test React memoization or rendering. | FR-004, FR-005, FR-012, SC-005         |
| Replacing the configuration source preserves tenant selection                      | Inject the alternate source into the same resolver/bound-reader consumer path; assert unchanged slug and the alternate Display Name in the returned configuration. No production source switch or diagnostic route.                                                                                                                       | FR-006, SC-005                         |
| Configuration failures never become a different tenant                             | Inject mismatched/unavailable source results; assert no successful context and map the typed failure through the real response adapter to 500/503 with safe text. This is adapter evidence, not a live page or live network result.                                                                                                       | FR-013, SC-006                         |
| Known-tenant names, name changes, accessible text, isolation, invalid Display Name | Navigate the existing live page with Playwright against environment-supplied records. Assert actual text, absent fallback names, focus/semantics, and response status as specified. Invalid-name cases use both `@contract` and `@http`: validate the source result and the live response using the same fixture.                         | FR-015, FR-016, SC-001, SC-004, SC-007 |
| Equal names with distinct identities                                               | Use both `@contract` and `@browser`: resolve both records in World and visit both real pages with those same records. Assert distinct slugs in contract results and equal visible names in the browsers, without inferring identity from name.                                                                                            | FR-015                                 |
| Static context origin and invalid mode                                             | Pure settings/resolver calls establish origin, binder usage, and diagnostic behavior. Static-page rendering is independently proved by the local browser scenarios. Invalid-mode known/unknown-host checks use injected host inputs and assert success/denial without local fallback.                                                     | FR-009, FR-014, SC-005                 |

Mixed steps keep separate typed contract and browser/HTTP results in the same scenario World and use one fixture set. A Then step must name and assert the appropriate evidence; an absent live response fails a live-response assertion. Lower-layer failure injection never adds a test-only application route or fabricates rendered HTML. Real production HTTP rejection and live configured-error cases remain required independently of response-adapter assertions.

### Build lifecycle and duration evidence

Use the existing `.next` output with an explicit production-first policy. Mark every scenario requiring a production server `@production` (including the production override in the local-host feature). `test:bdd` runs two serial Cucumber invocations through a direct package script: `cucumber-js --config cucumber.mjs --tags '@production' && cucumber-js --config cucumber.mjs --tags 'not @production'`. Dry-run discovery remains one invocation covering all scenarios. Every case belongs to exactly one partition; retain separate reports/counts for both partitions (27 production, 25 remaining) and verify their sum is 52 expanded cases. Configure distinct report destinations so the second invocation cannot overwrite production evidence.

Build once immediately before `test:bdd`. The first partition starts only production servers; fully terminate them before the development partition starts. No later scenario may start production against output touched by development. After development runs, another full suite requires a fresh build. Do not rely on serial execution alone to preserve build files or introduce an unverified custom output directory.

During scaffolding, validate this lifecycle with the pinned Next runtime: build, run all production cases successfully, shut down, run development cases, rebuild, and prove a production known-tenant request again. Record the commands, runtime versions, partition counts, and actual results. Measure full `test:bdd` wall-clock duration plus build duration separately. Keep per-scenario process ownership initially; consider reuse only if measured cost warrants it and fixture/process isolation can still be proved. No latency target is invented.

### Developer walkthrough evidence

Before feature completion, one developer independently follows the documented host-mode setup, static-mode setup, and Display Name change/restart procedure. Record date, environment, pass/fail for each step, observed names/statuses, and any instruction corrections. Re-run corrected steps. Automated fixture setup does not satisfy this SC-003 usability check; record it as pending until performed. Use the completion record in [quickstart.md](quickstart.md).

## Unit-test runner decision

The user's latest instruction selects Vitest for lower-level policy, source, and orchestration tests. Add `vitest`
as a frontend development dependency, pinned through the root lockfile during implementation. Configure
`packages/frontend/vitest.config.ts` with the Node environment and an explicit `tests/unit/**/*.test.ts` include.
Import test APIs from `vitest`; keep globals disabled and exclude Cucumber support code from Vitest discovery.
`test:unit` runs `vitest run --config vitest.config.ts`, including in CI Quality. Include the configuration and tests
in strict TypeScript checking. Vitest transforms test TypeScript; ordinary `pnpm typecheck` remains a separate gate.
No DOM emulator, Vitest browser mode, or component-testing plugin is required for these pure contracts.

Cucumber still owns Gherkin execution, with Playwright as its browser/HTTP library. Its ESM TypeScript loading remains
separate from Vitest transformation; do not assume the Vitest configuration loads Cucumber support files. The Node 24
ESM loading requirements above apply to Cucumber support code, not a native Node unit-test runner. Next remains the
application framework; Vitest's test tooling does not change the application build.
