# Frontend services workspace guidance

Read the root [AGENTS.md](../../AGENTS.md) and
[Effect agent guidance](../../docs/engineering/effect-guidance.md) before Effect
work.

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

Do not add React UI, and do not import the Next.js app, React components, or
`@pathableai/react`. Do not own
durable domain persistence or business authorization. Do not let the backend import
this package. Importing a module must not start the runtime; only
`startProductionRuntime` does, and only when the Next host calls it.

Process settings follow
[Configuration is decoded once at startup](../../docs/engineering/effect-guidance.md#configuration-is-decoded-once-at-startup):
`src/runtime.ts` parses `StartupConfig` from `src/config/`, and lint rejects a
`Config` or `ConfigProvider` read anywhere else.

The root [module boundaries](../../AGENTS.md#module-boundaries) apply; for example,
`src/tenant.ts` owns `src/tenant/`.

Next host adapters live in `src/next.ts`, which owns `src/next/` (login, callback,
cookies, session and tenant reads, and the tenant-failure HTTP mapping). Only that
module imports `next/server` or `next/navigation`; services stay framework-free, and
lint enforces it. Process settings live in `src/config.ts`, which owns `src/config/`.

This workspace configures custom Fallow boundary zones (`entry`, `next`, `runtime`,
`services`, `config`, `shared`, `tests`, `tooling`) with `requireAllFiles`; see
[frontend-services zones](../../docs/engineering/fallow.md#frontend-services-zones).
Run `pnpm --filter @pathableai/pre-ets-frontend-services exec fallow architecture --boundaries`
when adding a module. A new file must join a zone. Do not add a Bulletproof preset
here; the Next app owns Bulletproof feature folders.

From the repository root, run:

- `pnpm --filter @pathableai/pre-ets-frontend-services lint`
- `pnpm --filter @pathableai/pre-ets-frontend-services typecheck`
- `pnpm --filter @pathableai/pre-ets-frontend-services test` (session scenarios need Redis at `REDIS_URL`,
  default `redis://127.0.0.1:6379`)
- `pnpm --filter @pathableai/pre-ets-frontend-services test:integration`
- `pnpm --filter @pathableai/pre-ets-frontend-services build`
