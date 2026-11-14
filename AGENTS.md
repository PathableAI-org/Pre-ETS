# Repository guidance

Start here. Before a task in the first column below, read its owner. Read the third
column only when it applies. Each kind of decision has one owning document; other
documents point to it rather than restating it. The
[constitution](.specify/memory/constitution.md) owns the principles and governs when
documents conflict. Cursor reads this file too, so the repository keeps no separate
Cursor rules.

## Where guidance lives

| Task or decision                                                       | Owner: read before the task                                                                              | Read only when relevant                                                                                                |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Principles, amendments, conflicts between documents                    | [Constitution](.specify/memory/constitution.md)                                                          | [Development Workflow](.specify/memory/constitution.md#development-workflow-and-review) during Spec Kit phases         |
| Coding conventions, module boundaries, suppressions, final checks      | This file                                                                                                | [README](README.md) for setup and operational commands                                                                 |
| Changing one workspace                                                 | That workspace's `AGENTS.md` (below)                                                                     |                                                                                                                        |
| Specifying, planning, or implementing a delivery-issue feature         | [Git and pull request workflow](docs/engineering/git-workflow.md); the `speckit-stack` skill             | [Artifacts](docs/engineering/git-workflow.md#artifacts) before changing anything under `specs/`                        |
| Planning, implementing, or verifying a feature                         | [Verification harness](docs/engineering/verification-harness.md)                                         | The `verification-harness` skill when acting as the verifier                                                           |
| Designing or changing tests                                            | [Testing as evidence](docs/engineering/testing/README.md)                                                | [Property-based testing](docs/engineering/testing/property-based-testing.md) for property tests                        |
| Authoring or reviewing requirements BDD, steps, or helpers             | [Requirements-backed BDD](docs/engineering/testing/requirements-bdd.md); the `requirements-bdd-*` skills | [BDD commands](features/README.md) to run scenarios                                                                    |
| Authoring or reviewing a requirement                                   | [Durable requirements](docs/requirements/README.md)                                                      | The `requirements-author` and `requirements-review` skills                                                             |
| Delivery planning and issue publication                                | [Delivery planning](docs/delivery/README.md)                                                             | The `delivery-plan`, `delivery-review`, and `delivery-issues` skills                                                   |
| Effect code in an Effect workspace                                     | [Effect guidance](docs/engineering/effect-guidance.md) and the workspace `AGENTS.md`                     | Only the local Effect v4 `LLMS.md` topics the task needs                                                               |
| New modules, imports, source layout, or app structure; Fallow findings | [Fallow during development](docs/engineering/fallow.md)                                                  | [Module boundaries](#module-boundaries), the rule Fallow does not enforce                                              |
| Telemetry runtime, local Grafana, Grafana MCP                          | [Observability](docs/observability.md)                                                                   | [Verification telemetry conventions](docs/observability.md#verification-telemetry-conventions) for telemetry contracts |
| UI that uses `@pathableai/react`                                       | The installed package's `agent-guidance/pathable-react/SKILL.md`                                         | Only the linked reference relevant to the task                                                                         |
| Tenancy, authentication, sessions, domain persistence, local services  | That area's strategy (below)                                                                             |                                                                                                                        |
| Copilot pull request review                                            | The lenses in [`.github/instructions/`](.github/instructions/)                                           | Each names what to check and links its owner                                                                           |
| Claude Code permissions                                                | [Enforced agent guardrails](#enforced-agent-guardrails)                                                  |                                                                                                                        |

Workspace guides: [frontend](packages/frontend/AGENTS.md),
[frontend-services](packages/frontend-services/AGENTS.md),
[backend](packages/backend/AGENTS.md), and [domain](packages/domain/AGENTS.md); the
Effect workspaces are the last three and any future workspace extending
`tsconfig.effect.json`. Strategies: [multi-tenancy](docs/multi-tenancy.md),
[authentication](docs/authentication.md), [session state](docs/session-state.md),
[domain persistence](docs/domain-persistence.md), and
[local services](docs/docker-compose.md). The `@pathableai/react` rule comes from
[Principle IV](.specify/memory/constitution.md#iv-accessible-server-rendered-ui). Use
the named skills for those workflows.

An agent implementing one feature slice therefore reads this file, the workspace
guide, the Git workflow, the verification harness, Testing as evidence, and the owner
for the kind of code it changes.

## Coding conventions

- Repository layout, separate frontend and backend processes, and shared contracts
  follow [Architecture Constraints](.specify/memory/constitution.md#architecture-constraints)
  and [Principle II](.specify/memory/constitution.md#ii-explicit-ownership-and-authoritative-data).
  Keep implementation in its owning workspace.
- Strict TypeScript applies to all code, including non-Effect code
  ([Principle VI](.specify/memory/constitution.md#vi-simplicity-and-verifiable-quality)).
  `exactOptionalPropertyTypes` is on, so type an optional property you own as
  `readonly x?: T | undefined` and pass a possibly-undefined value directly. Do not
  spread `x === undefined ? {} : { x }` or branch to build two object shapes; lint
  rejects the spread. Use those forms only where a third-party type rejects
  `undefined`, and say why in a comment.
- Let TypeScript infer local types. Annotate exported signatures and values whose
  inferred type would be wrong, not every intermediate `const`.
- `specs/{number}-{slug}/` is a feature's historic Spec Kit record. A pull request
  changes `specs/` only inside its own feature directory, and current behavior goes in
  `docs/`; see [Artifacts](docs/engineering/git-workflow.md#artifacts).

## Module boundaries

- Modules isolate logic recursively. Use a public entry such as `lib/tenant.ts` with
  private child modules under `lib/tenant/`, for example `lib/tenant/config.ts`.
  Only the owning parent imports its children. Sibling modules and external tests
  use the parent's public interface; they must not import a sibling's children.
- Re-export child capabilities through the parent only when a current consumer needs
  them. Follow the same boundary rule when a child decomposes into further modules.
- Before adding a helper, constant, or type, search the owning workspace and the
  package that shares it (frontend-services and the Next app share cookies, cache
  headers, and host handling) for an existing one. Reuse it through its owner's public
  entry, or move it to the one module that should own it. Do not copy it.
- Introduce modules and capabilities for actual behavior, not speculative future
  consumers. A future integration or a synthetic test does not justify an unused
  provider or service contract. In particular, defer a secrets module/provider
  contract until there is a real secret to read.
- Fallow zones do not enforce this ownership rule. The frontend Bulletproof preset
  allows same-zone imports, and the frontend-services zones do not see a sibling
  importing another module's child, so such an import can pass Fallow and still
  violate this rule. Follow this rule, and use the
  [Fallow workflow](docs/engineering/fallow.md) before changing module layout.

## No check suppressions

Coding agents MUST NOT disable ESLint, Fallow, TypeScript, or any other check via
comments or suppressions (`eslint-disable`, `@ts-ignore`, `@ts-expect-error`,
`@ts-nocheck`, `fallow-ignore`, `@effect-diagnostics`, ignore directives, and
similar). Lowering an Effect language-service rule in `diagnosticSeverity` is a
suppression too. Do not add Fallow ignore patterns, baselines, `allowUnmatched`
entries, or weaker complexity thresholds to accommodate new code. Always fix the
underlying error or warning; a pre-commit hook failure is a signal to fix code, not
to silence the checker. Only human developers may disable a check; if an agent
believes a finding truly needs a disable, it must stop and ask the user.

## Enforced agent guardrails

[`.claude/settings.json`](.claude/settings.json) enforces part of this guidance for
every Claude Code session. It denies force pushes, `git reset --hard`,
`gh stack modify`, interactive `gh stack submit`, environment dumps, and reads of
`.env` files other than `.env.example`. It prompts before merges, `gh pr ready`,
remote branch deletion, and edits to check configuration and to the settings file.
Routine read-only and check commands run without a prompt. Rules match command text,
so they stop the usual form of a command and are not a security boundary; this
file's prose still governs. Codex and Cursor do not read this file. Put personal
overrides in the gitignored `.claude/settings.local.json`.

## Tooling and configuration

- [Principle VI](.specify/memory/constitution.md#vi-simplicity-and-verifiable-quality)
  governs scope, new dependencies, and wrappers. Do not add application frameworks,
  publication, client workflows, or extra tools beyond the requested task. Keep
  machine-local configuration and credentials out.
- Keep each new tool setup in its own focused commit with its configuration,
  lockfile updates, documentation, and validation.
- Each workspace owns an `eslint.config.js` importing the root config. Keep shared
  rules at the root and workspace-specific rules in that workspace. The root config
  includes the Effect conventions in `eslint.effect.js`, so every workspace
  inherits them. Root linting checks top-level files, then delegates to workspace
  lint scripts.
- Each workspace owns a `dprint.json` inheriting the root settings. Root formatting
  scripts process top-level files, `.github`, and `docs`, then delegate to each
  workspace. Keep shared formatting policy at the root and sorting in
  ESLint/Perfectionist.
- Husky runs lint-staged once at the root. Each workspace extends the root
  `lint-staged.config.js`; keep its tasks limited to the supplied staged filenames.
  Preserve default backup and partial-staging protections. After lint-staged, the
  pre-commit hook runs `pnpm check:changes` once at the root. Keep `prepare` limited
  to Husky; do not install or rewrite Fallow hooks during dependency installation.

## Before committing

Run from the repository root, plus any feature-specific checks, and investigate
findings rather than adding suppressions:

1. `pnpm typecheck`, `pnpm build`, and `pnpm lint`. In Effect workspaces `lint`
   includes `lint:effect`, the Effect language-service diagnostics that `tsc` does not
   report; run it while editing Effect code.
2. `pnpm format:check`. Apply lint fixes before `pnpm format:write`, then verify lint
   and formatting both pass.
3. `pnpm check:unused` and `pnpm check:health` for every scope, then
   `pnpm check:changes` for findings introduced since the base. The pre-commit hook
   also runs `check:changes`, but the two whole-scope checks remain required before
   completing work. Report and resolve findings as
   [Fallow during development](docs/engineering/fallow.md#responding-to-a-finding)
   describes.

Do not commit generated output.
