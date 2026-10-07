# Research: Local Postgres Migrations

## Decisions

- Use Postgres because the constitution and persistence strategy already identify it as the local durable store.
- Use `postgres:18.6`; PostgreSQL 18 volumes mount at `/var/lib/postgresql`.
- Use the verified-publisher `redgate/flyway:13.9.0` image and an explicit `/flyway/migrations` location. The
  image's historical `/flyway/sql` default emits a deprecation warning in Flyway 13.9.
- Keep Flyway manual so developers control when the database changes.
- Keep SQL under `packages/backend/migrations` because the backend owns durable domain persistence.
- Use two migrations to demonstrate version ordering: create a synthetic table, then alter it.
- Use the existing requirements register instead of creating a separate manually maintained RTM.

## Sources

- [Docker Compose documentation](https://docs.docker.com/compose/)
- [Postgres official image](https://hub.docker.com/_/postgres)
- [Redgate Flyway image](https://hub.docker.com/r/redgate/flyway)
- [Flyway migration overview](https://www.baeldung.com/database-migrations-with-flyway)
- [Local service strategy](../../docs/docker-compose.md)
- [Domain persistence ownership](../../docs/domain-persistence.md)
