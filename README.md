# Pre-ETS

A new service grounded in our client’s Pre-ETS operations.

## Setup

Use Node.js **24.21.0** (pinned in `.node-version`) and pnpm **12.4.1**
(pinned in `package.json`). Select that Node version with your preferred version
manager, then install pnpm if needed with `npm install --global pnpm@12.4.1`.
Run `pnpm install` from the repository root. For a reproducible installation, use
`pnpm install --frozen-lockfile`.

## Workspaces

- `packages/frontend` (`@pathableai/pre-ets-frontend`): Next.js 16 App Router
  application with PathAble React components.
- `packages/backend` (`@pathableai/pre-ets-backend`): future backend process.

The frontend is an SSR-first Next.js app. Run
`pnpm --filter @pathableai/pre-ets-frontend dev` or `pnpm dev:frontend` for
local development. `pnpm build` compiles the backend into `dist` and emits the
frontend production output into `.next`. After a production build,
`pnpm start:frontend` serves that Next.js output; `pnpm start:backend` still
prints a greeting and exits.
All packages are private; the npm scope identifies ownership, not publication.

### Local external services

Docker Compose provides Redis, Keycloak, and Postgres while the application
processes stay on the host. Copy the local environment template before starting
a service:

```sh
cp .env.example .env
```

In PowerShell, use `Copy-Item .env.example .env`. Generate two different
machine-specific passwords by running this command twice, then put one value in
`KC_BOOTSTRAP_ADMIN_PASSWORD` and the other in `POSTGRES_PASSWORD`:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Compose resolves required variables for the entire model, so both passwords
must be set even when starting only Redis and Keycloak or another subset of
services. It fails fast when either password is blank. Do not reuse these local
credentials in another environment, and do not pass the blank `.env.example`
directly to `docker compose`.

To start Postgres and apply the backend's synthetic migration demonstration:

```sh
docker compose up -d --wait postgres
docker compose --profile tools run --rm flyway migrate
docker compose --profile tools run --rm flyway validate
```

The Compose file and migrations are the shared setup; the local database is not
exposed as a public URL. See [Docker Compose for local development](docs/docker-compose.md)
for inspection, persistence, and reset commands.

#### Frontend pages

Redis and Keycloak are still defined in Compose. The frontend pages do not
need them. Run `pnpm dev:frontend` and open `http://localhost:3000/` for the
welcome page. `/auth/callback` renders the authentication-return fallback. The
proxy forwards both routes with the incoming headers and leaves cookies and
the response location unchanged. See `docs/authentication.md`. Optional local
OpenTelemetry + Grafana uses Compose profile `observability` (service
`otel-lgtm`); see `docs/observability.md`.

### Local tenant resolution

Copy `packages/frontend/.env.example` to `packages/frontend/.env.local`
(gitignored). Set `TENANT_CONFIG_DIR` to an absolute directory of `{alias}.json`
files, keep `TENANT_RESOLUTION=static`, and set `TENANT_STATIC_ALIAS` to the
alias of one of those files. Restart the frontend after editing `.env.local`
or a tenant file.

`GET /_test/tenant-config` returns the selected tenant JSON. Host mode requires
`BASE_HOSTNAME` and reads `{alias}.${BASE_HOSTNAME}`. See `docs/multi-tenancy.md`
and `packages/frontend/.env.example`.

```sh
pnpm dev:frontend
```

Open `http://localhost:3000/` for the welcome page.

An Effect v4 backend is planned. Client workflows beyond this landing page are
not implemented yet.

## Effect developer setup

Frontend and backend use Effect **4.0.0-rc.113** (coordinated with matching
`@effect/platform-node` on the backend). Both workspaces enable the Effect
language-service plugin and follow the Effect-first AI workflow; product
ownership is unchanged (frontend owns Next/OIDC/session; backend owns the
Effect REST domain layer).

After installing dependencies, read the bundled Effect Solutions topics from the
repository root:

```sh
pnpm install --frozen-lockfile
pnpm effect-solutions list
pnpm effect-solutions show project-setup tsconfig
pnpm effect-solutions show services-and-layers error-handling testing
```

The package script runs the pinned CLI through Node, bypassing its Bun shebang.
Its bundled executable supports macOS and Linux on x64/arm64 and provides offline
documentation. No global Bun installation is required. CLI examples must be
checked against installed **4.0.0-rc.113** types; its dependencies do not change
the product pin set. See [Effect agent guidance](docs/engineering/effect-guidance.md)
for coding boundaries.

Optionally clone Effect source for local examples and API reference (main / RC
tags matching the product pin):

