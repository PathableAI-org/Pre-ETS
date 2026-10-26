# Frontend services workspace guidance

Read the root [AGENTS.md](../../AGENTS.md) and
[Effect agent guidance](../../docs/engineering/effect-guidance.md) before Effect
work. Read the local Effect v4 checkout's `LLMS.md` and relevant linked examples/source,
then check this workspace's installed Effect types. Product pins come from the named
`effect` catalog in [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml).

Own the frontend process's Effect workflows: tenant configuration, OIDC orchestration,
temporary session state, process configuration, observability selection, and the shared
`ManagedRuntime`. The Next.js app starts that runtime from `instrumentation.ts` and
calls the exported handlers. This package may use `next/server`, `next/navigation`, and
`server-only` for those host adapters, including helpers that turn Effects into route
handlers and server actions. Import `next/server` and `next/navigation` without a
`.js` suffix. Next 16 has no package exports, and a `.js` specifier makes the Next
production build fail to load those modules. The workspace `tsconfig` maps those two
specifiers so NodeNext can typecheck them. Relative imports in this package still use
`.js`.

Do not import the Next.js app, React components, or `@pathableai/react`. Do not own
durable domain persistence or business authorization. Do not let the backend import
this package. Importing a module must not start the runtime; only
`startProductionRuntime` does, and only when the Next host calls it.

Keep the recursive module rule. A public entry such as `src/tenant.ts` owns
`src/tenant/`. Only that parent imports its children. Sibling modules and tests use
the public entry. Re-export a child only when a current consumer needs it.

This workspace does not configure Fallow architecture zones. Fallow will not report a
boundary violation for an import that breaks the ownership rules above. Follow the root
[Fallow workflow](../../docs/engineering/fallow.md) for unused code, complexity, and
changed-code audits. Do not add a Bulletproof preset here. Bulletproof layout of the
Next app is a separate step; do not invent `src/features` or move React components
while changing this package.

From the repository root, run:

- `pnpm --filter @pathableai/pre-ets-frontend-services lint`
- `pnpm --filter @pathableai/pre-ets-frontend-services typecheck`
- `pnpm --filter @pathableai/pre-ets-frontend-services test`
- `pnpm --filter @pathableai/pre-ets-frontend-services test:integration`
- `pnpm --filter @pathableai/pre-ets-frontend-services build`
