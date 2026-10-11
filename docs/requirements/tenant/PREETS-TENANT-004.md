---
id: PREETS-TENANT-004
classifications:
  - Functional
dependencies:
  - PREETS-SECURITY-001
---

# Retrieve the selected tenant configuration

**Owner / responsible boundary:** Frontend tenant configuration retrieval

## Description

A frontend consumer must receive the parsed configuration corresponding to its selected tenant. When static mode's
selected configuration file does not exist, the request must receive HTTP 500 Internal Server Error without fallback
configuration.

Configuration that fails to parse prevents the server from starting. When `TENANT_CONFIG_DIR` parses, a nonexistent
directory, a path that is not a directory, or an unreadable directory produces HTTP 500 in either mode. When the
directory is usable, a missing host-mode tenant file, or an unreadable or malformed selected tenant file in either
mode, is treated like a tenant not found: ordinary HTTP 404
without fallback. A missing static-mode selected file retains HTTP 500. Malformed includes invalid JSON or configuration
that fails the permitted schema. No separate configured-tenant registry is required to distinguish file failures.

## Rationale

Consumers need the configuration corresponding to the selected tenant. Missing static configuration is a system
failure, not an unknown host, and must not silently substitute another file.

## Sources

- Legacy source label: Functional Requirement; obligation attribution is recorded in the maintainer decisions below.
- Decision: Maintainer approval on 2026-10-03 authorizes this replacement, preserving the approved behavior from
  2026-10-02 and 2026-10-03 except for the explicitly revised request scope and static selector clarification.
- Decision: Maintainer direction on 2026-10-03 resolves B1 and replaces the earlier known-configuration-failure
  distinction with the directory/file outcomes below. The maintainer explicitly preserves static missing-file 500,
  approves unreadable/malformed file 404 in both modes, and directory configuration/access failures 500 in both modes.

## Acceptance criteria

1. For two selected aliases with distinct configuration files, consumers receive their corresponding parsed values,
   including across interleaved requests, without substitution of another tenant's configuration.
2. `TENANT_CONFIG_DIR` is required in every resolution mode and identifies a directory of `{alias}.json` tenant files.
   Configuration that fails to parse prevents the server from starting. When the setting parses, a nonexistent
   directory, a non-directory path, or an unreadable directory produces actual HTTP 500 without fallback, in both modes.
3. In static mode, an existing usable file for `TENANT_STATIC_ALIAS` supplies its parsed configuration.
4. In static mode, a missing selected `{alias}.json` file produces an actual HTTP 500 response without fallback.
5. With a usable directory, a missing host-mode file or an unreadable/malformed selected file in either mode
   produces ordinary HTTP 404 with no fallback, as for a tenant not found. A missing static-mode file follows AC4.
   Invalid JSON and schema-invalid configuration are malformed files; directory failures follow AC2 instead.

## Design constraints

- `TENANT_CONFIG_DIR` is always required and points to the tenant configuration directory.
- The selected alias maps to `{TENANT_CONFIG_DIR}/{alias}.json`; consumers receive the parsed JSON configuration.
- Static selection uses the existing `TENANT_STATIC_ALIAS` interface.

## Open questions

None for the directory/file response policies resolved here.

## Implementation dependencies

Implement the approved directory/file distinction at the responsible boundary. No separate configured-tenant
membership source is needed for these outcomes. Preserve the non-secret configuration dependency below.

## Related requirements

- Replaces [PREETS-TENANT-001](../deprecated/tenant/PREETS-TENANT-001.md).
- Used by [PREETS-TENANT-003](PREETS-TENANT-003.md) and [PREETS-TENANT-006](PREETS-TENANT-006.md).
- Required content constraint: [PREETS-SECURITY-001](../security/PREETS-SECURITY-001.md).

## Verification Plan

Running-application HTTP and configuration-consuming behavior evidence must establish alias-to-file correspondence and no fallback, including interleaved tenants. Evidence must distinguish configuration parse failure that prevents startup from parsed directory access failures in both modes and static missing-file failures (HTTP 500) from host missing-file and unreadable/malformed selected-file failures (ordinary HTTP 404). Expected configuration must be independent of the application response. An error message alone does not establish status; configuration assessment alone does not establish application behavior. No unresolved verification question is identified for the approved response policies.

## Delivery references

- [Tenant delivery parent #115](https://github.com/PathableAI-org/Pre-ETS/issues/115): coordinates the selected criteria.
- [S1 — Load and expose the selected non-secret tenant configuration #116](https://github.com/PathableAI-org/Pre-ETS/issues/116): AC 1–3.
- [S3 — Complete approved tenant HTTP and browser failure outcomes #118](https://github.com/PathableAI-org/Pre-ETS/issues/118): AC 2, 4, 5.

Published work is tracked in the [tenant delivery plan](../../delivery/tenant-resolution.md). These links do not
establish executed verification evidence.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.
