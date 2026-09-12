# Repository guidance

- Use pnpm from the repository root; keep one root lockfile and private ESM
  workspaces under `packages/`, named in the `@pathableai` npm scope.
- Frontend and backend are separate processes. Keep implementation in its owning
  workspace; introduce shared contracts only when actual requirements need them.
- Apply the shared strict TypeScript settings to all code, including non-Effect code.
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
- Each workspace owns a `dprint.json` inheriting the root settings. Root formatting
  scripts process top-level files, then delegate to each workspace. Keep shared
  formatting policy at the root and sorting in ESLint/Perfectionist.
- Run `pnpm format:check` before committing. Apply lint fixes before
  `pnpm format:write`, then verify lint and formatting both pass.
- Husky runs lint-staged once at the root. Each workspace extends the root
  `lint-staged.config.js`; keep its tasks limited to the supplied staged filenames.
  Preserve default backup and partial-staging protections.
- After lint-staged, the pre-commit hook runs `pnpm check:changes` once at the
  root. This Fallow audit gates new findings against the automatically resolved
  base and includes unstaged/untracked work. Keep `prepare` limited to Husky;
  do not install or rewrite Fallow hooks during dependency installation.
