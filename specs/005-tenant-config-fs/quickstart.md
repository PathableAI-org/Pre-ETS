# Quickstart: Validate Filesystem Tenant Configuration

**Status**: Implemented on `005-tenant-config-fs-impl`. Validate against a running frontend after
`pnpm install --frozen-lockfile`.

Run commands from the repository root. Use Node from `.node-version` and pnpm from
`package.json`. Install with `pnpm install --frozen-lockfile`.

Sample files (after implementation): `packages/frontend/fixtures/tenant-config/springfield.json`
and `shelbyville.json` with distinct Display Names and synthetic OIDC fields.

## Path and CWD notes

- Prefer an **absolute** `TENANT_CONFIG_DIR` (examples below use `"$PWD/..."`).
- Relative paths are allowed and resolve against the **process CWD at boot** (when the
  frontend process starts)—not later working-directory changes. Same rule for `next dev`,
  production start, and BDD child processes.
- After editing any tenant file, **restart** the frontend process so the process-lifetime
  parse cache refreshes.

## Cutover checklist

1. Place synthetic `{alias}.json` files under the chosen directory.
2. Set `TENANT_CONFIG_DIR` (and `TENANT_STATIC_ALIAS` if using static mode).
3. Do **not** rely on `TENANT_CONFIG_RECORDS_JSON` / `TENANT_LOCAL_CONFIG_JSON`—if still set,
   they are **silently ignored** (no startup warning).
4. Restart the process after cutover and after any file edits.

## Rollback

Restore the previous release and/or correct the `TENANT_CONFIG_DIR` mount/path so readable
files exist again. **Do not** re-enable JSON env documents as a dual configuration source.

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

Change Display Name in `springfield.json`, **restart**, reload—expect the new name.

## 3. Configuration failures

- Point `TENANT_CONFIG_DIR` at a missing path → visible configuration failure at startup /
  source construction (HTTP 500), not a quiet empty tenant set.
- With host mode, corrupt `springfield.json` (malformed JSON or slug `shelbyville`) → HTTP 500
  for springfield host; shelbyville host with a good file still succeeds.
- Static mode with `TENANT_STATIC_ALIAS=` empty or `unknown` → local configuration error
  (HTTP 500). Error copy should mention directory, static alias, and restart.

## 4. Inline JSON silently ignored

With a valid `TENANT_CONFIG_DIR`, set stale `TENANT_CONFIG_RECORDS_JSON` /
`TENANT_LOCAL_CONFIG_JSON` to conflicting Display Names. Host and static outcomes MUST still
match the **files**, not the inline documents. No startup diagnostic is required when those
vars remain set.

## 5. Automated checks (after wiring)

Ordered gate: harness + steps first, then discover `@tenant-config-fs` in the default suite,
then remove JSON env injection.

```sh
pnpm --filter @pathableai/pre-ets-frontend test:unit
pnpm test:bdd:dry
pnpm test:bdd   # or the tenant / filesystem partition documented in features/README.md
```

Expect filesystem Gherkin scenarios to bind and the retargeted tenant suite to stay green.
Unit tests must cover path escape rejection, ENOENT vs parse failure, and immutable cache
behavior.

## 6. Production bypass sanity

Build/start production with `TENANT_RESOLUTION=static` and `TENANT_STATIC_ALIAS=springfield`
set: production MUST still require host association and MUST NOT serve the static stand-in on
`localhost`.

See [filesystem-tenant-source.md](./contracts/filesystem-tenant-source.md) for env and path rules.
