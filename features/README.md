# Requirements BDD

Executable acceptance scenarios live under [`tests/bdd/requirements/`](../tests/bdd/requirements/).
They observe a running Next.js application over HTTP and in Chromium for missing-page presentation and real-provider delegation.
Tests never connect to Redis or other backing services directly; Compose (or CI services) may still run for the app process.

Before authoring or reviewing scenarios and their steps, read
[Requirements-backed BDD](../docs/engineering/testing/requirements-bdd.md). Reference requirements in current
`origin/main` using requirement-ID tags. Feature-level `@partial` describes intermediate evidence; those
scenarios still run and must pass. Review both scenario prose and step assertions within the approved promise.

The historical Spec Kit capability suite has been removed. Surviving dispositions for retired
scenarios remain in the [migration ledger](TRACEABILITY.md) (not an active runner).

## Run

From the repository root, start the tracked Keycloak realm and wait for discovery before successful initiation
scenarios. The runner never manages Compose. Redis may run for other application capabilities; initiation itself
does not use it:

```sh
docker compose up -d keycloak
curl --fail http://127.0.0.1:8080/realms/pre-ets/.well-known/openid-configuration
```

Install Chromium before runtime scenarios and the browser-routing harness checks:

```sh
pnpm test:bdd:dry
pnpm exec playwright install chromium
pnpm test:bdd
```

`REDIS_URL` defaults to `redis://127.0.0.1:6379` for the owned Next process. Each scenario owns a
temporary tenant directory and explicit callback origins/loopback permission. Cleanup removes only that
scenario's resources. The registered `http://springfield.localhost:3000` and
`http://shelbyville.localhost:3000` callback origins do not follow Next's random transport port or logical
`example.test` request Hosts. Success scenarios require the tracked real Keycloak clients. They stop at
provider arrival; callback validation, recoverable correlation, stored sessions and verified freshness remain
incomplete. Diagnostics, raw root routing and tenant rejection need no reachable provider.

| Command                | Evidence                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `pnpm test:bdd:dry`    | Parse features and discover step bindings; no runtime evidence                        |
| `pnpm test:bdd`        | Build the frontend, then run HTTP and browser scenarios against an owned Next process |
| `pnpm test:bdd:checks` | Harness regression checks that still protect fixtures used by BDD/E2E                 |
| `pnpm test:e2e`        | Separate real-Keycloak authentication journeys; see [E2E setup](../e2e/README.md)     |

After a frontend build, `pnpm test:bdd:smoke` runs the separate application-level
[on-site production safeguard](../tests/bdd/smoke/onsite-production.feature).
It is not requirements-backed evidence or a test of production ingress blocking.

Optional `@development` selects `next dev`; otherwise scenarios use production `next start`.
`pnpm test:bdd` builds the frontend first so that production output matches the installed Next.js.
Dependency tags such as `@redis` are not required—the app receives `REDIS_URL`
whenever the harness starts it.

Steps use unfollowed HTTP for status/content claims: root 307 is separate from the tenant-dependent login
response. Chromium follows native redirects through a scoped proxy that preserves application Hosts and leaves
external provider destinations intact; it establishes missing-page presentation and real provider arrival.
Permission-denial scenarios require a non-root user and a filesystem that enforces Unix permissions;
the setup checks that access is actually denied before asserting an application response.
See [step guidance](../tests/bdd/steps/README.md).

CI provisions the pinned real Keycloak realm with bounded readiness and cleanup. It runs requirements BDD
and the production safeguard smoke nightly at 06:17 UTC on `main`.
Manual dispatch is also restricted to `main`; there is no CI dry-run job. Real-Keycloak E2E stays manual.

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
