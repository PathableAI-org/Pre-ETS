# Quickstart: Validate Filesystem Tenant Configuration

**Status**: Planning artifact for [spec.md](./spec.md). Runtime verification happens after
implementation (`/speckit-tasks` / `/speckit-implement`).

Run commands from the repository root. Use Node from `.node-version` and pnpm from
`package.json`. Install with `pnpm install --frozen-lockfile`.

Sample files (after implementation): `packages/frontend/fixtures/tenant-config/springfield.json`
and `shelbyville.json` with distinct Display Names and synthetic OIDC fields.

## 1. Host association from files

```sh
TENANT_RESOLUTION=host \
TENANT_CONFIG_DIR="$PWD/packages/frontend/fixtures/tenant-config" \
pnpm --filter @pathableai/pre-ets-frontend dev
```

Open `http://springfield.localhost:3000/` and `http://shelbyville.localhost:3000/` in separate
contexts. Each visit must show only that tenant’s Display Name.

Refusals:

```sh
curl --noproxy '*' -i http://127.0.0.1:3000/ -H 'Host: unknown.localhost:3000'
curl --noproxy '*' -i http://127.0.0.1:3000/ -H 'Host: localhost:3000'
```

Expect HTTP 403 / Access denied (no substitute tenant).

## 2. Static mode by alias only

Stop the server, then:

```sh
TENANT_RESOLUTION=static \
TENANT_STATIC_ALIAS=springfield \
TENANT_CONFIG_DIR="$PWD/packages/frontend/fixtures/tenant-config" \
pnpm --filter @pathableai/pre-ets-frontend dev
```

Open `http://localhost:3000/`. Expect springfield’s Display Name from `springfield.json`.
Do **not** set `TENANT_LOCAL_CONFIG_JSON`.

Change Display Name in `springfield.json`, restart, reload—expect the new name.

## 3. Configuration failures

- Point `TENANT_CONFIG_DIR` at a missing path → visible configuration failure (HTTP 500), not a quiet empty tenant set.
- With host mode, corrupt `springfield.json` (malformed JSON or slug `shelbyville`) → HTTP 500 for springfield host; shelbyville host with a good file still succeeds.
- Static mode with `TENANT_STATIC_ALIAS=` empty or `unknown` → local configuration error (HTTP 500).

## 4. Inline JSON ignored

With a valid `TENANT_CONFIG_DIR`, set stale `TENANT_CONFIG_RECORDS_JSON` / `TENANT_LOCAL_CONFIG_JSON`
to conflicting Display Names. Host and static outcomes MUST still match the **files**, not the
inline documents.

## 5. Automated checks (after wiring)

```sh
pnpm --filter @pathableai/pre-ets-frontend test:unit
pnpm test:bdd:dry
pnpm test:bdd   # or the tenant / filesystem partition documented in features/README.md
```

Expect filesystem Gherkin scenarios to bind and the retargeted tenant suite to stay green.
Unit tests must cover path escape rejection and ENOENT vs parse failure.

## 6. Production bypass sanity

Build/start production with `TENANT_RESOLUTION=static` and `TENANT_STATIC_ALIAS=springfield`
set: production MUST still require host association and MUST NOT serve the static stand-in on
`localhost`.

See [filesystem-tenant-source.md](./contracts/filesystem-tenant-source.md) for env and path rules.
