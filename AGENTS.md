# Repository guidance

- Use pnpm from the repository root; keep one root lockfile and private ESM
  workspaces under `packages/`, named in the `@pathableai` npm scope.
- Frontend and backend are separate processes. Keep implementation in its owning
  workspace; introduce shared contracts only when actual requirements need them.
- When creating or editing UI that uses `@pathableai/react`, locate the
  installed `@pathableai/react` package and read
  `agent-guidance/pathable-react/SKILL.md` from that package before making
  changes. Read only the linked reference relevant to the task.
- Apply the shared strict TypeScript settings to all code, including non-Effect code.

## Module boundaries

- Modules isolate logic recursively. Use a public entry such as `lib/tenant.ts` with
  private child modules under `lib/tenant/`, for example `lib/tenant/config.ts`.
  Only the owning parent imports its children. Sibling modules and external tests
  use the parent's public interface; they must not import a sibling's children.
- Re-export child capabilities through the parent only when a current consumer needs
  them. Follow the same boundary rule when a child decomposes into further modules.
- Introduce modules and capabilities for actual behavior, not speculative future
  consumers. In particular, defer a secrets module/provider contract until there is
  a real secret to read.
- The frontend Bulletproof preset does not enforce this ownership rule. A same-zone
  import can pass Fallow and still violate it. Follow this rule, and use the
  [Fallow workflow](docs/engineering/fallow.md) before changing module layout.

## Fallow

Use Fallow while designing and editing, not only as a final gate. The detailed
command reference is [Fallow during development](docs/engineering/fallow.md).

- Before a change that introduces modules, modifies imports, reorganizes source
  files, or changes application structure, inspect the owning workspace's zones
  with `fallow guard` on the files you will change. Skip that inspection for an
  ordinary localized edit.
- While editing, run the workspace-scoped Fallow command for a boundary, cycle,
  unused-code, complexity, or duplication risk as soon as the edit can introduce
  it. Structural duplication uses semantic mode and is included in
  `pnpm check:changes`. Model-based similar-code is an advisory review, not a
  completion check. Prefer a targeted command over repeating `pnpm check:unused`,
  `pnpm check:health`, or `pnpm check:changes`.
- Before completing work, run `pnpm check:unused` and `pnpm check:health` for
  every scope, then `pnpm check:changes` for findings introduced since the base.
  The first two are whole-scope checks. `check:changes` is the new-only audit
  and is also what the pre-commit hook runs.
- Report unresolved findings, including whether they are pre-existing or
  introduced. Fix an introduced violation. Ask for human review when a finding
  looks like a false positive or a legitimate exception.

## Testing guidance

Before designing or changing tests, read [Testing as evidence](docs/engineering/testing/README.md).
For property tests, also read [Property-based testing](docs/engineering/testing/property-based-testing.md).
Choose evidence for a named expectation and the boundary responsible for it; do not add tests solely for coverage.

Verify observability manually or with temporary agent probes, inspecting real logs
and exported OTel data. When the local Grafana stack is running, use the Grafana
MCP server in [docs/observability.md](docs/observability.md) to inspect exported
frontend traces. An empty Loki or Prometheus result is not application evidence.
Do not retain durable tests of log output, spans, attributes,
telemetry payloads, or exporter behavior. Keep durable tests focused on application outcomes.

Before authoring or reviewing requirements BDD, step definitions, or supporting helpers, read
[Requirements-backed BDD](docs/engineering/testing/requirements-bdd.md). Inspect the referenced requirements
in current `origin/main`; report unavailable baseline access rather than assuming approval. Every scenario
must carry or inherit requirement-ID tags. Keep assertions within those promises and use feature-level
`@partial` for intermediate evidence. Use the repository's `requirements-bdd-author`,
`requirements-bdd-scaffold`, and `requirements-bdd-review` skills for those workflows.
Structured `/_test/*` responses may serve as sparse, requirement-driven BDD evidence seams when ordinary product
behavior cannot expose a precise assertion. They must use the owning application capabilities, return only the minimum
safe semantic data, remain private/no-store where applicable, and state what the diagnostic observation does not prove.
Do not add them merely for test convenience, read backing stores directly, or treat separate production-ingress blocking
as evidence supplied by application BDD.

## Git and pull requests

Before specifying, planning, or implementing a delivery-issue feature, read
[Git and pull request workflow](docs/engineering/git-workflow.md) and use the
`speckit-stack` skill. Requirements, delivery plans, and Spec Kit keep their
existing authority. The workflow decides how that work is branched, reviewed,
and merged.

