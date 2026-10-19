# Tasks: Initiate tenant OIDC authentication

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts](contracts/initiation.md), [quickstart.md](quickstart.md) and the
[clean critique](critiques/critique-20261018T153336Z.md).

**Branch**: `154-initiate-tenant-oidc` · **Delivery**: #216 / S2-B · **Design revision**: `d5a5302`

**Status**: Draft implementation on `007-initiate-tenant-oidc-impl`, stacked on PR #227.
Checked tasks record completed outcomes; unchecked tasks remain pending. See [quickstart.md](quickstart.md) for evidence and limits.

**Tests**: Explicitly requested by the feature. Prefer properties for meaningful input domains; use named examples
for discrete configuration, protocol, cancellation and framework outcomes. Write the relevant tests/scenarios
before their implementation, observe a meaningful failing result, then make them pass. Red states are local
construction states; normal repository checks must pass before committing a completed logical group.

**Scope**: The real session capability always reports absence. Root redirects before tenant lookup; login owns
tenant/provider work. No Redis client, transaction cookie, recoverable store, callback acceptance, positive session,
secret provider or comprehensive enforcement is added. #217 owns save-before-redirect together with callback
recovery/consumption; #218 owns authenticated sessions; #154 retains application-wide integration/evidence.

## Format and execution conventions

`- [ ] Tnnn [P?] [USn?] Action with exact paths`

- Paths are repository-relative. New paths are intentional; do not create unrelated scaffolding.
- `[P]` identifies work that can start concurrently with other marked tasks in the same phase after its entry gate.
  It does not authorize concurrent edits to the same file or bypass a listed prerequisite.
- Only the owning `packages/frontend/src/lib/authentication.ts` imports its private children. Tests and runtime
  use public parents. Do not export transient verifier/context solely for tests or future callback consumers.
- Read `docs/engineering/testing/README.md`, `property-based-testing.md` and `requirements-bdd.md` before relevant
  test work. Before Effect work, read `docs/engineering/effect-guidance.md`, `packages/frontend/AGENTS.md`, the
  available v4 checkout's `LLMS.md` and relevant linked examples; installed declarations govern APIs.
- Requirements BDD work uses `requirements-bdd-author`, `requirements-bdd-scaffold` and `requirements-bdd-review`
  at the indicated stages. Refresh/read applicable requirements in `origin/main`; feature-local FRs are not new IDs.
  Use feature-level `@partial` and only supported requirement tags. No undefined/pending scenarios at completion.
- Observability is verified with real logs/exported OTel and temporary probes. Retain no telemetry assertions.

## Phase 1: Setup

**Purpose**: Confirm the accepted inputs and install the sole new protocol dependency.

- [x] T001 Refresh `origin/main`, recheck the SESSION/TENANT/SECURITY documents linked from `specs/007-initiate-tenant-oidc/spec.md` against baseline `9f83d3b`, and read the applicable repository/Effect/testing guidance; record the implementation baseline and any material drift in `specs/007-initiate-tenant-oidc/quickstart.md` before dependent assertions. Before changing the existing PathAble UI, read its installed `agent-guidance/pathable-react/SKILL.md` and the relevant linked reference. Reconcile material requirement changes through the relevant Spec Kit skill rather than silently expanding scope.
- [x] T002 Add only `openid-client@6.8.8` to `packages/frontend/package.json` using root pnpm and update `pnpm-lock.yaml`; inspect installed discovery/custom-fetch declarations and supply-chain results. Keep the existing Effect catalog, test runners and workspace structure; add no Redis/auth framework/signing dependency.

**Checkpoint**: Accepted contracts and actual pinned client APIs are available. No provider or tenant request I/O
has been added at startup.

## Phase 2: Foundational boundaries

**Purpose**: Establish the minimal public capabilities used by the stories. Depends on T001–T002.

