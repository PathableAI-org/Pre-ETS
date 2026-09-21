# Contract: Filesystem Tenant Configuration Source

**Applies to**: frontend server-only tenant configuration reads.\
**Requirements**: FR-001–FR-013; SC-001–SC-007.\
**Supersedes**: env JSON source rows in
[`specs/001-tenant-resolution/contracts/tenant-context.md`](../../001-tenant-resolution/contracts/tenant-context.md)
(`TENANT_CONFIG_RECORDS_JSON`, `TENANT_LOCAL_CONFIG_JSON`). Host binding, `getCurrentTenant*`,
and HTTP mapping in that contract remain in force unless noted below.

## Module interface

| Operation                                          | Input                              | Output / failure                                                                                  | Owner                                |
| -------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `createFilesystemTenantSource`                     | Absolute/resolvable directory path | `TenantSource`, or throw if directory unusable                                                    | `src/lib/tenant/source.ts`           |
| `TenantSource.readTenantRecord`                    | Canonical slug                     | Matching `TenantRecord`, `undefined` if file missing, throw if unreadable/invalid/mismatch/escape | same                                 |
| `createEnvTenantOperations` / `dev.ts` / `prod.ts` | Process env                        | Existing operation results; **must** construct FS source from `TENANT_CONFIG_DIR`                 | `operations.ts`, `dev.ts`, `prod.ts` |

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

**Removed as sources** (ignored if present):

- `TENANT_CONFIG_RECORDS_JSON`
- `TENANT_LOCAL_CONFIG_JSON`

## Path and read rules

1. Only files named exactly `{canonicalAlias}.json` directly under `TENANT_CONFIG_DIR` are eligible.
2. Resolve the candidate path and reject any result whose parent directory is not the configured
   directory or whose basename is not `{alias}.json` (configuration unavailable).
3. Do not `readdir` to satisfy a host-bound read; open the single candidate path.
4. Symlinks that resolve outside the configured directory MUST fail closed (unavailable).
5. `ENOENT` → unknown tenant. All other read/parse/validation failures → configuration unavailable.

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

## Documentation and examples

- `packages/frontend/.env.example` documents the three variables and points at
  `packages/frontend/fixtures/tenant-config/`.
- Fixture files are synthetic (demo Display Names, loopback issuers in local samples only).
- `docs/multi-tenancy.md` describes this contract as the current loading strategy.
