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

### Local Redis, Keycloak, and session setup

Start Redis and local Keycloak before exercising session setup or OIDC login
initiation. Apps stay on the host; Compose publishes loopback only. Keycloak
imports the tracked realm at `docker/keycloak/pre-ets-realm.json` on first boot.
Set `KC_BOOTSTRAP_ADMIN_USERNAME` and `KC_BOOTSTRAP_ADMIN_PASSWORD` in the shell
or a gitignored root `.env` (Compose fails if either is unset):

```sh
export KC_BOOTSTRAP_ADMIN_USERNAME=admin
export KC_BOOTSTRAP_ADMIN_PASSWORD=admin
docker compose up -d --wait redis keycloak
docker compose exec redis redis-cli ping
curl -sS -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:8080/realms/pre-ets/.well-known/openid-configuration
```

Copy `packages/frontend/.env.example` to `packages/frontend/.env.local`, keep
`TENANT_RESOLUTION=static`, set `REDIS_URL=redis://127.0.0.1:6379`, and generate
`SESSION_SIGNING_SECRET` with:

```sh
node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))'
```

Then `pnpm dev:frontend` and open `http://localhost:3000/` — expect Keycloak
login (`demo` / `demo`). Issuer:
`http://127.0.0.1:8080/realms/pre-ets`. See `docs/docker-compose.md`,
`docs/session-state.md`, and `docs/authentication.md`.

Stop with `docker compose down`. Never run `FLUSHALL` against shared Redis.
After editing the realm JSON, recreate Keycloak
(`docker compose up -d --force-recreate keycloak`) and restart the frontend.

### Local tenant resolution

Tenant Display Name and OIDC settings for this increment come from process
environment, not a database. Session continuity uses the local Redis service
above. Copy `packages/frontend/.env.example` to `packages/frontend/.env.local`
(gitignored) and restart after edits (including after Keycloak reprovision).

Host association (default, including omitted `TENANT_RESOLUTION`) uses
`TENANT_CONFIG_RECORDS_JSON` and `{slug}.localhost` locally or
`{slug}.pathable.com` in production. Bare `localhost`, unknown hosts, and
invalid hosts are refused with `forbidden()` (`Access denied.`, no redirect). Production never
reads `TENANT_RESOLUTION` or `TENANT_LOCAL_CONFIG_JSON`.
Unsupported mode values keep host association and log a safe `invalid-mode`
diagnostic to stderr.

Unauthenticated document visits to `/` initiate tenant-bound OIDC (or fail);
they do not serve Display Name landing content. See `.env.example` for
synthetic `oidc` fields and empty `OIDC_CLIENT_SECRETS_JSON`.

Development-only static mode (include valid `oidc` for login initiation):

```sh
TENANT_RESOLUTION=static \
TENANT_LOCAL_CONFIG_JSON='{"slug":"springfield","config":{"displayName":"Local Demo","oidc":{"issuer":"http://127.0.0.1:8080/realms/pre-ets","clientId":"springfield-web","clientAuth":"public","connection":"springfield-idp"}}}' \
pnpm dev:frontend
```

Open `http://localhost:3000/` and expect login initiation toward the local
issuer (or a documented failure page)—not Display Name landing. Invalid or
missing static data returns HTTP 500 with instructions to supply a valid
record and restart.

See `specs/001-tenant-resolution/quickstart.md` for the full validation
workflow.

An Effect v4 backend is planned. Client workflows beyond this landing page are
not implemented yet.

## TypeScript

Run `pnpm typecheck` to check both packages without emitting files, and `pnpm build`
to compile them. The frontend typecheck runs `next typegen` then `tsc`; its
build emits `.next`. The backend still uses `tsc` and a `dist` directory.
Each workspace also exposes `build`, `typecheck`, and `start`;
for example, `pnpm --filter @pathableai/pre-ets-backend typecheck`. Rebuild the
frontend after source changes before `pnpm start:frontend`.

Both packages inherit `tsconfig.base.json`, modeled on the reference project's
Effect-style configuration. Strict checks apply equally to non-Effect code. The
backend uses NodeNext compilation and explicit `.js` extensions in relative
imports. The frontend overrides those settings for the Next.js App Router
(`jsx: "preserve"`, DOM libs, and bundler module resolution). Backend build
configs enable emission and source maps without weakening type checks. Effect
and its language-service plugin are not installed.

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

Run `pnpm check:unused` for dead-code and dependency checks, or `pnpm fallow`
for full analysis including duplication and complexity. To compare changes with
an available Git base, use `pnpm fallow audit --base origin/main`.

The configuration uses glob entry points for workspace sources, unit tests, and
Cucumber support code because start scripts run compiled output: the backend
`dist` program and the frontend `.next` server. ESLint configurations are discovered by
Fallow’s ESLint integration. Generated output and Next.js `next-env.d.ts` are
excluded, and unused dependencies
remain errors. No public-library exemptions or blanket suppressions are enabled. The Fallow
configuration declares the four dprint plugins as tooling dependencies because
Fallow does not resolve their `npm:` references in `dprint.json`.

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
once at the repository root. This Fallow audit uses the `new-only` gate and
automatically resolves its comparison base from the upstream or default branch.
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
- Scaffold PR touching `features/` and `tests/bdd/` → **CI / BDD Dry** (and
  Quality when format/code paths match); **CI / Build** skips.
- Implementation PR changing `packages/` → Quality, Build, and Fallow run.

**CI / BDD** installs Chromium and runs production-first Cucumber partitions
(`pnpm test:bdd`). It runs on pushes to `main`, manual dispatch, and pull
requests labeled `ci:bdd`. Speckit scaffold PRs leave the label off so
intentionally failing stubs do not block merge. Do not require **CI / BDD** in
branch protection: a skipped required check blocks merge.

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