- [x] T003 [P] Add the readonly public `SessionService.hasSession(): Effect<boolean>` and its always-false production Layer in `packages/frontend/src/lib/session.ts`. Preserve the data-model constraint: "It does not inspect cookies, access a store, resolve the request tenant, or produce an authenticated identity." Add no Session/Option payload, future lookup arguments or stand-alone test of the literal false expression; T006 protects the actual consumer.
- [x] T004 [P] Define the readonly public `AuthenticationService.prepare({ host })` contract and safe tagged `AuthenticationUnavailable` in `packages/frontend/src/lib/authentication.ts`, with success limited to the authorization destination and existing tenant `HttpError` kept distinct. Define the actual consumer interface without a placeholder provider implementation, persistence capability, module-level runtime or extra exports; T011 supplies the real Layer.

**Checkpoint**: Public contracts exist; implementation and evidence can target them without private-child imports.
All story work depends on this phase. Foundation alone is not a usable login flow.

## Phase 3: User Story 1 — Start authentication with the selected tenant (P1)

**Goal**: A sessionless visitor follows `/` → `/auth/login` → the selected real provider without protected content,
a local credential form or an extra application login action. FR-001/002/003/006/009; SC-001/002/003.

**Independent test**: With two configured tenants, observe a raw root 307 even with unusable tenant files, then
explicitly request login and inspect the independently expected issuer/client/callback and code/openid/S256/state/
nonce/`max_age=0`. Exercise A/B/A host ordering and static arbitrary Hosts, then navigate to real Keycloak. No
application session/correlation cookie is issued and no authenticated callback result is claimed.

### Tests first

- [x] T005 [P] [US1] Write public-service properties in `packages/frontend/tests/lib/authentication.test.ts` for distinguishable A/B/A tenant selection, static Host independence, callback/client preservation and protocol fields, using the real OIDC adapter with controlled transport/randomness and fresh scoped worlds. Add configuration-domain properties and named malformed JSON/origin/boolean Layer-build failures. Derive expectations independently; import only `src/lib/authentication.ts` and public tenant interfaces, never export verifier/context for assertions or treat sampled uniqueness as cryptographic proof.
- [x] T006 [P] [US1] Write root/login consumer properties and small adapter examples in `packages/frontend/tests/unit/authentication-entry.test.ts`: the real always-absent session capability denies protected rendering and redirects root to login across valid/invalid Hosts, unusable tenant worlds and supplied cookies; login delegates a prepared destination. Use native Next stubs only at the adapter edge; do not replace the session implementation with canned false or count private calls. Reserve actual layout/status/no-store proof for T018.
- [x] T007 [P] [US1] Write named `node:test` harness regression examples in `tests/bdd/checks/browser-routing.test.ts` for the shared browser-routing capability implemented by T014: application hops retain logical Host and raw redirects, while external provider requests continue to their real destination. Exercise permitted application authorities, an application redirect and an external destination; examples fit these discrete Playwright routing decisions and the existing Node harness runner. Assert observable routing outcomes, not helper call counts or provider internals; add no testing dependency.
- [x] T008 [P] [US1] Use `requirements-bdd-author` to add `tests/bdd/requirements/tenant-oidc-initiation.feature` with feature-level `@partial`, the initiation-only description and scenarios for raw root delegation/protected-response denial, A/B/A and static selection, actual browser delegation and the fresh-auth request. Apply SESSION-001/002/004/013 and TENANT-003 tags only where supported by main. Keep failure matrices in the existing tenant feature and retain no skipped/undefined steps at completion.

### Implementation and integration

