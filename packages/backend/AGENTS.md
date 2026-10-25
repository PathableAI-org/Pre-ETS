# Backend workspace guidance

Read the root [AGENTS.md](../../AGENTS.md) and
[Effect agent guidance](../../docs/engineering/effect-guidance.md) before Effect
work. Read the local Effect v4 checkout's `LLMS.md` and relevant linked examples/source,
then check this workspace's installed Effect types. Keep runtime execution and shutdown
at the backend process host; pure transformations need no Effect wrapper. Product pins come from the named `effect` catalog in
[`pnpm-workspace.yaml`](../../pnpm-workspace.yaml).

Own the planned stateless RESTful Effect v4 domain service: business rules,
domain authorization, durable domain persistence, Effect services, workflows, and
implementation Layers. Depend on Effect and `@effect/platform-node` as declared
in this workspace. Do not import Next.js, React, Redis session state, or the
frontend workspace.

Importing an entrypoint must not start a runtime until the process host
intentionally boots. Keep broker token verification independent of the frontend
session cookie path. Do not grow a parallel session store or treat frontend
validation as durability.

Use the root Spec Kit project and constitution. Plans must name public operations,
service requirements, typed outcomes, validation locations, and concrete
implementation/test paths. Read [domain persistence](../../docs/domain-persistence.md)
and other affected strategy docs before designing features.

This workspace does not configure Fallow architecture zones. Fallow will not
report a boundary violation for an import that breaks the ownership rules above.
Follow the root [Fallow workflow](../../docs/engineering/fallow.md) for unused
code, complexity, and changed-code audits.

From the repository root, run:

- `pnpm --filter @pathableai/pre-ets-backend lint`
- `pnpm --filter @pathableai/pre-ets-backend typecheck`
- `pnpm --filter @pathableai/pre-ets-backend build`
- `pnpm --filter @pathableai/pre-ets-backend test`
