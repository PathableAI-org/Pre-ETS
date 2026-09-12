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

Both are currently independent plain Node.js hello-world programs. Run them with
`pnpm start:frontend` and `pnpm start:backend`; each prints a greeting and exits.
All packages are private; the npm scope identifies ownership, not publication.

Next.js with PathAble React components and an Effect v4 backend are planned.
Frameworks and client workflows are not implemented yet.
