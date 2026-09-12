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
