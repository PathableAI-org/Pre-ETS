# Docker Compose for local development

This note records how local development runs **external** services. The Next.js
app and the Effect API stay on the host (`pnpm` in each workspace). Compose
does not run those processes.

The current Compose file provides **Redis** (session store), **Keycloak** (local
OIDC broker), and **Postgres** (local persistence). A profiled **Flyway** service
applies backend-owned SQL migrations only when a developer invokes it.

Tenant resolution uses process environment settings (host association or
static Display Name + OIDC). Session state uses Redis; see
[session-state.md](./session-state.md). OIDC behavior is described in
[authentication.md](./authentication.md). Domain persistence is described in
[domain-persistence.md](./domain-persistence.md).

## What Compose provides

The root `compose.yaml` publishes external services on loopback only. Host-run
applications connect to them over the network:

- **Redis** — frontend session store and short-lived OIDC transaction keys
  (official `redis:8.10.2`)
- **Keycloak** — local OIDC broker (pinned `quay.io/keycloak/keycloak:26.8.0`,
  `start-dev --import-realm`, tracked realm JSON under `docker/keycloak/`)
- **Postgres** — local persistence service (official `postgres:18.6`)
- **Flyway** — manual backend migration runner (`redgate/flyway:13.9.0`)

Pin image tags. Do not use `latest`. Local ports and credentials are for a
machine-local developer environment only; they are not production values.

Apps on the host reach Redis, Keycloak, and Postgres at `127.0.0.1` (or
`localhost`). Do not put the Next.js or Effect processes in the same Compose
file.

Copy `.env.example` to a gitignored root `.env` before running Compose
(`Copy-Item .env.example .env` in PowerShell). The usernames and database name
are synthetic, but both password fields are intentionally blank. Run the
following command twice and assign a different result to
`KC_BOOTSTRAP_ADMIN_PASSWORD` and `POSTGRES_PASSWORD`:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Compose resolves required variables for the entire model before selecting
services. Both passwords must therefore be set for every Compose command,
including commands that start only Redis and Keycloak. Compose fails fast when
either password is blank. The generated credentials are machine-local; do not
reuse them in another environment or pass the blank `.env.example` directly to
`docker compose`.

On Windows and macOS, Docker Desktop runs Linux containers in its managed Linux
environment. Start Docker Desktop before using these commands. The published
Flyway image is currently AMD64-only, so Apple Silicon uses Docker's emulation.

## Redis

Use the official `redis` image with a pinned patch tag (`redis:8.10.2`). Publish
it on loopback only (`127.0.0.1:6379:6379`). Local development does not need a
password.

This container is the session key store described in
[session-state.md](./session-state.md) and the OIDC transaction store (separate
key prefix). The Next.js app is the only client. The Effect API does not
connect to it. Do not persist domain records or tenant configuration here.

### Start, verify, and stop

These commands require the populated root `.env`, including both generated
passwords, even though this service subset does not start Postgres.

```sh
docker compose up -d --wait redis keycloak
docker compose exec redis redis-cli ping
# Expect: PONG

docker compose down
```

Never run `FLUSHALL` against a shared Redis. Tests and local cleanup must
delete only keys under the process `SESSION_KEY_PREFIX` / `OIDC_TX_KEY_PREFIX`
(or an isolated Redis DB).

Frontend session and OIDC settings live in `packages/frontend/.env.local` (see
`.env.example`). Example loopback URL: `redis://127.0.0.1:6379`. Non-local
Redis URLs require TLS (`rediss://` or equivalent) **and** authenticated ACL
credentials or mTLS.

## Keycloak

Use the official image `quay.io/keycloak/keycloak:26.8.0` with
`start-dev --import-realm`. That mode is one container, no TLS, and an embedded
database. It is for local manual testing only.

Publish the HTTP port on loopback only (`127.0.0.1:8080:8080`). Bootstrap admin
credentials are required via `KC_BOOTSTRAP_ADMIN_USERNAME` and
`KC_BOOTSTRAP_ADMIN_PASSWORD` in the shell or a gitignored root `.env` (Compose
fails fast when either is unset).

On first boot, Keycloak imports the tracked realm file
[`docker/keycloak/pre-ets-realm.json`](../docker/keycloak/pre-ets-realm.json):

- Realm `pre-ets`
- Public PKCE clients `springfield-web` and `shelbyville-web`
- Redirect URIs for static mode (`http://localhost:3000/auth/callback`) and
  host mode (`http://springfield.localhost:3000/auth/callback`,
  `http://shelbyville.localhost:3000/auth/callback`)
- Test user `demo` / `demo` (local-only)

Import runs only when the realm is absent. After editing the JSON, recreate the
Keycloak container (`docker compose up -d --force-recreate keycloak`) or
`docker compose down` and bring services back up. Restart the frontend after
recreate (discovery metadata is cached for the process lifetime).

Documented issuer identity for both the browser and the host-run Next.js
process:

`http://127.0.0.1:8080/realms/pre-ets`

Prefer `127.0.0.1` consistently in fixtures to avoid `localhost` resolution
mismatches. Optional tenant `oidc.connection` / `kc_idp_hint` Identity Providers
are not part of the imported realm; omit `connection` for the built-in login
form.

This local broker stands in for Authentik or Keycloak in other environments.
Do not add a second local identity stack (Better Auth, Auth.js, a mock that
skips the browser login) for manual testing.

