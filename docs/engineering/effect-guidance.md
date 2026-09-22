# Effect development and agent setup

Applies to `packages/frontend`, `packages/backend`, and future workspaces that
enable the Effect language-service plugin and extend `tsconfig.effect.json`
(via `tsconfig.base.json` or directly). Root tooling and Cucumber support code
remain outside the Effect-first AI workflow unless they explicitly opt in.

## Before writing Effect code

Follow the [README developer setup](../../README.md#effect-developer-setup),
then run `pnpm effect-solutions list` and read only the topics relevant to your
change. Verify examples against installed Effect declarations (currently
**4.0.0-rc.113**). Do not run the CLI's interactive setup to rewrite this
monorepo. `open-issue` sends external feedback and requires explicit user
authorization.

Source precedence:

1. Repository contracts and the installed workspace's declarations are authoritative.
2. Use the matching Effect v4 source (main / tagged RC) for implementation details
   and examples.
3. Use Effect Solutions for patterns, checking every API against installed types.

Product workspaces currently use **Effect 4.0.0-rc.113** (coordinated with
`@effect/platform-node` at the same pin). Allowed installed-truth APIs include
`Context.Service` and `Schema.TaggedError`. Do not expand into unrelated
`effect/unstable/*` modules unless a later plan authorizes a specific surface.
Report documentation drift instead of inventing APIs or weakening contracts to
fit an example.

## Coding boundaries

- Follow the root constitution and workspace ownership in
  [domain persistence](../domain-persistence.md),
  [session state](../session-state.md),
  [authentication](../authentication.md), and
  [multi-tenancy](../multi-tenancy.md). Frontend owns presentation, tenant
  configuration, OIDC orchestration, and temporary session/UI state. Backend
  owns business rules, domain authorization, and durable domain records as a
  stateless RESTful Effect service. Do not move domain persistence into Redis
  or session drafts into the backend.
- Express business operations as Effects with explicit success, typed error, and
  service requirements. Model expected failures with tagged errors; keep defects
  distinct from recoverable failures.
- Use explicit readonly service interfaces and Layer implementations. Acquire
  implementation dependencies in Layers and preserve existing public interfaces.
- Use `Effect.gen` for sequential composition and `Effect.fn` where its tracing
  and function shape fit the contract. Avoid converting operations to Promises
  inside business workflows or executing Effects merely to construct adapters.
- Decode external input through schemas at the actual trust or persistence
  boundary. Passing an already validated value between modules does not require
  another decode. Keep wire formats and established response/error mappings
  stable.
- Compose shared Layers at process boundaries. Preserve resource scope and Layer
  identity; do not mechanically merge sequential provides when one supplies
  dependencies of another.
- Prefer deterministic test Layers for Effect behavior. Cover failures and
  cleanup as well as success. Do not adopt `@effect/vitest` unless a later plan
  authorizes it.
- Keep runtime startup, disposal, and long-lived execution at the process host
  entrypoint for each workspace. Importing library modules must remain safe
  without starting a runtime.

## Workspace configuration

`tsconfig.effect.json` shares strict NodeNext/no-emit compiler settings.
`tsconfig.base.json` extends it. Frontend and backend enable the Effect
language-service plugin in their own configs (frontend keeps the Next.js plugin
alongside it). New Effect workspaces should extend the base, add the plugin,
provide their own include globs and types, and route agents here.

The plugin keeps default severities with `ignoreEffectWarningsInTscExitCode: true`.
After a developer manually patches TypeScript, errors block checks while warnings
and suggestions remain visible without blocking. There is no automatic compiler
patching or tooling verification in installation, Docker, or CI. Developers verify
their environment manually using the README commands.

## References

- [Effect Solutions setup](https://www.effect.solutions/project-setup)
- [Effect Solutions TypeScript guidance](https://www.effect.solutions/tsconfig)
- [Language service](https://github.com/Effect-TS/language-service)
- [Upstream MIGRATION.md](https://github.com/Effect-TS/effect/blob/main/MIGRATION.md)
