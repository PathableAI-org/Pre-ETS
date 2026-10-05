# Feature Specification: Local Postgres Migrations

**Feature Branch**: `006-local-postgres-migrations`

**Created**: 2026-10-05

**Status**: Ready

**Input**: Add a local database to the existing Docker Compose configuration and prove SQL migration execution with
dummy tables. Keep this separate from the planned Consumer service-log schema and defer deployment automation.

## Developer Scenario

A developer clones the repository, accepts or overrides local-only environment values, starts Postgres through
Docker Compose, and explicitly runs Flyway. The same repository files reproduce the migrated database without
sharing a running database or installing Postgres and Flyway directly on the host.

## Requirements

- **FR-001**: Compose MUST start a healthy, loopback-only Postgres service with persistent local storage.
- **FR-002**: Repository-owned backend SQL migrations MUST be applied explicitly through a Flyway Compose service.
- **FR-003**: Successful versioned migrations MUST be recorded and MUST NOT be reapplied on a second run.
- **FR-004**: A fresh local volume MUST reconstruct the same migrated schema from committed SQL files.
- **FR-005**: Examples and migrations MUST use synthetic values and contain no production credentials, client data,
  or PHI.
- **FR-006**: The dummy schema MUST NOT be represented as the approved Consumer service-log model.

## Success Criteria

- Postgres reaches healthy status from the documented command.
- Flyway reports both dummy migrations pending, applies them, and validates their checksums.
- The migrated table and Flyway history survive container recreation.
- Repeating `migrate` makes no schema change.
- Removing the local volume and repeating setup recreates the migrated table.

## Out of Scope

- Application database integration
- The Consumer service-log schema
- CI/CD or deployment migration automation
- Production credentials, networking, backups, or recovery
