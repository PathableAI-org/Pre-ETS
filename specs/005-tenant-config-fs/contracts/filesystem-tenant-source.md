# Contract: Filesystem Tenant Configuration Source

**Applies to**: frontend server-only tenant configuration reads.\
**Requirements**: FR-001–FR-013; SC-001–SC-007.\
**Supersedes**: env JSON source rows in
[`specs/001-tenant-resolution/contracts/tenant-context.md`](../../001-tenant-resolution/contracts/tenant-context.md)
(`TENANT_CONFIG_RECORDS_JSON`, `TENANT_LOCAL_CONFIG_JSON`). Host binding, `getCurrentTenant*`,
and HTTP mapping in that contract remain in force unless noted below.

## Module interface

| Operation                                          | Input                              | Output / failure                                                                                            | Owner                                |
| -------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `createFilesystemTenantSource`                     | Absolute or CWD-relative directory | `TenantSource`, or throw if directory unusable **at construction**                                          | `src/lib/tenant/source.ts`           |
| `TenantSource.readTenantRecord`                    | Canonical slug                     | Matching immutable `TenantRecord`, `undefined` if file missing, throw if unreadable/invalid/mismatch/escape | same                                 |
| `createEnvTenantOperations` / `dev.ts` / `prod.ts` | Process env                        | Existing operation results; **must** construct FS source from `TENANT_CONFIG_DIR` at startup                | `operations.ts`, `dev.ts`, `prod.ts` |

Public import surface stays `packages/frontend/src/lib/tenant`. No public HTTP config API.
Consumers MUST NOT pass filesystem paths or read files themselves.

## Server settings

Place settings in `packages/frontend/.env.local` or the process environment. Never
`NEXT_PUBLIC_*`.

| Variable              | Format                              | Effect                                                                      |
| --------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| `TENANT_CONFIG_DIR`   | Filesystem path to a directory      | Required for config reads. Host and static modes load `{dir}/{alias}.json`. |
| `TENANT_STATIC_ALIAS` | Canonical tenant slug               | Development static mode only: which file to load. Ignored in production.    |
| `TENANT_RESOLUTION`   | `host` \| `static` (default `host`) | Unchanged. Static only when `NODE_ENV=development`.                         |

### Path resolution (`TENANT_CONFIG_DIR`)

- Prefer **absolute** paths in `.env.example`, docs, and operator examples.
- **Relative** paths are allowed: resolve against **process CWD at boot** (when
  `createFilesystemTenantSource` runs), not per-request CWD. Applies to `next dev`,
  production start, and BDD child processes.

### Fail-fast directory validation

When constructing the filesystem source at process startup, validate that the resolved path
exists and is a directory. Missing, empty, or non-directory → throw `CONFIG_UNAVAILABLE`
immediately (visible before successful tenant context). Do not defer diagnosis to first read.

### Superseded env JSON — silent ignore

**Removed as sources** (ignored if present; **no** startup/local diagnostic):

- `TENANT_CONFIG_RECORDS_JSON`
- `TENANT_LOCAL_CONFIG_JSON`

Filesystem is the sole configuration source once adopted.

## Path and read rules

1. Only files named exactly `{canonicalAlias}.json` directly under `TENANT_CONFIG_DIR` are eligible.
2. Resolve the candidate path and reject any result whose parent directory is not the configured
   directory or whose basename is not `{alias}.json` (configuration unavailable).
3. Do not `readdir` to satisfy a host-bound read; open the single candidate path.
4. Symlinks that resolve outside the configured directory MUST fail closed (unavailable).
5. `ENOENT` → unknown tenant. All other read/parse/validation failures → configuration unavailable.

## Cache policy (process lifetime)

1. After a successful read/parse of an alias, cache the result for the process lifetime.
2. Restart the Node process to refresh file contents after edits (no hot-reload).
3. Cached `TenantRecord` values MUST be **immutable** (frozen / not mutated across requests)
   so overlapping requests cannot observe shared mutable config (FR-012).

## Static mode

1. Require usable `TENANT_STATIC_ALIAS`.
2. Load that alias from `TENANT_CONFIG_DIR` via the same source.
3. Origin remains `local-static` (not host-associated).
4. Production MUST NOT select static mode or apply `TENANT_STATIC_ALIAS`.

## HTTP / visible outcomes (unchanged mapping)

| Source outcome                                 | Adapter                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| Unknown (missing file)                         | `forbidden()` → HTTP 403, no other tenant’s Display Name          |
| Configuration unavailable / local config error | Throw / HTTP 500 with visible error; no successful tenant context |
| Success                                        | Existing session/proxy/landing consumers receive `TenantConfig`   |

Exact static-mode error copy should name the directory and static-alias settings and restart;
do not echo unrelated tenants’ file contents.

## Observability and disk hygiene

- On configuration unavailable: structured log with **reason category only**
  (missing dir / I/O / parse / mismatch / escape). Never log file bodies or secrets.
- Recommend directory permissions limited to the Node process user.
- Fixture files are synthetic only (no real client secrets in committed examples).

## Documentation and examples

- `packages/frontend/.env.example` documents the three variables, absolute-path examples,
  restart-after-edit, and silent ignore of superseded JSON vars; points at
  `packages/frontend/fixtures/tenant-config/`.
- `docs/multi-tenancy.md` describes this contract as the **current** loading strategy;
  Postgres remains a future target.
- Cutover / rollback: see [quickstart.md](../quickstart.md).
