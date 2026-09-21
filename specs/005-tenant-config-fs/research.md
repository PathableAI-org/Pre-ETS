# Research: Filesystem Tenant Configuration Persistence

**Date**: 2026-09-21\
**Scope**: Phase 0 decisions for [spec.md](./spec.md)\
**Status**: Research complete; implementation has not started.

## Repository evidence

- Runtime source today: `packages/frontend/src/lib/tenant/{source,operations,dev,prod,types}.ts`
  loads `TENANT_CONFIG_RECORDS_JSON` (host) and `TENANT_LOCAL_CONFIG_JSON` (static) via
  `parseRecordsJson` / `parseLocalConfigJson`.
- Consumer contract: `TenantSource.readTenantRecord(slug)` → matching `TenantRecord | undefined`
  or throw `CONFIG_UNAVAILABLE`. Missing record → `forbidden()` (403); throw → HTTP 500.
- Gherkin for this feature already exists (`features/filesystem-*.feature`); superseded 001
  scenarios were removed. Cucumber is **not** yet partitioned for `@tenant-config-fs`.
- Constitution lists Postgres for frontend tenant configuration as architecture intent;
  `docs/multi-tenancy.md` still describes env JSON and defers durable stores.

## 1. Durable source for this increment: filesystem, not Postgres

**Decision**: Implement read-only JSON files under `TENANT_CONFIG_DIR` as the authoritative
tenant configuration source. Do **not** introduce Postgres (or any SQL client) in this slice.
Update `docs/multi-tenancy.md` to state filesystem is current; Postgres remains a future
architecture target when/if product requires multi-node shared mutable config.

**Rationale**: Matches the approved specification and user input. Keeps ownership on the
frontend process, avoids Compose/Postgres coupling for config, and satisfies “real persistence”
without expanding into domain DB work.

**Alternatives considered**: Postgres now (rejected—out of scope, heavier ops); keep env JSON
(rejected—spec FR-009); object storage (rejected—unnecessary indirection).

## 2. Environment variable names

**Decision**:

| Role                    | Name                  | Notes                                                                     |
| ----------------------- | --------------------- | ------------------------------------------------------------------------- |
| Configuration directory | `TENANT_CONFIG_DIR`   | Absolute or process-resolvable path; required for successful config reads |
| Static tenant name      | `TENANT_STATIC_ALIAS` | Canonical slug only; development static mode                              |
| Mode switch             | `TENANT_RESOLUTION`   | Unchanged: `host` \| `static`; production ignores                         |

Stop reading `TENANT_CONFIG_RECORDS_JSON` and `TENANT_LOCAL_CONFIG_JSON` in application code.
If still present in an environment, they have **no effect** (filesystem is sole source).

**Rationale**: Clear roles, parallel naming to existing `TENANT_*` prefix, “alias” matches
host-bound identity language in the spec.

**Alternatives considered**: `TENANT_CONFIG_PATH` (ambiguous file vs dir);
`TENANT_STATIC_NAME` (fine synonym; alias preferred for consistency with hostname label).

## 3. File layout and JSON shape

**Decision**: Path `{TENANT_CONFIG_DIR}/{alias}.json` only (no subdirectories). File body is a
full `TenantRecord`: `{ "slug": "<alias>", "config": { … } }` using today’s
`parseTenantRecord` / `TenantConfig` rules (displayName, oidc, optional idleTimeoutMinutes).
Filename alias MUST equal `slug` inside the file; mismatch → configuration failure.
Unknown fields remain rejected by existing parsers.

**Rationale**: Reuses validation; preserves FR-010 mismatch detection; consumers unchanged.

**Alternatives considered**: Config-only files without `slug` (weaker mismatch check);
directory scan / index file (rejected—FR requires per-request single-file open).

## 4. Filesystem `TenantSource` behavior

**Decision**: Add `createFilesystemTenantSource(directoryPath: string): TenantSource`:

1. Resolve and validate the directory at construction (or first use): missing / not a directory
   → throw `CONFIG_UNAVAILABLE` (not an empty map).
2. On `readTenantRecord(slug)`:
   - If `!isCanonicalTenantSlug(slug)` → treat as unknown (`undefined`) or let callers
     `forbidden()` first (callers already gate canonical slugs).
   - Build ``path.join(dir, ``${slug}.json`)`; after `realpath`/`resolve`, require the file’s
     directory equals the configured directory and basename equals `${slug}.json``(reject``..`, separators in slug, symlinks that escape—fail closed as unavailable).
   - `ENOENT` → `undefined` (unknown tenant → 403).
   - Other I/O, JSON parse failure, `parseTenantRecord` failure, or `record.slug !== slug`
     → reject with `CONFIG_UNAVAILABLE` (configuration failure → 500).
3. Do not readdir the directory for host lookups.
4. Optional process-lifetime cache of successfully parsed records keyed by slug; document
   restart after file edits (same as prior env JSON).

**Rationale**: Maps cleanly onto existing 403 vs 500 adapter behavior; satisfies path-escape
and single-file constraints in Gherkin.

**Alternatives considered**: Re-read every request without cache (acceptable but noisier I/O);
treat missing dir as empty set (rejected—spec edge case requires visible unavailable).

## 5. Static mode by alias only

**Decision**: When `TENANT_RESOLUTION=static` and `NODE_ENV=development`:

1. Require non-empty `TENANT_STATIC_ALIAS` that passes `isCanonicalTenantSlug`.
2. Load via the same filesystem source: `readTenantRecord(alias)`.
3. Missing/blank/non-canonical alias, missing file, or bad file → local configuration error
   (reuse/adapt `LOCAL_CONFIG_ERROR` messaging to mention static alias + directory + restart).
4. Production never honors static mode or `TENANT_STATIC_ALIAS` (existing `selectTenantMode`
   production path).

**Rationale**: Spec US2; shares one source with host mode; removes full JSON from env.

## 6. Cutover and test harness

**Decision**:

- Update `packages/frontend/.env.example` and quickstart to `TENANT_CONFIG_DIR` + sample
  files under `packages/frontend/fixtures/tenant-config/`.
- Retarget `tests/bdd/support/server.ts` (and related fixtures) to write per-scenario temp
  directories and set `TENANT_CONFIG_DIR` / `TENANT_STATIC_ALIAS` instead of JSON blobs.
- Add Cucumber partition flag (e.g. `CUCUMBER_TENANT_FS=1` or include in default tenant
  suite once steps exist)—prefer **include in default tenant BDD** after steps land because
  this replaces the prior tenant source, not an additive gated suite. Until steps exist,
  keep features discovered only when wired to avoid dry-run failures.
- Remove runtime use of `parseRecordsJson` / `parseLocalConfigJson` from `dev`/`prod`/
  `createEnvTenantOperations`; keep pure helpers only if unit tests still need them, or
  delete if unused (`pnpm check:unused` / fallow).

**Rationale**: FR-009; prevents dual-source drift; aligns harness with production shape.

## 7. Docs synchronization

**Decision**: Edit `docs/multi-tenancy.md` “Loading tenant configuration” to describe
filesystem files and the two env vars; remove instructions that treat inline JSON as the
source. Note Postgres as future, not current.

**Rationale**: Constitution requires resolving strategy conflicts before implementation.
