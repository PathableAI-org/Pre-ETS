# Pre-ETS

A new service grounded in our client’s Pre-ETS operations.

## Setup

Use the Node.js version pinned in [`.node-version`](.node-version) and the pnpm
version declared by `packageManager` in [`package.json`](package.json). Select that
Node version with your preferred version manager, then install the declared pnpm
version if needed.
Run `pnpm install` from the repository root. For a reproducible installation, use
`pnpm install --frozen-lockfile`.

## Workspaces

- `packages/frontend` (`@pathableai/pre-ets-frontend`): Next.js 16 App Router
  application with PathAble React components.
- `packages/backend` (`@pathableai/pre-ets-backend`): independent Effect HTTP process.
- `packages/domain` (`@pathableai/pre-ets-domain`): shared, host-independent Effect
  schemas. Applications depend on it when they use those contracts.

The frontend is an SSR-first Next.js app. Run
`pnpm --filter @pathableai/pre-ets-frontend dev` or `pnpm dev:frontend` for
local development. `pnpm build` compiles the backend into `dist` and emits the
frontend production output into `.next`. After a production build,
`pnpm start:frontend` serves that Next.js output. After building, run
`pnpm start:backend` to serve `GET http://127.0.0.1:3001/healthz` (HTTP 200,
`ok`). Set `BACKEND_PORT` to an integer from 1 to 65535 to change the local
port; an invalid value prevents startup. The backend binds to `127.0.0.1` and
stops on process shutdown. `/healthz` reports process liveness only: it does
not check the database or establish readiness for domain requests. The backend
does not expose visit endpoints by default.

The synthetic on-site create route is disabled by default. For local development
only, apply the backend Flyway migrations to an isolated Postgres database, set
`NODE_ENV=development`, `BACKEND_ENABLE_DEV_VISIT_WRITE=true`, and a local
`BACKEND_DATABASE_URL` in the backend process environment, then start the backend.
The listener remains bound to `127.0.0.1`; setting the flag outside development
prevents startup. Never proxy or deploy this unauthenticated route, or put real
participant information in it. Until backend identity and authorization are
designed, `coachId`, `tenantId`, and `participantRef` must be synthetic-prefixed
placeholders, not verified identities. Do not commit database credentials.

`POST http://127.0.0.1:3001/visits` accepts JSON with those three references and
an explicit UTC `startedAt` string; `endedAt` and each of `purposeOfVisit`,
`observations`, `interventions`, and `nextSteps` are optional. It returns `201`
with only `{ "id": "<database-generated UUID>" }` after the insert succeeds,
`400` for invalid input, or `500` for a database failure. There is no read
endpoint, verified ownership, or automatic retry. This local experiment does
not fulfill the authorized visit workflow in issue #195.
The create route also rejects nonlocal `Host` or `Origin` headers and requests
without a JSON content type before reading the body or invoking the store.

All packages are private; the npm scope identifies ownership, not publication.

### On-site progress report feedback prototype

Use the existing static tenant settings to start the frontend without changing
its startup runtime. In PowerShell, from the repository root:

```powershell
$env:TENANT_RESOLUTION = 'static'
$env:TENANT_CONFIG_DIR = (Resolve-Path -LiteralPath 'fixtures/tenant-config').Path
$env:TENANT_STATIC_ALIAS = 'springfield'
$env:OTEL_SDK_DISABLED = 'true'
corepack pnpm --filter @pathableai/pre-ets-frontend exec next dev --hostname 127.0.0.1
```

Open `http://127.0.0.1:3000/_test/onsite` to review a sample electronic version
of the on-site job-coaching progress report and service log. This explicitly
public preview uses the existing `/_test/*` exception, is available only in
development, and requires a valid selected tenant. It needs no Docker, Redis,
or Keycloak. Equivalent local settings may live in the gitignored
`packages/frontend/.env.local` instead.

