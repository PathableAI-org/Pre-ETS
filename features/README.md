# Requirements BDD

Executable acceptance scenarios live under [`tests/bdd/requirements/`](../tests/bdd/requirements/).
They observe a running Next.js application over HTTP and in Chromium for missing-page presentation.
Tests never connect to Redis or other backing services directly; Compose (or CI services) may still run for the app process.

The historical Spec Kit capability suite has been removed. Surviving dispositions for retired
scenarios remain in the [migration ledger](TRACEABILITY.md) (not an active runner).

## Run

From the repository root, with Redis available when the app needs it (the runner never manages
Compose):

```sh
pnpm test:bdd:dry
pnpm exec playwright install chromium
pnpm test:bdd
```

`REDIS_URL` defaults to `redis://127.0.0.1:6379` for the owned Next process. Each scenario owns a
temporary tenant directory and random session signing material. Cleanup removes only that
scenario's resources.

| Command                | Evidence                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `pnpm test:bdd:dry`    | Parse features and discover step bindings; no runtime evidence                        |
| `pnpm test:bdd`        | Build the frontend, then run HTTP and browser scenarios against an owned Next process |
| `pnpm test:bdd:checks` | Harness regression checks that still protect fixtures used by BDD/E2E                 |
| `pnpm test:e2e`        | Separate real-Keycloak authentication journeys; see [E2E setup](../e2e/README.md)     |

Optional `@development` selects `next dev`; otherwise scenarios use production `next start`.
`pnpm test:bdd` builds the frontend first so that production output matches the installed Next.js.
Dependency tags such as `@redis` are not required—the app receives `REDIS_URL`
whenever the harness starts it.

Steps use HTTP for status/content claims and Chromium for missing-page presentation.
Permission-denial scenarios require a non-root user and a filesystem that enforces Unix permissions;
the setup checks that access is actually denied before asserting an application response.
See [step guidance](../tests/bdd/steps/README.md).

CI runs discovery separately and executes the runtime suite on relevant PRs, main, and manual
dispatch. Real-Keycloak E2E stays manual.

## Gherkin linting and formatting

Run `pnpm lint:gherkin` for structural checks, `pnpm format:gherkin:check` to check
formatting, and `pnpm format:gherkin:write` to apply formatting. These commands target
only `tests/bdd/requirements/**/*.feature`; historical material is excluded. Root lint
and formatting commands include these checks, and CI Quality enforces them.

Linting rejects duplicate feature names, duplicate scenario names within a feature,
duplicate tags, empty files/backgrounds, files without scenarios, unnamed
features/scenarios, outlines without examples, and unused outline variables.
Structural violations require manual correction, including when running `pnpm lint:fix`.
The linter also enforces its mandatory parser-safety rules. Optional prose, size,
tag-policy, step-order, and formatting rules are not enabled.

Prettier with the Gherkin plugin formats feature files using two-space indentation,
LF endings, and a 120-column preference, independently of other Prettier settings.
Staged active features are linted before formatting; only supplied staged filenames
are processed. Cucumber dry-run discovery remains necessary to validate parsing and
step bindings; neither linting nor formatting establishes runtime behavior.