- [x] T009 [US1] Implement schema-backed process settings in `packages/frontend/src/lib/authentication/config.ts`, consumed through the owning parent's ConfigProvider/Layer graph. Preserve these model constraints verbatim: `OIDC_CALLBACK_ORIGINS_JSON` is a "Non-secret JSON object from resolved tenant alias to exact public origin; default `{}`"; "Malformed explicit map/origin fails startup. A missing selected alias makes login preparation unavailable; diagnostics remain usable." `OIDC_ALLOW_INSECURE_LOOPBACK` is "Boolean, default false"; "Invalid explicit value fails startup. True allows HTTP only at loopback issuer/discovery/authorization/callback URL boundaries, never external HTTP." Enforce "Origins have no credentials, non-root path, query or fragment. Append fixed `/auth/callback`." Keep existing `packages/frontend/src/lib/config/index.ts` consumers compatible and add no tenant-file fields or timeout/Redis/signing settings.
- [x] T010 [US1] Implement real request preparation in `packages/frontend/src/lib/authentication/provider.ts` using issuer discovery and the installed OIDC client: code response, openid scope, PKCE S256, fresh state/nonce, exact callback and `max_age=0`. Apply HTTPS/default and the explicit loopback policy to the configured/discovered URL boundaries; no vendor interpretation of `connection` or credential lookup. Preserve: "The verifier remains server-only and is discarded after this request." and "No context is embedded in a cookie, token, HTML debug payload, telemetry record, process Map or other recoverable store." T027 completes the transport failure/cancellation evidence before feature acceptance.
- [x] T011 [US1] Implement the real preparation Layer in `packages/frontend/src/lib/authentication.ts` and compose it with session presence in `packages/frontend/src/lib/runtime.ts`. Resolve through `TenantConfigService` before provider work and keep the model's private context constraints: `tenantAlias` is the "current request's independently selected alias"; `oidc` is "selected validated issuer/client/auth-mode/reference configuration; no resolved secret"; `redirectUri` is the "canonical configured callback for the alias, independent of Host/forwarded/query authority"; `authorizationEndpoint` is the "discovered metadata endpoint validated for issuer and transport constraints". Return only the destination; use useful `Effect.fn` boundaries and the existing shared host runtime, with no provider discovery/request-tenant read at boot or runtime inside library operations.
- [x] T012 [US1] Integrate `packages/frontend/src/app/(app)/page.tsx`, `packages/frontend/src/app/(app)/layout.tsx` and new `packages/frontend/src/app/auth/login/page.tsx`: root consults session presence and automatically redirects before any tenant read; remove both eager tenant reads and retain dynamic rendering. Login runs preparation and redirects before streaming, outside catches that swallow Next navigation. Use existing page error mapping for tenant failures and the public sign-in error for safe preparation failure. No positive-session rendering, cookie writes, blanket Proxy gate or Route Handler; preserve preview's separate tenant read.
- [x] T013 [US1] Update `tests/bdd/support/world.ts` and `tests/bdd/support/server.ts` with explicit scenario-owned callback maps and `OIDC_ALLOW_INSECURE_LOOPBACK=true` for Keycloak worlds, rather than inherited machine settings or stale `BDD_ALLOW_LOOPBACK_HTTP`. Use registered `http://springfield.localhost:3000` and `http://shelbyville.localhost:3000` origins independently of random Next ports/logical `example.test` Hosts. Keep raw HTTP requests unfollowed: assert root first, then explicitly request login; do not globally reinterpret status or add provider probes to every application startup.
- [x] T014 [US1] Add the shared actual-consumer browser-routing capability in `tests/bdd/support/browser.ts` and adopt it in `tests/bdd/steps/presentation.ts` for T015 to reuse in authentication steps: intercept only owned application authorities, preserve logical Host for every app hop, prevent internal redirect following, let Chromium navigate redirects and continue external provider requests unchanged. Keep the ordinary missing-page comparison and no mock provider; make T007 pass without broad helper abstractions.
- [x] T015 [US1] Use `requirements-bdd-scaffold` to reuse existing bindings and implement only missing initiation steps in `tests/bdd/steps/authentication.ts`, with necessary HTTP observations in `tests/bdd/steps/http.ts` and the shared browser capability from T014. Assert destinations against independent fixture expectations, root denial and no application/correlation cookie; browser evidence must reach real Keycloak. Stop before callback acceptance and keep product assertions out of setup.
- [x] T016 [US1] Reconcile `tests/bdd/requirements/tenant-context.feature` with the new responsible login boundary: replace root-200 reachability with tenant-selected initiation evidence and preserve static Host exemption and A/B/A selection. Use the BDD author workflow, requirement tags and `@partial` description appropriate to the new slice; do not claim raw root 307 proves tenant selection or discard any existing failure coverage.
- [x] T017 [US1] Update `.github/workflows/ci-bdd.yml` to provision the Compose-pinned Keycloak image with `docker/keycloak/pre-ets-realm.json`, bounded realm-discovery readiness, startup diagnostics and unconditional owned-container cleanup. Place provider setup/readiness after a successful build so a provider failure still permits the existing independent smoke condition. Preserve main-only nightly/manual scheduling, Redis service and report upload; no PR BDD job, wildcard registration or new Redis use. Do not put provider provisioning/probes inside product steps.
- [x] T018 [US1] Run focused US1 Vitests/harness checks and production HTTP/browser cases from `specs/007-initiate-tenant-oidc/quickstart.md` against real Keycloak. Verify separate root/login 307s, no-store, no protected content or new app/correlation cookie, exact tenant/client/callback fields, and repeat delegation with arbitrary cookies. Record sanitized revision/conditions/results in that guide; provider arrival or a returned code is not callback/session/freshness evidence.