The form uses synthetic example information and an interactive visit timer for
visual feedback. Edits are browser-only and disappear on reload. Its duration
display is a demo estimate, not an approved service-hours calculation; typed
signature placeholders do not sign or submit a report. Do not enter real
participant information.

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

The root asks the session-presence service before tenant lookup and redirects to
`/auth/login`. That public page resolves the tenant and prepares an OIDC code request
with PKCE, state, nonce and `max_age=0`, then redirects to the selected provider.
Start Redis and Keycloak for the tracked synthetic tenant fixtures:

```sh
docker compose up -d --wait redis keycloak
curl --fail http://127.0.0.1:8080/realms/pre-ets/.well-known/openid-configuration
```

Set `OIDC_CALLBACK_ORIGINS_JSON` and the local-only
`OIDC_ALLOW_INSECURE_LOOPBACK=true` in the frontend environment as described in
[authentication](docs/authentication.md). Then run `pnpm dev:frontend` and open
`http://localhost:3000/`. Login stores a bounded, one-time recovery attempt in Redis
before redirect and writes only an opaque callback-path correlation cookie. A validated
callback returns an empty 204 and clears correlation; it still creates no authenticated
application session or protected access. Public diagnostics and the development preview
remain independent of provider availability, but production frontend readiness now
requires Redis. Requirements BDD needs both Redis and the real Keycloak realm; its
main-only nightly/manual job provisions both dependencies after building.

Optional local OpenTelemetry + Grafana uses Compose profile `observability`
(service `otel-lgtm`); see [observability](docs/observability.md).

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

Open `http://localhost:3000/` to begin tenant-specific OIDC initiation.

The Effect v4 backend currently exposes a liveness route. Authenticated client
workflows are not implemented yet.

## Effect developer setup

Frontend, backend, and domain use the coordinated Effect pins in the named
`effect` catalog in [`pnpm-workspace.yaml`](pnpm-workspace.yaml). All three
workspaces enable the Effect language-service plugin; product ownership is
unchanged (frontend owns Next/OIDC/session, backend owns the Effect REST domain
layer, and domain owns reusable schemas).

Install dependencies from the repository root:

```sh
pnpm install --frozen-lockfile
```

Read the available local Effect v4 checkout's `LLMS.md`, then its task-relevant linked
examples/source. A common local path is `~/.local/share/effect-solutions/effect-v4`.
Check its revision and verify APIs against the owning workspace's installed Effect
declarations/source: a local checkout may be ahead of the installed version. Use
official external documentation only for local gaps. See
[Effect agent guidance](docs/engineering/effect-guidance.md) for source precedence,
the topic index, and conventions covering Effect and non-Effect application code.

If no suitable checkout is available, optionally clone source at the tag matching
the installed frontend Effect version:

```sh
effect_tag="effect@$(node -p "require('./packages/frontend/node_modules/effect/package.json').version")"
mkdir -p ~/.local/share/effect-solutions
git clone --depth 1 --branch "$effect_tag" \
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

Agent workflow, architectural boundaries, and the command reference live in
[Fallow during development](docs/engineering/fallow.md). Shared configuration
uses semantic duplication mode. Similar-code review is advisory and is documented
there.

Run `pnpm check:unused` for dead-code, dependency, and architecture findings, and
`pnpm check:health` for function complexity. Each root command runs the matching
`fallow:unused` or `fallow:health` script in the root and every workspace in
parallel, completing all scopes and failing if any scope fails. Each workspace
owns its `.fallowrc.json` and local `fallow:unused`, `fallow:health`, and
`fallow:audit` scripts. Run a workspace independently with
`pnpm --filter @pathableai/pre-ets-frontend fallow:unused`.

The root configuration excludes `packages/**` and owns repository-level tests,
BDD support, and tooling. The backend configuration uses `src/main.ts` as its
runtime root and follows its import of the `src/index.ts` application routes.
Frontend production code counts as live only when reachable from
Next.js framework entry points, including routes, layouts, proxy, and instrumentation.
Library files, ordinary helpers under `app`, and server-action modules must be
imported by reachable app code. Imports from unit tests or repository BDD
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

Shared Fallow configuration enables type-aware analysis for every scope. Each scope
uses its own `tsconfig.json` in best-effort mode: root tests, and the frontend,
backend, and domain typecheck projects. Compiler-option bases and package emit
configs stay out of that pass. Type-aware analysis confirms symbol use for Fallow
findings. It does not replace `pnpm typecheck`. When the checker result is partial
or unavailable, the original finding remains and is not evidence that the symbol
can be deleted. The `private-type-leaks` rule stays off, so that advisory API
check is not part of `pnpm check:unused`.

## Renovate

`renovate.json` follows the update policy in `next-level-preets`, including groups
for Effect, React/Next, PathAble, ESLint, dprint, Prettier, Git hooks,
OpenTelemetry, tests, Docker, and GitHub Actions dependencies. Rules for tools not
yet installed remain inactive until
those dependencies exist. Node pins, Node types, and package engines are grouped.

Updates run outside office hours in America/New_York, with lockfile maintenance
on Saturdays between midnight and 4 a.m. All Renovate PRs, including major upgrades
and lockfile maintenance, are eligible for squash automerge after checks pass.
Renovate performs the merge on a subsequent run after the branch is up to date
and all reported checks pass (`platformAutomerge: false`, `ignoreTests: false`),
including checks that GitHub does not require. TypeScript major upgrades remain
disabled pending lint compatibility.

Non-major ESLint updates include TypeScript, `typescript-eslint`, ESLint plugins,
and `globals` so the compiler and lint integrations can be reviewed together.
The `typescript-eslint` umbrella package owns its matching parser and plugin
versions. dprint and its plugins, Prettier and its plugins, and Git hook tooling
have separate update groups. OpenTelemetry API, SDK, experimental packages,
instrumentation, and semantic conventions share one group, including majors, so
a single release line is updated together. `@effect/opentelemetry` remains in
the Effect group. Version ceilings keep that group inside the installed
wrapper's peer ranges: `@opentelemetry/api` below 1.10.0, experimental packages
below 0.300.0, the stable SDK below 3.0.0, and semantic conventions below 2.0.0.
Remove the ceilings in the change that adopts a wrapper whose peers accept the
next SDK, once the frontend no longer depends on `@opentelemetry/sdk-trace-base`,
`sdk-trace-node`, or `sdk-trace-web`. React/Next and Vite/Vitest retain their existing
groups, including Vitest companion packages.

Node types remain declared at the root and grouped with the Node runtime. Keep
the types major aligned with the supported runtime. A catalog does not constrain
transitive dependency resolutions; add a scoped override only when a concrete
compatible dependency edge needs it.

npm updates wait one day plus a one-hour publication buffer before becoming
eligible. pnpm enforces the one-day release age for direct and transitive
dependencies; Renovate runs `pnpm dedupe` after lockfile updates. An independently
published transitive dependency can still delay installation. Wait for it to age
instead of routinely adding release-age exceptions.

The named `effect` catalog in `pnpm-workspace.yaml` owns exact versions for core
Effect and its runtime/test integrations. Workspace manifests reference
`catalog:effect`. Review the catalog entries together: grouping does not guarantee
peer compatibility, and pnpm rejects incompatible peers. Integration updates must
wait until a compatible core release is published. The parent-specific override in
`pnpm-workspace.yaml` keeps the Node integration on its matching shared-platform
implementation; its declared range otherwise admits shared-platform releases with
incompatible core peers. Reassess this override when updating the Node package.

Release-age exceptions should be temporary and version-specific. Remove an
exception once its release has aged sufficiently. `minimumReleaseAgeExcludePrune`
automatically removes versions no longer resolved by the written lockfile; it does
not remove exceptions just because their releases have aged. Keep the existing
lockfile when updating dependencies and let pnpm regenerate it.

The Renovate GitHub App must have access and merge permission for this repository.
Renovate-managed automerge respects branch rules and does not require GitHub's
repository auto-merge setting. Keep CI and required-check rules configured;
Renovate's [automerge documentation](https://docs.renovatebot.com/key-concepts/automerge/)
describes merge prerequisites and troubleshooting. The policy takes effect once
`renovate.json` is merged into the default branch.

Validate configuration without adding Renovate as a project dependency. The command
pins a mature validator release so validation is reproducible:

```sh
pnpm --package=renovate@44.145.3 dlx renovate-config-validator --strict --no-global renovate.json
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

On Windows, Git's `core.autocrlf=true` may check out tracked LF files with CRLF
endings. In that case, `pnpm format:check` can report "Text differed by line
endings" even for untouched files. Use an LF-preserving checkout for the full
check; `pnpm exec dprint check <changed-file>` can help distinguish changes to
your files from this checkout issue. Do not commit unrelated line-ending churn.

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
once at the repository root. It runs root, frontend, backend, and domain Fallow
audits in parallel with distinct gate markers. All use the `new-only` gate and automatically
resolve their comparison base from the upstream or default branch.
It checks the working tree, including restored unstaged and untracked changes,
so unfinished local work can block a commit. Error-severity findings and audit
runtime errors block the commit; warnings remain advisory.

Run `pnpm check:changes` to invoke the same audit manually. `prepare` remains
`husky`: the tracked hook defines the audit step, and installation does not run
Fallow’s hook installer. Builds and full typechecks remain separate checks.
`pnpm check:unused` and `pnpm check:health` remain the full-scope dead-code and
complexity checks.

## Continuous integration

Quality, Build, and Fallow run on every pull request, pushes to `main`, and manual dispatch.
BDD runs nightly at 06:17 UTC on `main` and can also be dispatched manually on `main`.

| Workflow                           | Check name       | Role                                                    |
| ---------------------------------- | ---------------- | ------------------------------------------------------- |
| `.github/workflows/ci-quality.yml` | **CI / Quality** | Formatting, lint, types, frontend Vitest                |
| `.github/workflows/ci-build.yml`   | **CI / Build**   | Package builds, backend HTTP tests and health smoke     |
| `.github/workflows/ci-bdd.yml`     | **CI / BDD**     | Nightly requirements BDD and production safeguard smoke |
| `.github/workflows/ci-fallow.yml`  | **CI / Fallow**  | Unused code, complexity, and new-finding audit          |

Shared install steps live in `.github/actions/setup-node-pnpm`.

On pull requests, Quality, Build, and Fallow detect changed paths with `dorny/paths-filter`
and skip expensive install/work when those paths are irrelevant. The named checks still run
and report success when skipped so required status checks are not blocked. Pushes to `main`
and `workflow_dispatch` always run the full work for those three workflows.

**CI / BDD** runs harness checks, installs Chromium, builds the frontend, and executes
`pnpm exec cucumber-js --config cucumber.mjs` followed by `pnpm test:bdd:smoke`. After a
successful build, the smoke check still runs if requirements scenarios fail, unless the job
is cancelled. A failure in either suite fails the job. It runs only on `main`, without path
filtering, and preserves runtime reports and failure diagnostics. There is no CI dry-run job.
See [BDD commands and evidence](features/README.md).

CI uses the pinned Node and pnpm versions, a frozen lockfile, and pnpm store caching.
`HUSKY=0` skips local hook installation; CI invokes the full checks directly and
never fixes files. Root formatting includes workflow YAML in `.github` and Markdown in `docs`.

Fallow compares PRs against their base commit, pushes against the previous commit,
and manual runs against `HEAD^`. When no previous commit exists, the full-repository
check still runs. Missing nonempty base references are errors. Audit warnings are
advisory; failures and runtime errors fail the job.

The `Main CI checks` repository ruleset must require **CI / Quality**,
**CI / Build**, and **CI / Fallow**, plus an up-to-date branch,
before merging into `main`. BDD checks are not required for merging.
Organization rules continue to require pull requests and squash merges. GitHub
automerge remains disabled.

## Spec Kit

The repository includes Spec Kit 1.2.3 with one root workflow in `.specify/`.
The project constitution is [`.specify/memory/constitution.md`](.specify/memory/constitution.md).
Read it before specifying, planning, implementing, or reviewing a feature.

Core skills are installed for Codex in `.agents/skills`. The installed assess, BDD,
critique, and Git extensions also provide skills; `.specify/extensions.yml` records
their workflow hooks.
The closed-vocabulary preset extends the analysis command to report
inconsistent enumerations across feature artifacts.

The project-owned
[`pre-ets-specification-planning`](.specify/presets/pre-ets-specification-planning/README.md)
preset composes with the upstream specification, clarification, planning, task,
constitution, and checklist commands. It enforces one delivery issue per feature,
read-only requirement/delivery
authorities, a first-class `verification.md`, and consumer-inward planning in this order:
module architecture, public TypeScript contracts, contract evidence, then private
implementation. The project workflow overlay inserts clarification and review gates for
the added artifacts without modifying the upstream workflow definition.

Run Spec Kit from the repository root. Set `SPECIFY_INIT_DIR` to this checkout's
root when invoking its scripts from another working directory. A delivery-issue
feature follows the [Git and pull request workflow](docs/engineering/git-workflow.md):
specify and clarify on one pull request, review the engineering plan on the next,
and implement on a following pull request. Use `speckit-stack` to keep those
pull requests stacked. Start with `speckit-specify` using exactly one authorized
delivery issue. Specification produces `spec.md` and `verification.md`; planning
produces `contracts/modules.md` and a planned `quickstart.md`. The constitution
defines the required behavioral verification; installing the BDD extension does
not make Gherkin mandatory for every change.

Commit shared scripts, templates, preset sources and registry, CLI-generated effective
skills, workflow overlays, extension configuration, and the constitution. Keep the
current-feature pointer, local extension overrides, and regenerable preset composition
caches out of version control.

The [Upgrade Spec Kit workflow](.github/workflows/speckit-upgrade.yml) checks for
the latest stable release every Monday at 14:00 UTC. It upgrades installed
integrations and extensions, then opens or refreshes `automation/speckit-upgrade`
with changes to `.specify/` and `.agents/skills/`. Project behavior belongs in presets,
workflow overlays, the constitution, and repository guidance rather than direct edits
to upstream-managed command or template files. The upgrade can regenerate effective
skills while retaining those project-owned layers. Review the composed diff before
merging. Use **Run workflow** in GitHub Actions to check immediately or supply a
specific release tag through `specify_version`.

## Durable requirements

The [requirements register](docs/requirements/README.md) provides a single-requirement template, stable requirement IDs,
Git/PR approval and external-evidence conventions, and the repository-local `requirements-author` and `requirements-review`
skills. It works independently of Spec Kit; existing feature specifications have not been migrated wholesale.

The [delivery planning workflow](docs/delivery/README.md) turns accepted criteria into reviewed issue proposals
using `delivery-plan`, `delivery-review`, and a delivery issue template. The tenant pilot remains a draft;
planning does not publish issues or establish verification.

## Testing practices

See [Testing as evidence](docs/engineering/testing/README.md) for choosing meaningful
verification and [Property-based testing](docs/engineering/testing/property-based-testing.md)
for designing properties and using fast-check with project examples.

## End-to-end tests

Requirements BDD scenarios under [`tests/bdd/requirements/`](tests/bdd/requirements/) observe the
running application through HTTP and Chromium. Real Keycloak is provisioned and exercised by
`pnpm test:bdd` and the nightly [`CI / BDD`](.github/workflows/ci-bdd.yml) job.
Run `pnpm test:bdd:dry` to validate feature discovery, then follow the
[BDD commands guide](features/README.md) for provider and environment setup.

The `playwright` library drives Chromium inside Cucumber steps; it is not invoked
through a separate Playwright Test runner. BDD replaces the old `pnpm test:e2e`
command, which has been removed.
