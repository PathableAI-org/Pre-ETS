# Backend database migrations

Flyway applies the versioned SQL files in this directory to the local Postgres
database. The backend owns these migrations because it owns durable domain
persistence.

The current `migration_demo` schema is synthetic. It verifies the migration
workflow and is not the planned Consumer service-log model.

## Conventions

- Name versioned migrations `V<number>__<description>.sql`.
- Use a new version for every change. Never edit an applied migration.
- Keep migrations deterministic and free of client records, credentials, and PHI.
- Use forward migrations to correct an applied schema.
- Run migrations explicitly; starting Postgres does not apply them automatically.

See [Docker Compose for local development](../../../docs/docker-compose.md) for
commands and local reset instructions.
