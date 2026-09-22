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

## Effect workspace routing

Before designing or modifying Effect code in `packages/frontend`,
`packages/backend`, or a future workspace extending `tsconfig.effect.json`,
read [Effect agent guidance](docs/engineering/effect-guidance.md) and the target
workspace's `AGENTS.md`: [frontend](packages/frontend/AGENTS.md),
[backend](packages/backend/AGENTS.md). This explicit routing also applies when an
agent starts at the repository root. Consult relevant Effect Solutions topics
(`pnpm effect-solutions list` / `show`) and verify APIs against the installed
Effect **4.0.0-rc.113** declarations before using examples. Do not run the CLI's
interactive setup to rewrite this monorepo.

Product Effect pins are coordinated on `4.0.0-rc.113` with matching
`@effect/platform-node`. Existing product ownership still applies: frontend owns
Next.js UI, tenant configuration, OIDC, and session state; backend owns the
Effect REST domain layer. See
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
- Run `pnpm check:unused` before committing; investigate findings rather than
  adding blanket suppressions. `pnpm fallow` provides broader analysis.
- Coding agents MUST NOT disable ESLint, Fallow, TypeScript, or any other check
  via comments or suppressions (`eslint-disable`, `@ts-ignore`,
  `@ts-expect-error`, ignore directives, and similar). Always fix the underlying
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
  base and includes unstaged/untracked work. Keep `prepare` limited to Husky;
  do not install or rewrite Fallow hooks during dependency installation.