**Checkpoint / MVP demo**: US1 can demonstrate initiation. This is an internal demo checkpoint, not feature
completion or production readiness: US2/US3 and final validation remain required P1 gates.

## Phase 4: User Story 2 — Reach public authentication and diagnostic resources (P1)

**Goal**: Preserve public paths, diagnostics and safe required assets without login loops or session creation.
FR-004/006/007; SC-004. Integration depends on US1; the marked authoring/audit work can run together.

**Independent test**: Directly request callback/error/test routes without authentication, compare complete diagnostic
JSON against independently parsed tenant fixtures, and observe no-store/no new session cookie. Repeat with provider
unavailable. Preserve preview gating and assess public asset content separately from HTTP reachability.

### Tests first and preservation

- [x] T019 [P] [US2] Use `requirements-bdd-author` to create `tests/bdd/requirements/authentication-public-resources.feature` with feature-level `@partial`, existing callback fallback/error/test reachability and diagnostic full-JSON/no-store/no-session scenarios. Tag SESSION-001 and add TENANT-006 only for diagnostic evidence. State remaining recovery/default-protection gaps; add no scenario for unbuilt recovery UI or full callback rejection validation.
- [x] T020 [US2] Implement/reuse public-resource bindings in `tests/bdd/steps/authentication.ts`, `tests/bdd/steps/http.ts` and `tests/bdd/steps/tenant.ts` after T019. Retain independent expected JSON and direct public HTTP outcomes, including no initiation loop/no new application cookie. Reuse existing diagnostic evidence instead of duplicating its whole matrix; no store clients, mock IDP or incidental page-copy inventory.
- [x] T021 [P] [US2] Audit and preserve the public contracts in `packages/frontend/src/proxy.ts`, `packages/frontend/src/app/auth/callback/page.tsx`, `packages/frontend/src/app/login-unavailable/page.tsx`, `packages/frontend/src/app/%5Ftest/tenant-config/route.ts`, `packages/frontend/src/app/%5Ftest/onsite/page.tsx` and `packages/frontend/src/app/(app)/tenant-context.ts`. Correct only regressions caused by initiation: callback stays denying/public, diagnostic JSON stays complete/non-secret, preview retains its own tenant check/environment gate, and required public assets contain no protected information. No unrelated route-policy redesign.
- [ ] T022 [US2] Manually verify public error/retry navigation and any changed presentation using keyboard, visible focus, accessible names and assistive technology, recording results/content-safety assessment in `specs/007-initiate-tenant-oidc/quickstart.md`. If presentation changes in `packages/frontend/src/app/login-unavailable/page.tsx`, first read the installed `@pathableai/react/agent-guidance/pathable-react/SKILL.md`; do not invent a local component workaround.
- [x] T023 [US2] Run the public-resource/diagnostic scenarios and existing preview safeguard independently of provider availability using `tests/bdd/requirements/authentication-public-resources.feature`, `tests/bdd/requirements/tenant-resolution.feature` and `tests/bdd/smoke/onsite-production.feature`; record real JSON/status/cache/cookie/browser outcomes in `specs/007-initiate-tenant-oidc/quickstart.md`. Do not stop shared provider services or treat preview success as production-ingress evidence.

**Checkpoint**: Direct public resources work without the root session gate, provider availability or Redis.

