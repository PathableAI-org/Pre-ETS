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

**Language/Version**: Strict TypeScript 6.0.x, ESM, Node ≥24; pnpm 12.4.1 (repository root).

**Primary Dependencies**: Existing Next.js 16.3.5 / React 19.3.0 / `server-only` tenant module.
No new persistence library, ORM, file-watcher, or tenancy framework. Use Node `fs`/`path`
(promise API) only inside the server-only source implementation.

**Storage**: Read-only JSON files under an operator-configured directory (`TENANT_CONFIG_DIR`).
Not Postgres (constitution’s longer-term tenant-config store remains deferred—see research §1).
Not Redis. No write API.

**Testing**: Vitest unit tests for path safety, missing file vs parse/mismatch failures, and
static-alias loading; Cucumber `@tenant-config-fs` features (already drafted) with harness
writing temp directories; retain tenant/session/OIDC/idle partitions green after harness retarget.
`pnpm test:bdd:dry` must discover filesystem scenarios once wired.

**Target Platform**: Node-hosted Next frontend (local development and production start). Directory
must be readable by the Node process (bind-mount / image content in deploy).

**Project Type**: SSR-first web app; change confined to `packages/frontend` tenant modules plus
root BDD support and strategy docs.

**Performance Goals**: No invented latency target. One file open per requested alias (no directory
scan for host reads). Process-lifetime parse cache after first successful read of an alias is
acceptable; restart remains the documented refresh (matches prior env-JSON immutability).

**Constraints**: Canonical slug only; reject path escape and nested paths; missing file → HTTP
403; unreadable/malformed/mismatched → configuration failure (HTTP 500); static mode
development-only; stop reading superseded JSON env vars; synthetic fixtures only.

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
| V. Meaningful behavioral tests       | Pass: `@tenant-config-fs` Gherkin authored; 001 duplicates removed | Pass: plan wires harness + unit path/failure cases                            |
| VI. Simplicity and quality           | Pass: extend `TenantSource`; Node fs only                          | Pass: no new framework; remove dead JSON parsers from runtime path            |

**Constitution / strategy note (Postgres)**: Constitution architecture still names Postgres for
eventual frontend tenant configuration. This slice deliberately implements **filesystem**
persistence as the real durable source now (user requirement). Postgres is **out of scope**;
document the deferral in `docs/multi-tenancy.md` so plans do not pretend env JSON or Postgres
is active. No Complexity Tracking row—scope is a source swap, not a principle violation.

**Post-design result**: Gates pass. Strategy doc sync is an implementation task.

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
├── .env.example                          # TENANT_CONFIG_DIR + TENANT_STATIC_ALIAS
├── fixtures/tenant-config/               # synthetic springfield.json, shelbyville.json
└── src/lib/tenant/
    ├── source.ts                         # add createFilesystemTenantSource
    ├── types.ts                          # static-alias / dir helpers; drop JSON-only local parse from runtime path as needed
    ├── operations.ts                     # createEnvTenantOperations → FS source
    ├── dev.ts / prod.ts                  # read TENANT_CONFIG_DIR (+ static alias in dev)
    └── …

docs/multi-tenancy.md                     # filesystem source; retire inline JSON docs
tests/bdd/support/{server,actions,fixtures}.ts  # temp dir fixtures; stop injecting JSON env
features/filesystem-*.feature             # already present; wire cucumber partition
packages/frontend/tests/unit/tenant-*.ts  # FS source + path safety
```

**Structure Decision**: Keep tenancy in the existing frontend tenant module. Add a filesystem
`TenantSource` implementation beside the current in-memory helpers (retain in-memory helpers for
unit tests that inject sources). No backend workspace changes.

## Complexity Tracking

> None. Postgres remain deferred by explicit research decision, not an unjustified extra abstraction.
