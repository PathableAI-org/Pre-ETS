# Implementation Plan: Filesystem Tenant Configuration Persistence

**Branch**: `005-tenant-config-fs` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-tenant-config-fs/spec.md`.

## Summary

Replace env-embedded tenant JSON (`TENANT_CONFIG_RECORDS_JSON` / `TENANT_LOCAL_CONFIG_JSON`)
with a frontend-owned **filesystem** configuration source: one `{alias}.json` file per tenant
under `TENANT_CONFIG_DIR`. Host mode loads only the bound alias’s file; development static mode
supplies **`TENANT_STATIC_ALIAS`** (name only) and reads that same file. Preserve the existing
`TenantSource` / `getCurrentTenant*` consumer contract, fail-closed unknown vs configuration
failure outcomes, and path confinement. Update docs, `.env.example`, Vitest, and BDD harness;
wire `@tenant-config-fs` Gherkin already authored under `features/`.

Research: [research.md](./research.md). Shapes: [data-model.md](./data-model.md). Contracts:
[contracts/](./contracts/). Validation: [quickstart.md](./quickstart.md).

## Technical Context

**Language/Version**: Strict TypeScript 6.0.x, ESM, Node ≥24; pnpm 12.5.1 (repository root `packageManager`).

**Primary Dependencies**: Existing Next.js 16.3.5 / React 19.3.0 / `server-only` tenant module.
No new persistence library, ORM, file-watcher, or tenancy framework. Use Node `fs`/`path`
(promise API) only inside the server-only source implementation.

**Storage**: Read-only JSON files under an operator-configured directory (`TENANT_CONFIG_DIR`).
Filesystem is the **current** durable source (constitution exception below). Postgres remains the
longer-term architecture target when/if a shared mutable multi-node store ships—not this slice.
Not Redis. No write API.

**Testing**: Vitest unit tests for path safety, missing file vs parse/mismatch failures, and
static-alias loading; Cucumber `@tenant-config-fs` features (already drafted) with harness
writing temp directories; retain tenant/session/OIDC/idle partitions green after harness retarget.
Ordered BDD gate: (1) harness + steps, (2) include `@tenant-config-fs` in the default tenant
suite / dry-run discovery, (3) remove JSON env injection. Do not discover filesystem features
before steps exist. `pnpm test:bdd:dry` must discover filesystem scenarios once wired.

**Target Platform**: Node-hosted Next frontend (local development and production start). Directory
must be readable by the Node process (bind-mount / image content in deploy). Prefer directory
permissions limited to the Node process user. Prefer absolute `TENANT_CONFIG_DIR` in examples;
relative paths resolve against **process CWD at boot** (`next dev`, production start, and BDD
child processes).

**Project Type**: SSR-first web app; change confined to `packages/frontend` tenant modules plus
root BDD support and strategy docs.

**Performance Goals**: No invented latency target. One file open per requested alias (no directory
scan for host reads). **Process-lifetime parse cache** after first successful read of an alias;
restart required to refresh file contents. Cached records MUST be **immutable** (frozen /
never mutated across requests) so FR-012 isolation holds.

**Constraints**: Canonical slug only; reject path escape and nested paths; missing file → HTTP
403; unreadable/malformed/mismatched → configuration failure (HTTP 500); static mode
development-only; **silently ignore** superseded `TENANT_CONFIG_RECORDS_JSON` /
`TENANT_LOCAL_CONFIG_JSON` (no startup diagnostic); synthetic fixtures only; never log file
bodies on failure—**category-only** structured logs (missing dir / I/O / parse / mismatch /
escape).

**Scale/Scope**: Replace the configuration **source** only. Host binding, OIDC fields, idle
policy validation, session, and landing presentation rules stay as already shipped. Two sample
tenant files for local/docs; BDD uses isolated temp dirs.

## Constitution Check

_GATE: Evaluated before Phase 0 and re-evaluated after Phase 1._

| Principle                            | Pre-research                                                       | Post-design                                                                   |
| ------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| I. Evidence-grounded specification   | Pass: spec + Gherkin supersession from explicit user requirement   | Pass: research records env names, file shape, Postgres deferral               |
| II. Ownership and authoritative data | Pass: frontend-owned tenant config; no backend tables              | Pass: all I/O in `packages/frontend`; no shared package                       |
| III. Tenant isolation                | Pass: per-alias file; fail closed; no cross-tenant read            | Pass: path confinement + slug↔filename match; production ignores static alias |
| IV. Accessible SSR UI                | Pass: no new UI; errors reuse existing visible failure patterns    | Pass: no client boundary introduced                                           |
| V. Meaningful behavioral tests       | Pass: `@tenant-config-fs` Gherkin authored; 001 duplicates removed | Pass: plan wires harness + unit path/failure cases with ordered BDD gate      |
| VI. Simplicity and quality           | Pass: extend `TenantSource`; Node fs only                          | Pass: no new framework; remove dead JSON parsers from runtime path            |

### Constitution exception (Architecture Constraints — Postgres tenant config)

| Field                 | Content                                                                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Affected rule**     | Architecture Constraints: frontend tenant configuration is stored in Postgres                                                                                                                              |
| **Justification**     | Product requires durable per-tenant files under `TENANT_CONFIG_DIR` for this increment; Postgres would add Compose/SQL coupling without meeting the approved filesystem persistence requirement            |
| **Scope**             | `packages/frontend` read-only JSON at `{TENANT_CONFIG_DIR}/{alias}.json` via `createFilesystemTenantSource`; no write API; no backend/shared-package tenant-config store                                   |
| **Removal condition** | Remove this exception when/if a Postgres (or other shared mutable multi-node) tenant-config store ships and becomes the authoritative frontend source; filesystem may then become a migration/dev aid only |
| **Approval recorded** | Maintainer-approved 2026-09-21: filesystem persists tenant configuration for this feature; Postgres remains deferred until the removal condition is met                                                    |

**Post-design result**: Gates pass with the named exception above. Strategy doc sync
(`docs/multi-tenancy.md`: filesystem current, Postgres future) is an implementation task.

## Project Structure

### Documentation (this feature)

```text
specs/005-tenant-config-fs/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── filesystem-tenant-source.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
packages/frontend/
├── .env.example                          # TENANT_CONFIG_DIR + TENANT_STATIC_ALIAS (absolute-path examples; restart callout)
├── fixtures/tenant-config/               # synthetic springfield.json, shelbyville.json
└── src/lib/tenant/
    ├── source.ts                         # createFilesystemTenantSource; fail-fast dir validate; immutable cache
    ├── types.ts                          # static-alias / dir helpers; drop JSON-only local parse from runtime path as needed
    ├── operations.ts                     # createEnvTenantOperations → FS source
    ├── dev.ts / prod.ts                  # read TENANT_CONFIG_DIR (+ static alias in dev); resolve relative vs CWD at boot
    └── …