## Effect workspace routing

Before designing or modifying Effect code in `packages/frontend-services`,
`packages/backend`, `packages/domain`, or a future workspace extending
`tsconfig.effect.json`, read
[Effect agent guidance](docs/engineering/effect-guidance.md) and the target
workspace's `AGENTS.md`: [frontend-services](packages/frontend-services/AGENTS.md),
[backend](packages/backend/AGENTS.md), [domain](packages/domain/AGENTS.md). The
Next.js app in [frontend](packages/frontend/AGENTS.md) is not an Effect workspace.
This explicit routing also applies when an
agent starts at the repository root. Locate the available Effect v4 checkout,
read its `LLMS.md`, then only the linked examples/source relevant to the task.
The local discovery path and source precedence are in the Effect guide. Verify
APIs against the target workspace's installed declarations; a local checkout may
be ahead of the product pins. Use external documentation only to fill local gaps.

These Effect conventions apply to Effect workflows, not every file in the repository.
Keep pure TypeScript, React/UI, Next.js adapters, and root tooling idiomatic to their
own boundaries. Do not add Effect dependencies, services, or wrappers merely to
imitate library examples. Reusable Effect generators use `Effect.fn` for useful
tracing boundaries or `Effect.fnUntraced` otherwise; inline programs use `Effect.gen`.

Product Effect pins are coordinated in the named `effect` catalog in
[`pnpm-workspace.yaml`](pnpm-workspace.yaml), including `@effect/platform-node`.
Existing product ownership still applies: the Next.js app owns presentation and
calls `@pathableai/pre-ets-frontend-services` for tenant configuration, OIDC, and
temporary session state; backend owns the Effect REST domain layer. Do not import
`effect` from `packages/frontend`. See
[effect-guidance](docs/engineering/effect-guidance.md) and
[domain persistence](docs/domain-persistence.md).

- Prefer direct package scripts and README instructions over custom wrappers.
- Keep each new tool setup in its own focused commit with its configuration,
  lockfile updates, documentation, and validation.
- Run the available checks before committing; do not commit generated output.
- Do not add application frameworks, publication, client workflows, or extra tools
  beyond the requested task. Keep machine-local configuration and credentials out.
- Each workspace owns an `eslint.config.js` importing the root config. Keep shared
  rules at the root and workspace-specific rules in that workspace. Root linting
  checks top-level files, then delegates to workspace lint scripts.
- Validate with `pnpm typecheck`, `pnpm build`, and `pnpm lint`.
- Before committing, run `pnpm check:unused`, `pnpm check:health`, and
  `pnpm check:changes`, as described in [Fallow](docs/engineering/fallow.md).
  Investigate findings rather than adding suppressions. Type-aware analysis is
  enabled in best-effort mode against each scope's `tsconfig.json`. It does not
  replace `tsc`. A partial or unavailable checker result keeps the finding and
  is not evidence that it can be deleted. `private-type-leaks` is an error:
  an exported signature must name an exported type.
- Coding agents MUST NOT disable ESLint, Fallow, TypeScript, or any other check
  via comments or suppressions (`eslint-disable`, `@ts-ignore`,
  `@ts-expect-error`, `fallow-ignore`, ignore directives, and similar). Do not
  add Fallow ignore patterns, baselines, `allowUnmatched` entries, or weaker
  complexity thresholds to accommodate new code. Always fix the underlying
  error or warning. Only human developers may disable a check; if an agent
  believes a finding truly needs a disable, it must stop and ask the user.
- Each workspace owns a `dprint.json` inheriting the root settings. Root formatting
  scripts process top-level files, `.github`, and `docs`, then delegate to each
  workspace. Keep shared formatting policy at the root and sorting in
  ESLint/Perfectionist.
- Run `pnpm format:check` before committing. Apply lint fixes before
  `pnpm format:write`, then verify lint and formatting both pass.
- Husky runs lint-staged once at the root. Each workspace extends the root
  `lint-staged.config.js`; keep its tasks limited to the supplied staged filenames.
  Preserve default backup and partial-staging protections.
- After lint-staged, the pre-commit hook runs `pnpm check:changes` once at the
  root. This Fallow audit gates new findings against the automatically resolved
  base and includes unstaged/untracked work. Whole-scope `pnpm check:unused` and
  `pnpm check:health` remain required before completing work. Keep `prepare`
  limited to Husky; do not install or rewrite Fallow hooks during dependency
  installation.