```sh
mkdir -p ~/.local/share/effect-solutions
git clone --depth 1 --branch main \
  https://github.com/Effect-TS/effect.git \
  ~/.local/share/effect-solutions/effect-v4
```

If that directory already exists, inspect it or choose a different location rather
than overwriting it. Prefer the installed package declarations when docs disagree.

For VS Code/Cursor, select **TypeScript: Select TypeScript Version → Use Workspace
Version**. The repository's editor settings already point at the local SDK.
To also get Effect diagnostics from the compiler, manually patch the local
TypeScript installation and inspect the result:

```sh
pnpm exec effect-language-service patch
pnpm exec effect-language-service check
pnpm exec effect-language-service diagnostics --project packages/backend/tsconfig.json
pnpm exec effect-language-service diagnostics --project packages/frontend/tsconfig.json
```

The current workspaces share the root TypeScript installation. If that changes,
patch each Effect workspace's resolved installation with `patch --dir <path>`.
Repeat after TypeScript or language-service updates; restart the editor's TypeScript
server and clear affected `.tsbuildinfo` caches if diagnostics remain stale.
The upstream `check` command can exit successfully when unpatched, so confirm its
output reports both compiler modules patched. Errors block patched checks;
warnings and suggestions remain visible without blocking. Environment
verification is manual; installation continues to prepare Husky only.

For Effect workspace tooling, agent instructions, offline reference commands,
and editor setup, see [Effect development](docs/engineering/effect-guidance.md).

## TypeScript

Run `pnpm typecheck` to check both packages without emitting files, and `pnpm build`
to compile them. The frontend typecheck runs `next typegen` then `tsc`; its
build emits `.next`. The backend still uses `tsc` and a `dist` directory.
Each workspace also exposes `build`, `typecheck`, and `start`;
for example, `pnpm --filter @pathableai/pre-ets-backend typecheck`. Rebuild the
frontend after source changes before `pnpm start:frontend`.

Both packages inherit `tsconfig.base.json`, which extends `tsconfig.effect.json`.
Strict checks apply equally to non-Effect code. The backend uses NodeNext
compilation and explicit `.js` extensions in relative imports. The frontend
overrides those settings for the Next.js App Router (`jsx: "preserve"`, DOM libs,
and bundler module resolution) and keeps both the Next.js and Effect
language-service plugins. Backend build configs enable emission and source maps
without weakening type checks.

## ESLint

`pnpm lint` checks the root JavaScript files first, then delegates to each
workspace’s `lint` script. `pnpm lint:fix` follows the same sequence with automatic
fixes. Run a package independently with, for example,
`pnpm --filter @pathableai/pre-ets-frontend lint`.

Each package’s `eslint.config.js` imports the root configuration and sets its own
TypeScript project directory. Shared rules include strict and stylistic typed
checks, natural sorting, and consistent type imports. JavaScript configuration
files are checked without a TypeScript project. The frontend workspace adds
React Hooks and Next.js plugin rules plus browser globals for `*.tsx`. Add
package-specific extensions in the owning workspace; keep common rules at the
root.

## Fallow

Run `pnpm check:unused` for dead-code and dependency checks. The root command runs
`fallow:unused` in the root and every workspace in parallel, completing all scopes
and failing if any scope fails. Each workspace owns its `.fallowrc.json` and local
`fallow:unused` / `fallow:audit` scripts. Run a workspace independently with
`pnpm --filter @pathableai/pre-ets-frontend fallow:unused`.

The root configuration excludes `packages/**` and owns repository-level tests,
E2E/BDD support, and tooling. The backend configuration uses `src/index.ts` as its
runtime root and retains the existing `@effect/platform-node` dependency exception.
Frontend production code counts as live only when reachable from
Next.js framework entry points, including routes, layouts, proxy, and instrumentation.
Library files, ordinary helpers under `app`, and server-action modules must be
imported by reachable app code. Imports from unit tests or repository E2E/BDD
fixtures do not establish frontend production liveness.

Frontend production mode applies only to dead-code analysis, so audit health and
duplication checks still include frontend tests and tooling files. Backend and root
analysis retain their normal test/tooling reachability. No frontend source-directory
glob grants automatic liveness.

Run `pnpm fallow` for full analysis of root-owned files, or
`pnpm --filter @pathableai/pre-ets-frontend exec fallow` for full frontend analysis.
To audit all scopes against an available Git base, run
`FALLOW_AUDIT_BASE=origin/main pnpm check:changes`. CI uses the same dispatcher with
its event's base commit, so every scope compares against the same base.

The root configuration declares the dprint npm plugins and the Effect language-service
schema dependency as tooling references that Fallow does not resolve from their
configuration strings.

## Renovate

