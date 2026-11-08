# Effect development and agent setup

Applies to `packages/frontend-services`, `packages/backend`, `packages/domain`,
and future workspaces that enable the Effect language-service plugin and extend
`tsconfig.effect.json` (via `tsconfig.base.json` or directly). The Next.js app
extends the shared strict compiler settings but does not enable the plugin and is
not an Effect workspace. Root tooling and Cucumber support code remain outside
the Effect-first AI workflow unless they explicitly opt in.

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
  [multi-tenancy](../multi-tenancy.md). The Next.js app owns presentation.
  `packages/frontend-services` owns tenant configuration, OIDC orchestration, and
  temporary session state for that process. Backend owns business rules, domain
  authorization, and durable domain records as a stateless RESTful Effect service.
  Do not move domain persistence into Redis or session drafts into the backend.
  Do not add Effect workflows to `packages/frontend`.
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

Describe untrusted input by the shapes you accept, not by the checks you run. A callback
query, a Redis reply, or a token's claims is a Schema: a union of exact structs or tuples,
decoded once, with `onExcessProperty: "error"` where unknown fields must be rejected.
A chain of `typeof`, `Array.isArray`, and `=== undefined` helpers is the same decoder
written by hand, spread across functions, and harder to check against the contract.

Inside Effect code, decode with `Schema.decodeUnknownEffect` or `Schema.decodeUnknownOption`.
A `*Sync` codec throws, so wrapping it in `Effect.try` turns a typed `SchemaError` into
`unknown`. Build a sync validator only for a non-Effect caller, such as a third-party
callback, and build it outside the generator. To brand a value the code generated itself,
use the schema's `make`. The root `no-restricted-syntax` rejects a `Schema.*Sync` call
inside a generator function or `Effect.try`. The language service's `schemaSyncInEffect`
does not report these calls in this Effect version.

A file, request body, or stored record is input, not configuration. Read it with the
owning capability, such as `FileSystem.readFileString`, and decode it with Schema, for
example `Schema.fromJsonString`. Do not wrap it in a `ConfigProvider` to reuse `Config`
parsing. That route hides the read and decode failures behind `ConfigError`, and its
failure type no longer says which step failed.