## Phase 5: User Story 3 — Fail without another tenant's access (P1)

**Goal**: Preserve actual tenant 404/500 and ordinary missing-page presentation, bound preparation failure, and
never substitute another tenant/provider or grant access. FR-005/007/009; SC-005.

**Independent test**: Root still gives session-missing 307 under unusable tenant worlds; the explicit login request
returns the specified actual 404/500. Missing callback mapping, unsuitable/unavailable provider, forbidden HTTP,
redirected discovery and timeout deny preparation; cancellation remains interruption. Browser navigation reaches
the ordinary missing page or usable public sign-in error without protected content.

### Tests first

- [x] T024 [P] [US3] Add public-service properties/named failures in `packages/frontend/tests/lib/authentication-failures.test.ts`: missing callback alias, mismatched issuer, unavailable discovery, direct metadata shortcut rejection, forbidden external HTTP even with local mode, and discovery redirects whose destination is never fetched. Use generated permitted/forbidden URL domains for policy and explicit `localhost.example.test`/wildcard-bind rejections. With controlled pending transport/TestClock, demonstrate five-second timeout cancels transport and yields safe unavailability, while caller interruption yields interrupted exit/no destination. No raw error/log/span assertions or private-child imports.
- [x] T025 [P] [US3] Add discrete adapter examples in `packages/frontend/tests/unit/authentication-entry-failures.test.ts` for tenant 404 versus 500, safe preparation failure navigation, no fallback/protected rendering, and preservation of Next navigation interrupts. Use independently supplied errors/configuration and include hostile Host/forwarded/return-query values where they reach the adapter; do not duplicate the full tenant decoder matrix or confuse mock redirects with actual HTTP status evidence.
- [x] T026 [P] [US3] Use `requirements-bdd-author` to revise `tests/bdd/requirements/tenant-failures.feature`: move tenant-root-200 preconditions and failure observations to explicit root-then-login requests while retaining actual 404/500, mode distinctions, independent diagnostics and unrelated absent-path behavior. Add bounded provider-unavailable/missing-map outcomes to `tests/bdd/requirements/tenant-oidc-initiation.feature` without duplicating the tenant matrix; retain supported tags and partial evidence descriptions.

### Failure implementation and verification

- [x] T027 [US3] Complete the private transport/failure boundary in `packages/frontend/src/lib/authentication/provider.ts` and its owning parent `packages/frontend/src/lib/authentication.ts` to make T024 pass. Validate issuer, actual discovery URL and authorization destination under the exact loopback policy in `specs/007-initiate-tenant-oidc/contracts/initiation.md`; reject discovery redirects and metadata-document shortcuts. Use one five-second `Effect.timeoutOrElse` around the provider phase after tenant resolution; close over `Effect.tryPromise`'s signal in `customFetch`, combine with the library signal via `AbortSignal.any`, retain manual redirects/other request options and the library safety timeout. Timeout cancels work and returns safe unavailability; preserve caller interruption/defects. No application retry/cache/per-fetch timers/general HTTP service.
- [x] T028 [US3] Complete expected-failure mapping in `packages/frontend/src/app/auth/login/page.tsx` using the existing public boundary in `packages/frontend/src/lib/error.ts`, retaining actual tenant 404/500 and public sign-in failure without raw payloads/query data or fallback provider. Keep the root redirect independent of tenant availability and framework redirects outside failure catches; make T025 pass without changing tenant decoding or broadening protected-resource enforcement.
- [x] T029 [US3] Use `requirements-bdd-scaffold` to implement the revised failure bindings in `tests/bdd/steps/authentication.ts`, `tests/bdd/steps/tenant.ts` and `tests/bdd/steps/presentation.ts` after T026. Preserve raw first-hop/login status observations and generic status-step meaning, compare invalid-tenant navigation with an ordinary missing page, and use owned temporary tenant resources/explicit missing-map settings. No authentication bypass or product assertions hidden in setup.
- [x] T030 [US3] Run the public-service/adapter failure suites in `packages/frontend/tests/lib/authentication-failures.test.ts` and `packages/frontend/tests/unit/authentication-entry-failures.test.ts`; confirm distinct expected failures, transport cancellation and interrupted exits with scoped cleanup. Retain useful shrinking counterexamples, but never narrow generators or weaken checks just to pass. Record named evidence and its controlled-environment limits in `specs/007-initiate-tenant-oidc/quickstart.md`.
- [x] T031 [US3] Execute production HTTP and Chromium failure cases from `specs/007-initiate-tenant-oidc/quickstart.md`: root 307 before unavailable tenant lookup, login actual ordinary 404/500, public safe sign-in failure for missing map/provider outage, and no fallback/protected content/new app cookie. Check both tenant modes and existing absent paths; use only owned temporary fixtures/processes and record results separately from unit-test evidence.