`renovate.json` follows the update policy in `next-level-preets`, including groups
for the anticipated Effect, React/Next, PathAble, lint, test, Docker, and GitHub
Actions dependencies. Rules for tools not yet installed remain inactive until
those dependencies exist. Node pins, Node types, and package engines are grouped.

Updates run outside office hours in America/New_York, with lockfile maintenance
on Saturdays between midnight and 4 a.m. The policy enables PR/platform automerge
for eligible updates; Effect, React/Next, PathAble, tests, Node, and major upgrades
require review. TypeScript major upgrades are disabled pending lint compatibility.

The Renovate GitHub App must have access to this repository. Platform automerge
also requires GitHub repository support and permission, and follows configured
branch protections and required checks. This tooling setup does not enable the
App, change GitHub settings, or establish CI/required checks. Configuration alone
does not activate Renovate or guarantee validated automatic merges.

Validate configuration without adding Renovate as a project dependency:

```sh
pnpm --package=renovate@44.82.3 dlx renovate-config-validator --strict --no-global renovate.json
```

On environments without Renovate’s optional native RE2 module, the validator
falls back to JavaScript regular expressions and warns that regex validation may
be less accurate. The initial strict repository-config validation passed using
that fallback; the custom Node regex is unchanged from the reference repository.

## Formatting

Run `pnpm format:check` to verify formatting or `pnpm format:write` to apply it.
Each root command checks or formats top-level files, `.github`, and `docs` first, then
delegates to the same script in every workspace. Each package owns a `dprint.json` with
`extends: "../../dprint.json"`, inheriting the root settings and plugins while allowing local
overrides. Run a package independently with
`pnpm --filter @pathableai/pre-ets-frontend format:check`.

The shared style follows Effect: two spaces, 120 columns, LF newlines, double
quotes, no optional semicolons, and no TypeScript trailing commas. ESLint and
Perfectionist own sorting; dprint preserves import and export order. After code
changes, run `pnpm lint:fix`, then `pnpm format:write`, and verify both checks.

The CLI and TypeScript/JavaScript, JSON/JSONC, Markdown, and YAML plugins are
pinned in pnpm and updated through Renovate’s lint-and-format group. Formatting
loads plugins from installed dependencies without fetching plugin versions. pnpm
allows only dprint’s required executable installation script. Generated output, Next.js `next-env.d.ts`, and the pnpm lockfile are excluded.
`renovate.json` uses JSONC-compatible syntax to retain policy comments while
allowing dprint formatting.

## Git hooks

Husky is installed at the repository root. `pnpm install` runs the `prepare` script
to configure Git to use `.husky/_`; hook definitions live in `.husky/`, and
generated launchers stay ignored. Run `pnpm prepare` to reinstall the hooks when
needed. No global Git configuration is changed.

The pre-commit hook runs `pnpm exec lint-staged` once from the repository root.
Each workspace’s `lint-staged.config.js` imports the root defaults. lint-staged
selects the nearest configuration for each staged file and runs tasks in that
configuration’s directory, so ESLint and dprint use the owning workspace’s settings.
Do not force a root `--config` or `--cwd`, or run separate lint-staged processes
per workspace.

Staged JavaScript and TypeScript files run through ESLint fixes, then dprint.
JSON/JSONC, Markdown, and YAML files run through dprint only; the generated pnpm
lockfile is excluded. The patterns do not overlap, so different tasks cannot edit
the same file concurrently. Tools receive staged filenames directly rather than
using the full-workspace lint and formatting scripts.

Successful fixes are staged automatically. lint-staged’s default backup, rollback,
and partial-staging protections remain enabled: unstaged changes to partially
staged files are hidden during checks and restored afterward. A failing task
blocks the commit. After lint-staged succeeds, the hook runs `pnpm check:changes`
once at the repository root. It runs root, frontend, and backend Fallow audits
in parallel with distinct gate markers. All use the `new-only` gate and automatically
resolve their comparison base from the upstream or default branch.
It checks the working tree, including restored unstaged and untracked changes,
so unfinished local work can block a commit. Error-severity findings and audit
runtime errors block the commit; warnings remain advisory.

Run `pnpm check:changes` to invoke the same audit manually. `prepare` remains
`husky`: the tracked hook defines the audit step, and installation does not run
Fallow’s hook installer. Builds and full typechecks remain separate checks.
`pnpm check:unused` remains available for full-repository dead-code checks.

## Continuous integration

CI is split across four workflows that run on every pull request, pushes to
`main`, and manual dispatch:

| Workflow                           | Required check names           | Role                                      |
| ---------------------------------- | ------------------------------ | ----------------------------------------- |
| `.github/workflows/ci-quality.yml` | **CI / Quality**               | Formatting, lint, types, frontend Vitest  |
| `.github/workflows/ci-build.yml`   | **CI / Build**                 | Package builds and backend greeting smoke |
| `.github/workflows/ci-bdd.yml`     | **CI / BDD Dry**, **CI / BDD** | Cucumber discovery; full suite when gated |
| `.github/workflows/ci-fallow.yml`  | **CI / Fallow**                | Unused code and new-finding audit         |

Shared install steps live in `.github/actions/setup-node-pnpm`.

On pull requests, each workflow detects changed paths with `dorny/paths-filter`
and skips expensive install/work when those paths are irrelevant. The named
checks still run and report success when skipped so required status checks are
not blocked. Pushes to `main` and `workflow_dispatch` always run the full work
for Quality, Build, BDD Dry, and Fallow.

Examples:

- Specs-only Speckit PR (`specs/**`, `.specify/**`) → required checks succeed
  without install/build/Cucumber.
- Acceptance changes touching `features/` or `tests/bdd/` → **CI / BDD Dry** and
  **CI / BDD** (plus Quality when format/code paths match).
- Implementation PR changing `packages/` → Quality, Build, and Fallow run.

**CI / BDD** builds the frontend, installs Chromium, and runs the capability suite
(`pnpm test:bdd`) on relevant pull requests, pushes to `main`, and manual dispatch.
Application, production-server and development-server partitions run serially; a failed partition
still allows later partitions to report. **CI / BDD Dry** reports discovery separately.
See [BDD commands and evidence](features/README.md). Sign-in browser specs are described in `e2e/README.md`.
Branch-protection settings are managed separately from this refactor.

CI uses the pinned Node and pnpm versions, a frozen lockfile, and pnpm store caching.
`HUSKY=0` skips local hook installation; CI invokes the full checks directly and
never fixes files. Root formatting includes workflow YAML in `.github` and Markdown in `docs`.

Fallow compares PRs against their base commit, pushes against the previous commit,
and manual runs against `HEAD^`. When no previous commit exists, the full-repository
check still runs. Missing nonempty base references are errors. Audit warnings are
advisory; failures and runtime errors fail the job.

The `Main CI checks` repository ruleset must require **CI / Quality**,
**CI / Build**, **CI / Fallow**, and **CI / BDD Dry**, plus an up-to-date branch,
before merging into `main`. Do **not** require **CI / BDD** on pull requests.
After changing workflows, update that ruleset’s required checks to match.
Organization rules continue to require pull requests and squash merges. GitHub
automerge remains disabled.

## Spec Kit

The repository includes Spec Kit 1.0.5 with one root workflow in `.specify/`.
The project constitution is [`.specify/memory/constitution.md`](.specify/memory/constitution.md).
Read it before specifying, planning, implementing, or reviewing a feature.

Core skills are installed for Codex in `.agents/skills` and for Cursor in
`.cursor/skills`. The installed assess, BDD, critique, and Git extensions have
Cursor skill entrypoints; `.specify/extensions.yml` records their workflow hooks.
The closed-vocabulary preset extends Cursor's analysis command to report
inconsistent enumerations across feature artifacts.

Run Spec Kit from the repository root. Set `SPECIFY_INIT_DIR` to this checkout's
root when invoking its scripts from another working directory. Start with
`speckit-specify`, clarify the requirements, then use `speckit-plan` and
`speckit-tasks` before implementation. The constitution defines the required
behavioral verification; installing the BDD extension does not make Gherkin
mandatory for every change.

Commit shared scripts, templates, skills, extension configuration, and the
constitution. Keep the current-feature pointer, local extension overrides, and
regenerable composition cache out of version control.

## Durable requirements

The [requirements register](docs/requirements/README.md) provides area templates, stable requirement IDs,
lifecycle and verification conventions, and the repository-local `requirements-author` and `requirements-review`
skills. It works independently of Spec Kit; existing feature specifications have not been migrated wholesale.

The [delivery planning workflow](docs/delivery/README.md) turns accepted criteria into reviewed issue proposals
using `delivery-plan`, `delivery-review`, and a delivery issue template. The tenant pilot remains a draft;
planning does not publish issues or establish verification.

## Testing practices

See [Testing as evidence](docs/engineering/testing/README.md) for choosing meaningful
verification and [Property-based testing](docs/engineering/testing/property-based-testing.md)
for designing properties and using fast-check with project examples.

## Browser E2E tests

Run `pnpm test:e2e` after starting the Compose stack. See the
[E2E guide](e2e/README.md) for setup, debugging, and coverage boundaries.
