# Domain workspace guidance

Read the root [AGENTS.md](../../AGENTS.md),
[Effect guidance](../../docs/engineering/effect-guidance.md), and
[testing guidance](../../docs/engineering/testing/README.md) before changing schemas.
Verify Effect APIs against this workspace's installed declarations.

Own reusable, host-independent domain schemas for frontend and backend consumers.
Do not import the frontend, frontend-services, or backend workspaces, Next.js, Node
HTTP, session state, or database adapters. A schema describes the record shape;
authentication, data sources, and persistence are separate delivery boundaries.

Use Vitest with `TestSchema` from `effect/testing` for meaningful schema
behavior. These plain async tests do not need `@effect/vitest` or test Layers.

This workspace does not configure Fallow architecture zones. Fallow will not
report a boundary violation for an import of an application workspace.
Follow the root [Fallow workflow](../../docs/engineering/fallow.md) for unused
code, complexity, and changed-code audits.

From the repository root, run:

- `pnpm --filter @pathableai/pre-ets-domain test`
- `pnpm --filter @pathableai/pre-ets-domain lint`
- `pnpm --filter @pathableai/pre-ets-domain typecheck`
- `pnpm --filter @pathableai/pre-ets-domain build`
