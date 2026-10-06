# Tasks: Local Postgres Migrations

**Input**: `spec.md`, `plan.md`, `research.md`, and `quickstart.md`.

- [x] T001 Add pinned Postgres and profiled Flyway services to `compose.yaml`.
- [x] T002 Add root `.env.example` with synthetic identifiers and blank required password fields.
- [x] T003 Add ordered dummy SQL under `packages/backend/migrations`.
- [x] T004 Document migration ownership and immutability in `packages/backend/migrations/README.md`.
- [x] T005 Update `README.md` and `docs/docker-compose.md` with the executable local workflow.
- [x] T006 Add proposed requirement `PREETS-INFRA-002` with acceptance criteria and verification boundaries.
- [x] T007 Validate the Compose model and execute the complete Postgres/Flyway quickstart.
- [x] T008 Verify repeat migration, persistence across recreation, and fresh-volume reconstruction.
- [x] T009 Run repository formatting, lint, type, build, and unused-code gates.
- [x] T010 Review the final diff for scope, secrets, and documentation consistency.
