<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Frontend workspace guidance

Read the root [AGENTS.md](../../AGENTS.md) before changing this workspace.

## Effect

This workspace is Effect-first for agents. Before designing or modifying Effect
code, read [Effect agent guidance](../../docs/engineering/effect-guidance.md),
run `pnpm effect-solutions list` from the repository root, and verify APIs
against installed Effect **4.0.0-rc.113** types.

Own presentation, tenant configuration, OIDC orchestration, and temporary
session/UI state. Effect may be used for frontend workflows and adapters that
stay within that ownership. Do not move durable domain persistence or business
authorization into Redis, cookies, or this process; those belong in the backend.

When creating or editing UI that uses `@pathableai/react`, locate the installed
`@pathableai/react` package and read
`agent-guidance/pathable-react/SKILL.md` before making changes. Read only the
linked reference relevant to the task.

From the repository root, run:

- `pnpm --filter @pathableai/pre-ets-frontend lint`
- `pnpm --filter @pathableai/pre-ets-frontend typecheck`
- `pnpm --filter @pathableai/pre-ets-frontend test:unit`
- `pnpm --filter @pathableai/pre-ets-frontend build`
