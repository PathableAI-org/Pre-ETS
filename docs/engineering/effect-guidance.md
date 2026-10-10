# Effect development and agent setup

Applies to `packages/frontend`, `packages/backend`, and future workspaces that
enable the Effect language-service plugin and extend `tsconfig.effect.json`
(via `tsconfig.base.json` or directly). Root tooling and Cucumber support code
remain outside the Effect-first AI workflow unless they explicitly opt in.

## Before writing Effect code

Follow the [README developer setup](../../README.md#effect-developer-setup),
then run `pnpm effect-solutions list` and read only the topics relevant to your
change. Verify examples against the target workspace's installed Effect
declarations. Do not run the CLI's interactive setup to rewrite this monorepo. `open-issue` sends external feedback and requires explicit user
authorization.

Source precedence:

1. Repository contracts and the installed workspace's declarations are authoritative.
2. Use the matching Effect v4 source (main / tagged RC) for implementation details
   and examples.
3. Use Effect Solutions for patterns, checking every API against installed types.

Product workspaces use the coordinated Effect pins in the named `effect` catalog
in [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml), including
`@effect/platform-node`. Allowed installed-truth APIs include
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
- Express effectful business operations as Effects with explicit success, typed error, and
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

## Design modules from the consumer inward

Start with the consumer need, then define the public capability and meaningful success
and error scenarios before choosing implementation details. A module is an architectural
boundary with a public interface and private implementation. A `Context.Service` can
expose its capability to other modules; consumers should generally use that contract
rather than reach into private helpers. This does not require a service for every file.

Default to small, composable pure functions within a module. Return Effect when an
operation needs environmental capabilities, meaningful typed failures, asynchronous or
stateful work, or composition with other Effects. Effect-first development does not mean
wrapping every ordinary transformation in Effect. Pure transformations and explicit data
flow remain useful building blocks.

Design errors from the public contract inward: which failures must a caller distinguish?
Translate implementation failures into that public vocabulary where appropriate, while
preserving the distinction between expected failures and defects. Do not expose every
internal failure mechanism as a new public error case.

### Configuration belongs in the dependency graph

Function arguments represent data flowing through an operation. Effect requirements
represent capabilities or environmental dependencies needed to perform it. A hostname
is operation input; tenant-resolution policy is environmental configuration.

Prefer declaring configuration as a Layer requirement over passing it ad hoc to Layer
factories. Conceptually, a tenant capability could have the shape
`Layer.Layer<TenantConfigService, TenantConfigError, ServerConfig>`, with production and
tests supplying different configuration Layers. This is a design illustration, not a
copyable declaration of the current service: other requirements, such as filesystem and
path, must also be represented when needed.

A shared server configuration service is a reasonable starting point. Introduce narrower
configuration services only for concrete benefits such as independent validation, reuse,
lifecycle, or reduced coupling. Do not multiply Context tags and mapping Layers solely
for conceptual purity.

Currently, the frontend's `ServerConfig` is a plain interface and
`TenantConfigService.layer(config)` receives it as an argument. Environment-provided
configuration is guidance for future design work, not a completed migration or a change
to the existing public interface.

### Keep framework execution at the host boundary

Next.js server functions, actions, and route handlers should normally invoke application
Effects through the host's shared `ManagedRuntime`, obtaining concrete results for the
framework to return. Below that boundary, modules express dependencies through Effect
and return values or typed failures; the framework adapter interprets those outcomes.
Keep startup and disposal with the host rather than constructing runtimes per operation.

Keep application behavior independent of Next.js where practical. A pure adapter that
transforms a `NextRequest` can still be appropriate; the goal is that application behavior
does not unnecessarily depend on Next.js controlling its composition. These frontend
examples do not change the backend's independent process or domain ownership.

### Solve the domain the application owns

Validate the application's semantic contract at its responsible boundary. Tenant
resolution should not become a general-purpose hostname or public-suffix parser without
a requirement for that capability. For a design with a configured base hostname, the
useful rule could simply be `<tenant>.<base-hostname>` resolving to that tenant and the
base hostname alone having no tenant. Production and development can have different
known bases without maintaining lists of global suffixes.

That example illustrates bounded design; it does not introduce a base-hostname setting
or replace the current [tenant contract](../multi-tenancy.md). Keep assumptions explicit
and resist speculative validation, abstractions, and edge cases beyond the agreed
contract, including when reviewing generated code.

### Develop the contract and its evidence together

Use this sequence as a guide, not a mandatory suite or new workflow gate:

**Consumer need → public capability → success/error scenarios → public-interface tests →
useful properties → composable implementation → framework integration → user workflows.**

Write service scenarios before implementation when practical. Add internal properties
when they establish a distinct claim or help localize failures. Follow
[Testing as evidence](testing/README.md#public-service-scenarios) for scenario environments
and [Property-based testing](testing/property-based-testing.md#properties-at-the-public-service-boundary)
for properties exercised through the public service.

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
