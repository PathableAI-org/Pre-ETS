# Production capability acceptance

The executable feature files under `capabilities/` describe production user and operator behavior.
Local development is test setup, not a separate acceptance capability. Static tenant behavior remains
covered by frontend tests; production host isolation has a real HTTP regression.

## Run

From the repository root, with Redis available (the runner never manages Compose):

```sh
pnpm exec playwright install chromium
pnpm --filter @pathableai/pre-ets-frontend build
pnpm test:bdd
```

`REDIS_URL` defaults to `redis://127.0.0.1:6379`. Each scenario owns a temporary tenant directory,
random signing secret and Redis key prefix. Cleanup removes only that scenario's resources. HTTP
production tests model HTTPS termination through the forwarded protocol while connecting to an owned
loopback Next server. The mock provider only supplies discovery/arrival; it cannot complete authentication.

| Command                     | Evidence                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:bdd:dry`         | Parse all features, validate execution tags and discover bindings; no runtime evidence                                |
| `pnpm test:bdd:checks`      | Regression checks for metadata validation and truthful presentation assertions                                        |
| `pnpm test:bdd:application` | Production application functions, with Redis where tagged; no frontend server                                         |
| `pnpm test:bdd:http`        | Actual HTTP responses, production before development                                                                  |
| `pnpm test:bdd:browser`     | Actual browser interactions; production before development                                                            |
| `pnpm test:bdd`             | Application, production server, then development server partitions; independent failures do not hide later partitions |
| `pnpm test:e2e`             | Separate real-Keycloak authentication journeys; see [E2E setup](../e2e/README.md)                                     |

Each scenario has exactly one of `@application`, `@http`, `@browser`. Server scenarios also have exactly
one of `@production`, `@development`; these describe execution, not feature scope. Dependency tags such
as `@redis` and `@mock-idp` are independent. Direct Cucumber profiles are declared in `cucumber.mjs`;
package scripts also enforce metadata and production-build prerequisites.

## Evidence and maintenance

Keep steps specific to one execution boundary. Never satisfy a visible-content assertion with a redirect,
an error response, or a fixture-file read. Seeded authenticated setup is explicit in focused browser scenarios;
only real-provider E2E claims authentication completion. Keep genuine application defects failing.

Use `Rule:` groups and small backgrounds. New specifications extend the existing capability when possible.
Namespace requirement tags, and record moved or unproven obligations in the [migration ledger and gap register](TRACEABILITY.md).
Do not copy implementation mechanics or test-owned business rules into acceptance steps.

CI runs discovery separately and executes the runtime suite on relevant PRs, main and manual dispatch.
It builds the frontend before production tests and uploads JSON reports, including failure logs/screenshots.
Real-Keycloak E2E stays manual. Historical spec quickstarts may name retired scripts; this page is the current
execution reference. No old `CUCUMBER_*` discovery switches or spec-specific BDD commands remain supported.

## Refactor validation — 2026-09-22

| Check                     | Observed result                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------- |
| Full BDD runtime          | 65 passed: 40 application, 20 production HTTP, 5 development browser                   |
| Discovery                 | 65 scenarios / 381 steps discovered; execution intentionally skipped                   |
| Harness regression checks | 4 passed: tag validation, independent partitions, truthful presentation                |
| Frontend tests            | 293 passed across 28 files                                                             |
| Real-Keycloak E2E         | 5 passed, 1 failed: Shift+Tab moves focus away from the inactivity recovery button     |
| Repository checks         | Typecheck, build, lint, formatting, unused-code check and diff whitespace check passed |

The E2E focus assertion is unchanged in `e2e/timeout.spec.ts`; its failure is not suppressed or retried.
This refactor changes test code/configuration only. CI configuration was inspected locally; no remote CI
run is claimed. All 112 original declarations have a disposition in the ledger. A passing reduced suite
must be read together with the explicit remaining evidence gaps.