## Optional: observability profile (`otel-lgtm`)

Local OpenTelemetry + Grafana is **opt-in**. Default
`docker compose up -d --wait redis keycloak` does **not** start it.

Pinned image: `grafana/otel-lgtm:0.35.0` (digest pinned in `compose.yaml`).
Compose service name: **`otel-lgtm`**. Compose profile: **`observability`**.

| Host binding     | Container | Purpose                            |
| ---------------- | --------- | ---------------------------------- |
| `127.0.0.1:3300` | `3000`    | Grafana UI (Next.js keeps `:3000`) |
| `127.0.0.1:4317` | `4317`    | OTLP gRPC                          |
| `127.0.0.1:4318` | `4318`    | OTLP HTTP (Next default)           |

Anonymous Grafana org role is **Viewer** (`GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer`)
for least-privilege local MCP reads. Do not treat anonymous Admin or
`admin`/`admin` as the default MCP path (troubleshooting only).

### Start

```sh
docker compose --profile observability up -d --wait
```

- Grafana: `http://127.0.0.1:3300`
- OTLP HTTP for Next: `http://127.0.0.1:4318`
- Request spans from the Next demo routes are typically visible in Grafana
  Explore / Tempo within ~30 seconds of traffic when
  `OTEL_TRACES_ENABLED=true` points at that endpoint.

Port notes: Grafana is on **3300** so it does not collide with Next on **3000**.
Keycloak remains on **8080** (unchanged).

### Stop only the observability service

Stop **only** `otel-lgtm` so Redis/Keycloak stay up:

```sh
docker compose --profile observability stop otel-lgtm
```

Do **not** run bare `docker compose --profile observability stop` (that can
stop other enabled project services).

App instrumentation and env vars: [observability.md](./observability.md).

## Postgres and Flyway

Postgres uses the pinned `postgres:18.6` image, publishes only on
`127.0.0.1:5432`, and stores data in the `postgres_data` named volume. Postgres
18 stores its versioned data directory beneath `/var/lib/postgresql`, so the
named volume mounts at that path.

Set the required `POSTGRES_PASSWORD` in the root `.env`; override the default
`POSTGRES_DB` and `POSTGRES_USER` there when needed. The host connection uses
those values with `127.0.0.1:5432`; Flyway connects inside Compose with the
service hostname `postgres`. Choose all three values before the first Postgres
startup: the official image uses them only when initializing an empty data
directory. To change them afterward, alter the existing database roles or reset
the disposable local volume with `docker compose down --volumes` and initialize
it again.

One Postgres **container** is enough. Keep ownership clear with separate
databases (or schemas) in that instance:

- future frontend-owned tenant configuration (branding, copy, broker connection)
- backend-owned domain records

The Next.js app will be the only writer of durable tenant configuration. This
increment does not persist tenant Display Name in Postgres. The Effect API is
the only writer of domain data. They do not share tables. Neither uses
Postgres as a session store.

Flyway reads versioned SQL from `packages/backend/migrations`, which reflects
backend ownership of domain persistence. The current `migration_demo` schema is
synthetic and does not implement the planned Consumer service-log schema.
Starting Postgres never runs Flyway automatically.

### Start and migrate

```sh
docker compose up -d --wait postgres
docker compose --profile tools run --rm flyway info
docker compose --profile tools run --rm flyway migrate
docker compose --profile tools run --rm flyway validate
```

Inspect the dummy table and Flyway history:

```sh
docker compose exec postgres psql -U pre_ets -d pre_ets -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'migration_demo' AND table_name = 'example_record' ORDER BY ordinal_position;"
docker compose exec postgres psql -U pre_ets -d pre_ets -c "SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank;"
```

These commands use the synthetic `.env.example` user and database. Substitute
your local values if you changed them; the generated password stays in `.env`
and is supplied to the containers by Compose.

Running `migrate` again is safe: Flyway reports that the schema is current and
does not reapply versioned migrations. Do not edit a migration after it has been
applied; add a new version instead.

`docker compose down` removes containers but retains `postgres_data`. The
following command also deletes the local database and is destructive:

```sh
docker compose down --volumes
```

Use volume deletion only to reset a local disposable environment. Flyway
`clean` is disabled.

## Running the apps against Compose

1. Start services with `docker compose up -d --wait redis keycloak` and confirm
   Redis `PONG`. Confirm realm import with:
   `curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/realms/pre-ets/.well-known/openid-configuration`
   (expect `200`).
2. Copy `packages/frontend/.env.example` to `.env.local` if needed; set
   `REDIS_URL`, generate `SESSION_SIGNING_SECRET`, and keep the example
   **static** tenant JSON (issuer `http://127.0.0.1:8080/realms/pre-ets`,
   client `springfield-web`).
3. Run `pnpm dev:frontend` and open `http://localhost:3000/` — you should land
   on the Keycloak login form (`demo` / `demo`). For two-tenant host checks,
   switch `TENANT_RESOLUTION=host` and use `*.localhost` hosts from
   [multi-tenancy.md](./multi-tenancy.md).
4. Restart the frontend after tenant JSON, secrets, or Keycloak recreate.

An unknown tenant host still fails closed in host mode. Compose does not create
application tenants; it provides Redis and the imported local broker those
modules use.
