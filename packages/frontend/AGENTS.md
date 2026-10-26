<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Frontend workspace guidance

Read the root [AGENTS.md](../../AGENTS.md) before changing this workspace.

## Effect

This workspace is the Next.js App Router application. It is not an Effect workspace.
Do not import `effect` or `@effect/*`. Do not add Effect workflows, services, or the
Effect language-service plugin here.

Tenant configuration, OIDC orchestration, temporary session state, and the shared
runtime live in [`frontend-services`](../frontend-services/AGENTS.md). Pages, layouts,
and React call that package. `src/instrumentation.ts` decides when the process boots
and then calls `startProductionRuntime`. Route files keep segment config and inject
presentation factories; they do not compose Effects.

Own presentation and the Next.js host. Do not move durable domain persistence or
business authorization into Redis, cookies, or this process; those belong in the
backend. Do not put services back in `src/lib`. That directory is absent. Do not
invent `src/features` or move `src/components` during ordinary work; aligning the
app with Bulletproof feature folders is a separate step.

When creating or editing UI that uses `@pathableai/react`, locate the installed
`@pathableai/react` package and read
`agent-guidance/pathable-react/SKILL.md` before making changes. Read only the
linked reference relevant to the task.

## Fallow boundaries

This workspace uses Fallow's Bulletproof preset. Read
[Fallow during development](../../docs/engineering/fallow.md) before adding
modules, imports, or source layout. Inspect the files you will change:

```sh
pnpm --filter @pathableai/pre-ets-frontend exec fallow guard src/components/onsite/visit-state.ts
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