**Checkpoint**: All three P1 stories have their own bounded outcome evidence. No failure becomes successful
authentication, and later session/tenant matching remains unimplemented.

## Phase 6: Polish and cross-cutting completion

**Purpose**: Finish documentation, real observability inspection and required validation after all stories.

- [x] T032 Update `README.md`, `docs/authentication.md`, `docs/session-state.md`, `features/README.md`, `tests/bdd/steps/README.md` and `packages/frontend/.env.example` with the implemented session-first partial flow, callback-origin/local-HTTP settings and real-Keycloak local/nightly prerequisites. Retain sanitized provider/request fixtures in `fixtures/tenant-config/` and `docker/keycloak/pre-ets-realm.json` for #217 without widening registrations or adding secrets; document both persistence-before-redirect and callback recovery/consumption as #217 work, with #218/#154 ownership preserved.
- [ ] T033 Inspect real local logs and exported OTel according to `specs/007-initiate-tenant-oidc/quickstart.md`: root's request trace has no tenant/provider work; login separately has tenant/preparation work; failures have safe categories; no Redis/cookie/session-created/callback-success/freshness-success signals are claimed. Check automatic URL/error attributes for protocol/credential leakage and collector outage behavior; fix unsafe capture only at the existing `packages/frontend/src/lib/observability.ts` / `packages/frontend/src/lib/runtime.ts` instrumentation boundary if needed. Keep one exporter/global bridge, remove temporary probes and retain no telemetry tests.
- [x] T034 Run full frontend Vitests, `pnpm test:bdd:checks`, Gherkin lint/format/discovery, actual requirements BDD and production safeguard smoke using `package.json` and `packages/frontend/package.json`; use `requirements-bdd-review` on the changed features/bindings. Require executable passing partial scenarios, justified main-branch tags, retained tenant/public outcomes and no store clients/mock IDP. Record runtime results separately from dry discovery in `specs/007-initiate-tenant-oidc/quickstart.md`.
- [x] T035 Run `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm check:unused`, `pnpm format:check`, targeted Spec Kit formatting and `pnpm check:changes` from root `package.json`; validate changed `.github/workflows/ci-bdd.yml` syntax with available actionlint and exercise the owned provider startup/readiness/failure/cleanup sequence locally. Preserve the normal pre-commit hook, fix underlying findings without suppressions, and keep generated output and unrelated package-manager edits out of commits.
- [x] T036 Consolidate sanitized implementation revision/conditions, separate root/login statuses, provider/browser outcomes, trace references, executed commands and limitations in `specs/007-initiate-tenant-oidc/quickstart.md`. Recheck FR-001–009/SC-001–005 against completed tasks and retain all downstream gaps. Record main-only nightly workflow execution as pending until it actually runs on main; do not bypass cadence to claim branch CI evidence, update requirement verification from static checks, or close #216/#154 based only on this task list. Clean up only owned resources/captures and commit validated logical groups.

## Dependencies and execution order

```text
T001 → T002 → foundation (T003 || T004)
                  ↓
US1 tests (T005 || T006 || T007 || T008)
                  ↓
US1 implementation/integration (T009–T017) → T018 demo validation
                  ↓
US2 (T019–T023) → US3 (T024–T031)
                  ↓
Cross-cutting completion (T032–T036)
```