Use `Schema.TaggedError` for expected application failures and typed recovery such as
`Effect.catchTag` where the error vocabulary supports it. Inspect structured reasons
when a library contract requires them. Do not turn defects, interruption, or unrelated
failures into successful defaults. Keep public failure mappings stable and keep raw
untrusted inputs, credentials, and unsafe cause payloads out of responses/telemetry.
[Errors and identifiers](#errors-and-identifiers) states the concrete conventions.

### Errors and identifiers

These conventions apply in every Effect workspace. The rules in `eslint.effect.js`
(part of the root ESLint config) and the `lint:effect` gate enforce the mechanical parts.

- **Identifiers are the bare class name.** The first argument of `Schema.TaggedError`,
  `Schema.TaggedClass`, and `Context.Service` is a string literal equal to the class
  name, for example `class TenantNotFound extends Schema.TaggedError<TenantNotFound>()("TenantNotFound", …)`.
  Do not add a package prefix or path. Do not pass a constant, and do not mirror the
  tag in a `static tag` field. A package rename then cannot leave stale prefixes behind,
  and `catchTag("TenantNotFound")` reads the same as the class. The literal is
  type-checked against the error union, so no constant is needed. Names must be unique
  within one process.
  (`pathable-effect/identifier-matches-class` and `no-restricted-syntax`.)
- **Causes use `Schema.Defect()`.** It accepts any thrown value, so no hand-written
  conversion of unknown values to `Error` is needed. Pass a sanitized summary when
  the raw cause could carry file contents, credentials, or untrusted input.
  (`no-restricted-syntax` bans `Schema.instanceOf(Error)`.)
- **Construct with `new X({ … })`.** Do not add a static `new` factory.
- **Discriminate on `_tag`, never `instanceof`.** Use `Effect.catchTag`/`catchTags` in
  Effect code. In a Promise adapter, `switch` on the typed failure's `_tag`. For an
  `unknown` value, use `Predicate.isTagged`. Next.js/Turbopack can evaluate a module
  once per chunk, so two copies of an error class can exist in one process and
  `instanceof` gives the wrong answer. (`lint:effect` makes `instanceOfSchema` an
  error.)
- **Domain errors carry domain facts, not transport.** Do not put an HTTP status, a
  redirect, or a response shape on a service error. The host adapter maps the tag
  to its outcome in one place, as frontend-services does with `tenantFailureStatus`.
- **Sub-causes use a `reason` field.** When callers need one outer error with several
  distinguishable causes, model the cause as `reason: Schema.Union([...])` of tagged
  errors, following the local Effect example `01_effect/04_errors/20_reason-errors.ts`.
  Do not use an untagged `Data.Error` wrapper.
- **Classify failures by structure, never by message text.** Match a `_tag`, a
  `reason._tag` such as a `PlatformError`'s `NotFound`, or a `SchemaError` issue's
  `_tag`. Message text is for people. It changes without notice, and a library may
  wrap or reword it. If the structure you need is missing, change the error or its
  boundary so it carries that structure. (The root `no-restricted-syntax` bans
  `.message.includes`/`startsWith`/`match`, regex tests, equality comparisons, and
  `switch` on `.message`.)

Effect exports modules named `Array`, `BigInt`, `Boolean`, `Function`, `Number`,
`RegExp`, `Request`, `String`, and `Symbol`. Import them under an alias, such as
`import { String as Str } from "effect"`, or use the global's own methods. A binding
named `String` makes every `String(...)` in the file mean something else. The root
`no-restricted-syntax` rejects any binding that shadows a JavaScript global.

Comments and JSDoc should explain a contract, limitation, or non-obvious decision.
Do not copy the tutorial's illustrative comments or narrate obvious code. Prefer
schema-backed models when validation/encoding is needed; plain readonly TypeScript
data remains appropriate for internal results and non-Effect code.

### Resources, time, and existing application code

Acquire resources with `Effect.acquireRelease` and let Scope/Layer finalizers close
them on success, failure, or interruption. Use Layers for long-lived services and
background work. Tests owning temporary resources should use scoped cleanup too.
Do not add a long-lived service, cache, or background process without a current need.

Retry with `Effect.retry` and a `Schedule` or `{ times, while }`, not with a function
that calls itself with a decremented counter. The retry policy is then one visible
value, and only the failures named in `while` are retried. When a retry depends on an
outcome that is not an error, such as a store reporting an existing key, model that
outcome as a private tagged error, then map it after the retry.

A policy that tests must replace is a `Context.Reference` with a production default,
not a module-level object that tests patch with `vi.spyOn`. A reference is provided per
program, so one test's override cannot leak into another, and the default stays
visible in the type.

Within Effect workflows, use `DateTime` and the Effect clock for current time, parsing,
formatting, time zones, and calendar operations. Keep time replaceable in tests.
Outside Effect, native/framework date APIs remain appropriate; do not introduce a
runtime solely for a UI formatting operation or root harness timestamp.

`packages/frontend-services` bridges Effects through its shared `ManagedRuntime`.
The Next.js host starts and disposes that runtime from `instrumentation.ts`. The
independent backend process owns its runtime entrypoint and shutdown. Keep Promises
and framework response construction at those execution edges. Root tooling, Cucumber/Playwright,
React components, pure functions, and existing framework adapters keep their native
APIs unless a concrete workflow needs Effect. Strict TypeScript and recursive module
boundaries apply to all of them.

### Choose a focused local example

Resolve these paths relative to the discovered v4 checkout. Read only the needed topic,
then verify the API in the installed package. The list is a lookup aid, not adoption scope.

| Need                                  | Local guide/example area                                                               | Application constraint                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Effects, schemas, errors              | `LLMS.md`; `ai-docs/src/01_effect/{01_basics,02_schema,04_errors}/`                    | Validate external values once; preserve public outcomes                                                          |
| Services/configuration, Layers        | `ai-docs/src/01_effect/03_services`                                                    | Readonly public capabilities; dependencies acquired in Layers; no service per file                               |
| Resource lifetime and process startup | `ai-docs/src/01_effect/{05_resources,06_running}/`                                     | Scope finalizers and host-owned boot/disposal                                                                    |
| Framework integration                 | `ai-docs/src/04_integration/10_managed-runtime.ts`                                     | Adapt the bridge to Next.js; do not add the example framework                                                    |
| Effect tests/shared Layers            | `ai-docs/src/09_testing`                                                               | Fresh mutable state per scenario; retain semantic evidence; no observability tests                               |
| Dates/time zones                      | `ai-docs/src/07_datetime`                                                              | Effect clock inside workflows; native APIs outside them                                                          |
| Logging/tracing                       | `ai-docs/src/08_observability`                                                         | Preserve the all-or-nothing OTEL configuration and HTTP query redaction; inspect live telemetry with Grafana MCP |
| PubSub, streams, schedules, batching  | `ai-docs/src/01_effect/07_pubsub/`; `ai-docs/src/{03_stream,05_batching,06_schedule}/` | Introduce only for required behavior, not speculative architecture                                               |
| HTTP clients, REST servers, SQL       | `ai-docs/src/{50_http-client,51_http-server,40_sql}/`                                  | Frontend keeps Next handlers; backend owns REST/domain persistence; follow accepted database/migration choices   |

Do not copy library setup wholesale. The existing [observability setup](../observability.md)
starts `@opentelemetry/sdk-node` for global providers and automatic HTTP, Redis,
and Node runtime instrumentation, then passes the same processors and reader to
`@effect/opentelemetry/NodeSdk` for the scoped Effect tracer, logger, and metrics
bridges. Enabled OTEL requires an endpoint and service name;
`OTEL_SDK_DISABLED=true` uses `NodeSdk.layerEmpty`. Do not add another export
pipeline, including `effect/observability` `OtlpTracer`, and do not construct an
Effect `NodeTracerProvider` when `NodeSdk.layerTracerProvider` already does.
Inspect live frontend telemetry through the Grafana MCP section of that setup;
do not add durable tests of span output. GraphQL, CLI, AI, cluster,
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

### Configuration is decoded once at startup

Function arguments represent data flowing through an operation. Effect requirements
represent capabilities, such as Redis or the filesystem. Process settings are neither:
they are fixed values known before any layer is built.

Decode once, pass values:

- One `Config` recipe describes every process setting. In frontend-services it is
  `StartupConfig` in `src/config/`. Startup (`src/runtime.ts`) parses it once from
  `ConfigProvider.fromEnv()`. A failure stops the process before any infrastructure starts.
- Layer factories take the decoded values they need as plain arguments, for example
  `SessionService.layer(startup.session)` and `AuthenticationService.layer(startup.authentication)`.
  A parent passes its children the slice they need.
- No other module reads `Config` or `ConfigProvider`. A layer that yields a `Config` decodes
  the environment again, puts `ConfigError` in its error channel, and needs a
  `ConfigProvider` layer at the runtime. Tests then need one too. An agent may cast that
  error away or silently default instead.
- Settings types are plain readonly interfaces exported by the config module. Prefer an
  Effect value such as `Duration` over a unit-suffixed number.
- Keep the schema issue when a setting fails, so the startup log says what is wrong.
  The exception is a setting whose value must never appear in logs: a secret, or a value
  whose contract forbids echoing it. Decode those with the config module's one redacting
  helper.
- An absent setting may have a default. An unsupported value fails startup: never use
  `Config.orElse` to turn a bad value into a default.
- Tests build services from plain settings objects. Only the config tests exercise
  environment decoding.

`no-restricted-imports` in the frontend-services ESLint config rejects `Config` and
`ConfigProvider` imports outside `src/config/**` and `src/runtime.ts`.

### Keep framework execution at the host boundary

Next.js server functions, actions, and route handlers in the Next app should call
helpers exported by `packages/frontend-services`. Those helpers may depend on Next
types and run application Effects through the shared `ManagedRuntime`, obtaining
concrete results for the framework to return. Below that boundary, modules express
dependencies through Effect and return values or typed failures. Keep startup and
disposal with the Next host rather than constructing runtimes per operation.

Keep application behavior independent of React rendering. A helper that accepts a
`NextRequest` or returns a `NextResponse` can live in `packages/frontend-services`.
That package must not import the Next app or `@pathableai/react`. These boundaries
do not change the backend's independent process or domain ownership.

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
`tsconfig.base.json` extends it. `packages/frontend-services`, backend, and domain
enable the Effect language-service plugin in their own configs. The Next.js app
keeps the Next.js plugin and does not enable the Effect plugin. New Effect
workspaces should extend the base, add the plugin, provide their own include globs
and types, and route agents here.

### Effect diagnostics are a lint gate

Each Effect workspace's `lint` script runs `lint:effect`:

```sh
effect-language-service diagnostics --project tsconfig.json --strict --format text
```

The command loads the plugin configuration from the workspace `tsconfig.json`
without patching TypeScript. `--strict` fails on warnings as well as errors, so a
diagnostic the editor would show also fails `pnpm lint` and `CI / Quality`. Run
`pnpm --filter <workspace> run lint:effect` while editing Effect code. Do not wait
for the final gate.

The plugin only reports in an editor or in a manually patched `tsc`. Plain `tsc`
and `pnpm typecheck` never load it. Before this gate existed, agents never saw these
diagnostics, so the patterns they flag built up unnoticed. Treat a `lint:effect`
finding like an ESLint finding. Fix the code. Do not lower a rule in
`diagnosticSeverity`, set it to `off`, or add an `@effect-diagnostics` comment. The
root rule against agent suppressions covers those too. Raising a rule's severity,
or enabling an opt-in rule after fixing what it reports, makes the gate stronger
and is encouraged.

Every Effect workspace raises these opt-in rules to `error`. Each one was confirmed to
report a deliberate violation before it was enabled:

| Rule                                                                 | What it catches                                                                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `instanceOfSchema`                                                   | `instanceof` against a schema class; use `Schema.is` or `_tag`                                           |
| `globalDateInEffect`, `globalRandomInEffect`, `globalTimersInEffect` | `Date`, `Math.random`, `setTimeout` inside Effect code; use `Clock`, `Random`, `Effect.sleep`/`Schedule` |
| `runEffectInsideEffect`                                              | `Effect.run*` inside an Effect; compose instead                                                          |
| `unnecessaryEffectGen`, `returnEffectInGen`, `effectFnIife`          | generators that wrap one yield, return an unrun Effect, or call `Effect.fn` immediately                  |
| `catchAllToMapError`                                                 | `catch((e) => Effect.fail(…))`; use `mapError`                                                           |
| `tryCatchInEffectGen`                                                | `try`/`catch` in a generator; use `Effect.try`                                                           |
| `effectMapVoid`, `effectSucceedWithVoid`, `unnecessaryPipe`          | `map(() => undefined)`, `succeed(undefined)`, empty `pipe()`                                             |

Some rules are deliberately left off:

- `effectFnOpportunity`, `unsafeEffectTypeAssertion` and `schemaSyncInEffect` report nothing in this Effect
  version, even on a direct violation. ESLint selectors in `eslint.effect.js` cover the first and last.
- `cryptoRandomUUIDInEffect` recommends Effect's `Random`, a seeded PRNG. Bearer references and telemetry IDs
  must come from `crypto`, inside `Effect.sync`.

When the language service is upgraded, re-probe the inert rules and enable any that start reporting.

The plugin options keep `ignoreEffectWarningsInTscExitCode: true`, so a developer
who also patches TypeScript (see the README) sees warnings in `tsc` without them
changing its exit code. `lint:effect` is the enforced check.

## References

- [Upstream Effect documentation](https://effect.website/docs/)
- [Upstream Effect source](https://github.com/Effect-TS/effect)
- [Language service](https://github.com/Effect-TS/language-service)
- [Upstream MIGRATION.md](https://github.com/Effect-TS/effect/blob/main/MIGRATION.md)
