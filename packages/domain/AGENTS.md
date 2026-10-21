# Domain workspace guidance

Read the root [AGENTS.md](../../AGENTS.md),
[Effect guidance](../../docs/engineering/effect-guidance.md), and
[testing guidance](../../docs/engineering/testing/README.md) before changing schemas.
Verify Effect APIs against this workspace's installed declarations.

Own reusable, host-independent domain schemas for frontend and backend consumers.
Do not import either application workspace, Next.js, Node HTTP, session state, or
database adapters. A schema describes the record shape; authentication, data
sources, and persistence are separate delivery boundaries.

Use Vitest with `TestSchema` from `effect/testing` for meaningful schema
behavior. These plain async tests do not need `@effect/vitest` or test Layers.

From the repository root, run:

- `pnpm --filter @pathableai/pre-ets-domain test`
- `pnpm --filter @pathableai/pre-ets-domain lint`
- `pnpm --filter @pathableai/pre-ets-domain typecheck`
- `pnpm --filter @pathableai/pre-ets-domain build`
