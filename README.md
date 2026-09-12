# Pre-ETS

A new service grounded in our client’s Pre-ETS operations.

## Setup

Use Node.js **24.21.0** (pinned in `.node-version`) and pnpm **11.26.0**
(pinned in `package.json`). Select that Node version with your preferred version
manager, then install pnpm if needed with `npm install --global pnpm@11.26.0`.
Run `pnpm install` from the repository root. For a reproducible installation, use
`pnpm install --frozen-lockfile`.

## Workspaces

- `packages/frontend` (`@pathableai/pre-ets-frontend`): future user interface.
- `packages/backend` (`@pathableai/pre-ets-backend`): future backend process.

Both are currently independent plain Node.js hello-world programs. First run `pnpm build` to compile both programs into their workspace `dist` directories.
Run them with
`pnpm start:frontend` and `pnpm start:backend`; each prints a greeting and exits.
All packages are private; the npm scope identifies ownership, not publication.

Next.js with PathAble React components and an Effect v4 backend are planned.
Frameworks and client workflows are not implemented yet.

## TypeScript

Run `pnpm typecheck` to check both packages without emitting files, and `pnpm build`
to compile them. Each workspace also exposes `build`, `typecheck`, and `start`;
for example, `pnpm --filter @pathableai/pre-ets-backend typecheck`. Rebuild after
source changes before starting the programs.

Both packages inherit `tsconfig.base.json`, modeled on the reference project's
Effect-style configuration. Strict checks apply equally to non-Effect code. Use
explicit `.js` extensions in relative imports for NodeNext compilation. Build
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
files are checked without a TypeScript project. Add package-specific extensions
in the owning workspace; keep common rules at the root.

## Fallow

Run `pnpm check:unused` for dead-code and dependency checks, or `pnpm fallow`
for full analysis including duplication and complexity. To compare changes with
an available Git base, use `pnpm fallow audit --base origin/main`.

The configuration explicitly identifies workspace source entrypoints because
start scripts run compiled output. ESLint configurations are discovered by
Fallow’s ESLint integration. Generated output is excluded, and unused dependencies
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
Each root command checks or formats top-level files first, then delegates to the
same script in every workspace. Each package owns a `dprint.json` with
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
allows only dprint’s required executable installation script. Generated output
and the pnpm lockfile are excluded. `renovate.json` uses JSONC-compatible syntax
to retain policy comments while allowing dprint formatting.
