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