- The graph describes completion gates; tests are written before the corresponding implementation, not expected
  to pass before it. T005–T008 start after the public contracts exist. T009/T010 precede T011; T011 precedes T012.
- T013 precedes raw BDD bindings. T007 precedes T014; T014 precedes browser bindings. T008 precedes T015 and T016.
  T017 supplies nightly prerequisites, while local provisioning follows the existing quickstart. T018 needs the
  real services/pages, bindings and local provider.
- US2 uses the initiation integration but observes its own public outcomes. T019 precedes T020; T021 can run
  alongside T019 and must finish before T022/T023. T020 and T022 precede T023.
- US3 tests can be drafted against stable public contracts earlier, but integrate US3 after US1/US2 to avoid
  concurrent edits to authentication/binding/presentation files. T024 precedes T027, T025 precedes T028, T026
  precedes T029; T027/T028/T029 precede T030/T031.
- Shared files are serialized even across stories. US1 owns initial preparation/adapter integration; US2 preserves
  public contracts; US3 completes and demonstrates the rejection/cancellation cases. None is omitted from delivery.
- T032–T036 depend on all three stories. Never claim an unchecked runtime or main-only workflow gate passed.

## Parallel execution examples

These are scheduling examples, not requests to spawn agents during task generation.

| Phase/story | Concurrent work after the entry gate                                                             | Join point                                        |
| ----------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Foundation  | T003 session capability; T004 authentication contract                                            | Before story tests/integration                    |
| US1         | T005 service properties; T006 entry properties; T007 harness regressions; T008 Gherkin authoring | Before the corresponding T009–T016 implementation |
| US2         | T019 public-resource Gherkin; T021 existing public-route/content audit                           | Before bindings/manual/public runtime completion  |
| US3         | T024 preparation failures; T025 adapter failures; T026 requirements failure prose                | Before T027–T029 fixes/bindings                   |

Avoid sharing an owned provider/server/fixture directory across workers. Mutable property worlds and temporary
resources are fresh per case, including shrinking; only actual shared read-only fixtures may be reused.

## Implementation strategy and completion map

1. Establish the actual dependency/public boundaries, then make the US1 service/consumer tests pass and demonstrate
   real provider arrival. This is the smallest useful internal demo, not a complete authentication feature.
2. Preserve US2 public behavior and complete US3 failure/cancellation behavior. Do not ship a success-only subset
   or claim the always-absent predicate implements stored-session lookup.
3. Run full evidence/quality checks, inspect real exported telemetry and record the remaining gates accurately.
   The next feature adds both halves of recoverable correlation; no temporary storage is needed here.

| Feature expectation                        | Primary tasks                      | Evidence boundary                                                                      |
| ------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------- |
| FR-001/009 session-first denial/delegation | T003, T006, T012, T018, T025, T031 | Consumer plus actual composed root/login HTTP/browser                                  |
| FR-002 selected tenant/provider            | T005, T009–T011, T013–T018         | Public service properties and real provider arrival                                    |
| FR-003 protocol/freshness request only     | T005, T008, T010, T015, T018       | Prepared request fields; no verified fresh event                                       |
| FR-004 public exceptions                   | T019–T023                          | Direct HTTP/browser, preview safeguard and content assessment                          |
| FR-005 tenant/startup failures             | T005, T009, T024–T031              | Configuration/service examples, actual status and ordinary missing page                |
| FR-006 non-secret contracts                | T009–T011, T019–T023, T032–T033    | Independent diagnostic JSON and manual safety inspection                               |
| FR-007 denied/usable failure               | T022, T024–T031                    | Typed failure, actual browser and accessibility outcomes                               |
| FR-008 downstream handoff                  | T010–T011, T032, T036              | Retained fixtures, no stored context, explicit #217 save/recover contract              |
| Critique E1 live-provider prerequisites    | T013–T018, T032, T035–T036         | Explicit harness environment, local readiness and accurately deferred main CI evidence |
| Critique E2 transport/cancellation         | T024, T027, T030, T033             | URL-domain properties, named cancellation failures and manual safe telemetry           |

All tasks remain unchecked until their stated outcome is completed and its evidence/limitations recorded.
