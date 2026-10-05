# Implementation Plan: Local Postgres Migrations

**Branch**: `006-local-postgres-migrations` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

## Summary

Extend the repository's external-service Compose file with pinned Postgres and Flyway images. Keep migrations under
the backend ownership boundary, run Flyway explicitly, and prove ordering, validation, persistence, idempotency, and
clean reconstruction using a synthetic schema.

## Technical Context

**Storage**: `postgres:18.6` with a named volume mounted at the PostgreSQL 18 path `/var/lib/postgresql`.

**Migration runner**: `redgate/flyway:13.9.0`, profiled as a manual tool with a read-only
`/flyway/migrations` mount.

**Ownership**: `packages/backend/migrations`; no Effect or application source changes.

**Verification**: Compose model validation, real Postgres health, Flyway `info` / `migrate` / `validate`, SQL
inspection, repeat migration, container recreation, and fresh-volume reconstruction.

## Constitution Check

| Principle                       | Result                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| Evidence-grounded specification | Pass: the supplied planning discussion defines local scope, Compose sharing, and dummy SQL. |
| Explicit ownership              | Pass: migrations live under the backend; no frontend or Redis persistence is introduced.    |
| Tenant isolation                | Pass: no tenant or client records are introduced; services publish on loopback only.        |
| Accessible SSR UI               | Not applicable: no UI or rendering changes.                                                 |
| Meaningful behavioral tests     | Pass: real infrastructure checks observe migration and persistence outcomes.                |
| Simplicity and quality          | Pass: direct Compose and SQL files; no application dependency or wrapper script.            |

## Project Structure

```text
compose.yaml
.env.example
packages/backend/migrations/
├── README.md
├── V1__create_migration_demo.sql
└── V2__add_migration_demo_status.sql
docs/docker-compose.md
docs/requirements/infrastructure.md
```

## Constraints

- Starting Postgres does not run Flyway.
- `flyway clean` remains disabled.
- The dummy schema is not the domain schema.
- Deployment automation remains future work.
- The current Flyway image is AMD64-only; Apple Silicon relies on Docker emulation.
