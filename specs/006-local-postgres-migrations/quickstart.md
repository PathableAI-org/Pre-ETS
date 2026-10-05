# Quickstart: Local Postgres Migrations

Create the gitignored root `.env` with `cp .env.example .env` on POSIX systems or
`Copy-Item .env.example .env` in PowerShell. Run the following command twice and
assign a different result to each blank password field:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Then start Postgres and run Flyway:

```sh
docker compose config --quiet
docker compose up -d --wait postgres
docker compose --profile tools run --rm flyway info
docker compose --profile tools run --rm flyway migrate
docker compose --profile tools run --rm flyway validate
```

Inspect the migrated table:

```sh
docker compose exec postgres psql -U pre_ets -d pre_ets -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'migration_demo' AND table_name = 'example_record' ORDER BY ordinal_position;"
```

Substitute the local user and database if you changed the `.env.example` values.

Run `migrate` again and confirm Flyway reports no pending migrations. `docker compose down` retains the named
volume. `docker compose down --volumes` deletes the disposable local database and is the clean-reconstruction test.
