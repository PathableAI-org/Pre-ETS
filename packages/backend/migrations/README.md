# Backend database migrations

Flyway applies the versioned SQL files in this directory to the local Postgres
database. The backend owns these migrations because it owns durable domain
persistence.

The `migration_demo` schema is synthetic and verifies the migration workflow.
`V3` adds the separate `onsite.visit` table for local synthetic create testing;
it is not an authorized service-log workflow.

## Conventions

- Name versioned migrations `V<number>__<description>.sql`.
- Use a new version for every change. Never edit an applied migration.
- Keep migrations deterministic and free of client records, credentials, and PHI.
- Use forward migrations to correct an applied schema.
- Run migrations explicitly; starting Postgres does not apply them automatically.

See [Docker Compose for local development](../../../docs/docker-compose.md) for
commands and local reset instructions.

The opt-in Postgres create test requires an isolated local database whose name
ends in `_test`, with these Flyway migrations applied. Set
`BACKEND_TEST_DATABASE_URL` only in the test process environment; the test
checks the returned UUID and stored fields, then removes its own synthetic row.
It skips when that variable is absent. Never point it at shared or production
data.
