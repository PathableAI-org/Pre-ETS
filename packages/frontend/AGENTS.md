<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Frontend workspace guidance

Read the root [AGENTS.md](../../AGENTS.md) before changing this workspace.

## Effect

This workspace is Effect-first for agents. Before designing or modifying Effect
code, read [Effect agent guidance](../../docs/engineering/effect-guidance.md),
then the local Effect v4 checkout's `LLMS.md` and relevant linked examples/source.
Verify APIs against this workspace's installed Effect types. Keep React components,
pure transformations, and Next.js host adapters idiomatic; execute application Effects
through the host's shared runtime. Product pins come from the named
`effect` catalog in [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml).

Own presentation, tenant configuration, OIDC orchestration, and temporary
session/UI state. Effect may be used for frontend workflows and adapters that
stay within that ownership. Do not move durable domain persistence or business
authorization into Redis, cookies, or this process; those belong in the backend.

When creating or editing UI that uses `@pathableai/react`, locate the installed
`@pathableai/react` package and read
`agent-guidance/pathable-react/SKILL.md` before making changes. Read only the
linked reference relevant to the task.

## Fallow boundaries

This workspace uses Fallow's Bulletproof preset. Read
[Fallow during development](../../docs/engineering/fallow.md) before adding
modules, imports, or source layout. Inspect the files you will change:

```sh
pnpm --filter @pathableai/pre-ets-frontend exec fallow guard src/lib/tenant.ts
```

Follow the zone and allowed directions that command reports.

A directory name does not by itself grant a permission. Files outside every
zone are unrestricted for imports. `src/instrumentation.ts` and `src/proxy.ts`
are the configured unmatched exemptions. `fallow guard` reports when a
reachable file with no zone fails boundary coverage.

The recursive module rule in the root [AGENTS.md](../../AGENTS.md) still
applies. Bulletproof allows same-zone imports, so an import of a private child
can pass Fallow and still violate that rule. When a finding is a preset
mismatch, keep the current layout, explain the conflict, and ask for human
review.

From the repository root, run:

- `pnpm --filter @pathableai/pre-ets-frontend lint`
- `pnpm --filter @pathableai/pre-ets-frontend typecheck`
- `pnpm --filter @pathableai/pre-ets-frontend test:unit`
- `pnpm --filter @pathableai/pre-ets-frontend build`