docs/multi-tenancy.md                     # filesystem current; Postgres future; retire inline JSON docs
tests/bdd/support/{server,actions,fixtures}.ts  # temp dir fixtures; stop injecting JSON env (after steps)
features/filesystem-*.feature             # already present; wire after harness/steps (ordered gate)
packages/frontend/tests/unit/tenant-*.ts  # FS source + path safety + immutable cache
```

**Structure Decision**: Keep tenancy in the existing frontend tenant module. Add a filesystem
`TenantSource` implementation beside the current in-memory helpers (retain in-memory helpers for
unit tests that inject sources). No backend workspace changes.

## Implementation policies (critique remediation)

### Fail-fast directory validation

Validate `TENANT_CONFIG_DIR` when constructing the filesystem source at process startup
(dev/prod operations wiring / `createFilesystemTenantSource`). Missing path, empty path, or
non-directory MUST throw `CONFIG_UNAVAILABLE` (visible failure) **before** serving successful
tenant context. Do not defer first diagnosis to the first tenant request.

### Path resolution (`TENANT_CONFIG_DIR`)

- Absolute paths preferred in `.env.example`, docs, and operator examples.
- Relative paths are allowed: resolve against **process current working directory at boot**
  (when the source is constructed), not per-request CWD.
- Document for local `next dev`, production start, and BDD (Cucumber child process CWD).

### Parse cache and immutability (FR-012)

- After a successful read/parse of an alias, keep a **process-lifetime** cache entry.
- Restart the Node process to pick up file edits (no hot-reload / file watcher).
- Cached `TenantRecord` / config objects MUST be immutable (e.g. `Object.freeze` deep enough
  that request handlers cannot mutate shared snapshots). Do not hand out mutable references
  that concurrent requests could overwrite.

### Superseded env JSON (silent ignore)

Once the filesystem source is active, never read `TENANT_CONFIG_RECORDS_JSON` or
`TENANT_LOCAL_CONFIG_JSON`. If still set, they have **no effect** and MUST NOT emit a
startup/local diagnostic. Document silent ignore only (cutover checklist / `.env.example`).

### Observability and disk hygiene

- On configuration unavailable: structured log with **reason category only**
  (missing dir / I/O / parse / mismatch / escape). Never log another tenant’s file body or
  secrets from disk.
- Recommend `TENANT_CONFIG_DIR` permissions limited to the Node process user.
- Committed fixtures remain synthetic only (no real client secrets).

### Cutover, restart, rollback (operators)

| Action   | Guidance                                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cutover  | Set `TENANT_CONFIG_DIR` (+ `TENANT_STATIC_ALIAS` if static); place `{alias}.json` files; remove reliance on JSON env vars (they are ignored if left behind) |
| Restart  | After any file edit or directory remount, restart the frontend process so the immutable parse cache refreshes                                               |
| Rollback | Restore previous release and/or correct the `TENANT_CONFIG_DIR` mount/path; **do not** re-enable JSON env as a dual source                                  |

### BDD ordering gate

1. Implement harness + step definitions for `@tenant-config-fs`.
2. Include `@tenant-config-fs` in the default tenant suite / dry-run discovery.
3. Remove JSON env injection from BDD support.

Do not leave filesystem features discoverable without steps.

## Complexity Tracking

| Violation                                                          | Why needed                                                                 | Simpler alternative rejected                                      | Removal condition                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| Architecture Constraints: Postgres as frontend tenant-config store | Approved filesystem persistence for this increment (maintainer 2026-09-21) | Postgres-now (out of scope; heavier ops; conflicts with FR files) | When/if Postgres tenant-config store ships as authoritative source |
