# Effect development and agent setup

Applies to `packages/frontend`, `packages/backend`, and future workspaces that
enable the Effect language-service plugin and extend `tsconfig.effect.json`
(via `tsconfig.base.json` or directly). Root tooling and Cucumber support code
remain outside the Effect-first AI workflow unless they explicitly opt in.

## Before writing Effect code

Follow the [README developer setup](../../README.md#effect-developer-setup).
Find the available local Effect v4 checkout; a common location is
`$HOME/.local/share/effect-solutions/effect-v4`. Read its `LLMS.md`, then only
the linked `ai-docs/src/` examples and source relevant to the task. This guide adapts
that library guidance to an application that also contains non-Effect code.

Source precedence:

1. Repository contracts and the installed workspace's declarations are authoritative.
2. Prefer the local v4 `LLMS.md`, linked examples, and source matching the installed version.
   Inspect the checkout's revision: an existing checkout may be ahead of the product pins.
   Verify every API against the owning workspace's installed declarations/source before use.
3. Fill local documentation gaps from official upstream sources. Avoid unrelated checkouts
   and v3 examples; report missing local sources or documentation drift. Do not reset another
   checkout or assume an example authorizes a dependency, product behavior, or new framework.

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
- Use `Effect.gen` for inline sequential programs. For reusable generator functions,
  use named `Effect.fn("Module.operation")` at useful tracing boundaries and
  `Effect.fnUntraced` for helpers/hot paths. Avoid functions that only return
  `Effect.gen`. Add recovery/provision/annotation combinators as additional arguments
  to the function constructor; do not call `.pipe` on the constructed function.
  Use `Effect.fn.Return<A, E, R>` when an explicit generator return type is useful.
  Return terminal failures with `return yield*` so control-flow narrowing is clear.
  Small pure or combinator-only functions need no generator wrapper. Avoid converting operations to Promises
  inside business workflows or executing Effects merely to construct adapters.
- Decode external input through schemas at the actual trust or persistence
  boundary. Passing an already validated value between modules does not require
  another decode. Keep wire formats and established response/error mappings
  stable.
- Compose shared Layers at process boundaries. Preserve resource scope and Layer
  identity; do not mechanically merge sequential provides when one supplies
  dependencies of another.
- Prefer deterministic test Layers for Effect behavior. Use the already-installed
  `@effect/vitest` `it.effect` for Effect-returning scenarios; it manages test execution,
  scope, and test services. Keep ordinary Vitest for pure code and framework adapters.
  Cover failures and cleanup as well as success. Do not convert test Effects to Promises
  merely to run an async test. Keep observability verification manual.
- Keep runtime startup, disposal, and long-lived execution at the process host
  entrypoint for each workspace. Importing library modules must remain safe
  without starting a runtime.

### Validation, errors, and runtime checks

Use Schema to model and decode untrusted inputs at their actual boundaries. Reuse
schema decoders instead of rebuilding them for each request. Use schema checks for
domain constraints; do not replace decoding with handwritten predicates, casts, or
manual parsing. Already-validated values and pure calculations need no second decode.
Preserve independent expected-fixture parsing in tests rather than reusing the decoder
under test. For small runtime type guards in Effect code, use existing `Predicate`
helpers instead of inventing `isRecord`/`isString` utilities. Outside Effect code,
use the owning framework's and TypeScript's normal narrowing tools.

Use `Schema.TaggedError` for expected application failures and typed recovery such as
`Effect.catchTag` where the error vocabulary supports it. Inspect structured reasons
when a library contract requires them. Do not turn defects, interruption, or unrelated
failures into successful defaults. Keep public failure mappings stable and keep raw
untrusted inputs, credentials, and unsafe cause payloads out of responses/telemetry.

Comments and JSDoc should explain a contract, limitation, or non-obvious decision.
Do not copy the tutorial's illustrative comments or narrate obvious code. Prefer
schema-backed models when validation/encoding is needed; plain readonly TypeScript
data remains appropriate for internal results and non-Effect code.

### Resources, time, and existing application code

Acquire resources with `Effect.acquireRelease` and let Scope/Layer finalizers close
them on success, failure, or interruption. Use Layers for long-lived services and
background work. Tests owning temporary resources should use scoped cleanup too.
Do not add a long-lived service, cache, or background process without a current need.

Within Effect workflows, use `DateTime` and the Effect clock for current time, parsing,
formatting, time zones, and calendar operations. Keep time replaceable in tests.
Outside Effect, native/framework date APIs remain appropriate; do not introduce a
runtime solely for a UI formatting operation or root harness timestamp.

The frontend host bridges Effects through its shared `ManagedRuntime`; the independent
backend process owns its runtime entrypoint and shutdown. Keep Promises and framework
response construction at those execution edges. Root tooling, Cucumber/Playwright,
React components, pure functions, and existing framework adapters keep their native
APIs unless a concrete workflow needs Effect. Strict TypeScript and recursive module
boundaries apply to all of them.

### Choose a focused local example

Resolve these paths relative to the discovered v4 checkout. Read only the needed topic,
then verify the API in the installed package. The list is a lookup aid, not adoption scope.

| Need                                  | Local guide/example area                                                               | Application constraint                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Effects, schemas, errors              | `LLMS.md`; `ai-docs/src/01_effect/{01_basics,02_schema,04_errors}/`                    | Validate external values once; preserve public outcomes                                                        |
| Services/configuration, Layers        | `ai-docs/src/01_effect/03_services`                                                    | Readonly public capabilities; dependencies acquired in Layers; no service per file                             |
| Resource lifetime and process startup | `ai-docs/src/01_effect/{05_resources,06_running}/`                                     | Scope finalizers and host-owned boot/disposal                                                                  |
| Framework integration                 | `ai-docs/src/04_integration/10_managed-runtime.ts`                                     | Adapt the bridge to Next.js; do not add the example framework                                                  |
| Effect tests/shared Layers            | `ai-docs/src/09_testing`                                                               | Fresh mutable state per scenario; retain semantic evidence; no observability tests                             |
| Dates/time zones                      | `ai-docs/src/07_datetime`                                                              | Effect clock inside workflows; native APIs outside them                                                        |
| Logging/tracing                       | `ai-docs/src/08_observability`                                                         | Preserve the existing Vercel exporter/global Effect bridge; manual verification only                           |
| PubSub, streams, schedules, batching  | `ai-docs/src/01_effect/07_pubsub/`; `ai-docs/src/{03_stream,05_batching,06_schedule}/` | Introduce only for required behavior, not speculative architecture                                             |
| HTTP clients, REST servers, SQL       | `ai-docs/src/{50_http-client,51_http-server,40_sql}/`                                  | Frontend keeps Next handlers; backend owns REST/domain persistence; follow accepted database/migration choices |

Do not copy library setup wholesale. The existing [observability setup](../observability.md)
uses one `@vercel/otel` exporter and the Effect global tracer bridge. Local examples of
Otlp exporters or NodeSdk do not authorize another exporter. GraphQL, CLI, AI, cluster,
new drivers, and other example modules require an actual task and installed/approved
dependencies before adoption.

## Design modules from the consumer inward

Start with the consumer need, then define the public capability and meaningful success
and error scenarios before choosing implementation details. A module is an architectural
boundary with a public interface and private implementation. A `Context.Service` can
expose its capability to other modules; consumers should generally use that contract
rather than reach into private helpers. This does not require a service for every file.

Module boundaries are recursive and reflected in the filesystem. A public entry such
as `lib/tenant.ts` owns child modules in `lib/tenant/`, such as `config.ts`. Only that
parent imports its children; sibling modules and external tests depend on the parent's
public interface. Re-export a child capability only when a current consumer needs it.
Apply the same rule when a child itself decomposes into further modules: sibling
modules do not reach into one another's descendants.

Build a module or capability when actual behavior needs it. A future integration or
a synthetic test does not justify introducing an unused provider/service contract.
For example, add a secrets module only when there is a real secret to read.

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

- [Upstream Effect documentation](https://effect.website/docs/)
- [Upstream Effect source](https://github.com/Effect-TS/effect)
- [Language service](https://github.com/Effect-TS/language-service)
- [Upstream MIGRATION.md](https://github.com/Effect-TS/effect/blob/main/MIGRATION.md)
