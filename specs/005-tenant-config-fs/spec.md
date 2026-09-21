# Feature Specification: Filesystem Tenant Configuration Persistence

**Feature Branch**: `005-tenant-config-fs`

**Created**: 2026-09-21

**Status**: Draft

**Input**: User description: "We now want to implement the real persistence layer for the tenant config. Tenant configs will be read from the file system. There should be a new environment variable that holds the directory these files are stored in, then the specific configuration would be read by using the tenant alias from the HOST. Each tenant will have its own file like tenantDir/${tenantAlias}.json. There will also be a new environment variable for static tenant resolution that just gives the name of the tenant to us."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Serve host-bound tenants from durable files (Priority: P1)

An operator places each tenant’s configuration in its own file under a configured directory, named after that tenant’s alias. When a visitor reaches a known tenant host, the application loads only that tenant’s file and uses its configuration. When the alias has no file, or the file is unusable, the request fails closed without substituting another tenant’s configuration.

**Why this priority**: Host-associated production and production-like local work need a durable, per-tenant source that replaces embedding all known records in a single environment value.

**Independent Test**: Configure a directory with at least two synthetic tenant files that have distinct Display Names. Visit each tenant’s host and verify the matching Display Name; remove or corrupt one file and verify that tenant is refused without affecting the other.

**Acceptance Scenarios**:

1. **Given** a configured tenant configuration directory containing `springfield.json` and `shelbyville.json` with distinct Display Names, **When** a visitor reaches `springfield.pathable.com` (or the equivalent local host pattern), **Then** the current tenant is `springfield` and consumers receive only springfield’s configuration.
2. **Given** the same directory, **When** a visitor reaches `shelbyville`’s host, **Then** consumers receive shelbyville’s configuration and never springfield’s.
3. **Given** a correctly shaped tenant host whose alias has no matching file in the directory, **When** the request is processed, **Then** the outcome is the same unknown-tenant refusal used today (HTTP 403) with no substituted configuration.
4. **Given** a host-associated alias whose file is missing required fields, malformed, unreadable, or identifies a different tenant than the filename alias, **When** configuration is read, **Then** the operation fails visibly as a configuration failure without exposing another tenant’s data.
5. **Given** an established host association for `springfield`, **When** configuration is read, **Then** the application opens only the springfield file under the configured directory and does not scan or load other tenants’ files for that request.

---

### User Story 2 - Static local mode by tenant name only (Priority: P1)

A frontend developer enables static tenant resolution and supplies only the tenant alias (name), not a full inline configuration document. The application loads that tenant’s file from the same configured directory and presents its configuration on `localhost`, still distinguishable from host association.

**Why this priority**: Local configuration work must stay simple while sharing the durable file source, instead of maintaining a separate full JSON blob in the environment.

**Independent Test**: Point the directory at synthetic files, set static mode with alias `springfield`, open `localhost`, and verify springfield’s Display Name. Change the file contents (or point the alias at another file) and verify the updated outcome after the documented reload or restart.

**Acceptance Scenarios**:

1. **Given** development static resolution is enabled, the configuration directory is set, and the static tenant name is `springfield`, **When** the developer opens `localhost`, **Then** the landing experience shows springfield’s configuration from `springfield.json` without claiming the host established a tenant association.
2. **Given** this static mode, **When** the static tenant name is missing, blank, or does not match a usable file in the directory, **Then** the developer receives an understandable configuration error and no successful tenant context or default tenant is returned.
3. **Given** this static mode, **When** the named file’s contents are invalid or its declared tenant identity does not match the static name, **Then** the outcome is a configuration error with no successful context.
4. **Given** production operation, **When** static-mode settings or a static tenant name are supplied, **Then** they cannot bypass host association or serve the static stand-in.

---

### User Story 3 - Operate without inline multi-tenant JSON (Priority: P2)

Operators and developers no longer supply the previous inline multi-record and full static-record environment documents as the configuration source. Documentation and examples describe the directory, per-tenant files, and the static tenant-name setting instead.

**Why this priority**: Completes the cutover to the durable source and prevents two competing configuration mechanisms from diverging.

**Independent Test**: Follow the updated local instructions using only the directory and static-name (or host) settings; confirm the prior inline multi-record and full static JSON sources are not required and are not read when the filesystem source is in use.

**Acceptance Scenarios**:

1. **Given** a developer or operator follows the documented filesystem configuration setup, **When** they configure the directory (and static tenant name if using static mode), **Then** they can complete the existing host and static workflows without providing the former inline multi-tenant or full static JSON environment documents.
2. **Given** those former inline documents are still present in the environment while the filesystem source is configured, **When** tenant configuration is read, **Then** the filesystem source is authoritative and the inline documents are not used as the tenant configuration source.

### Edge Cases

- Missing, empty, or non-directory configuration directory path fails as configuration unavailable, not as a silent empty tenant set that could be confused with “no tenants provisioned” without diagnosis.
- Filename alias and host-bound alias MUST use the same tenant identity rules already established for slugs (canonical alias); non-canonical filenames are not treated as known tenants.
- A file present for alias A MUST NOT be returned when the bound or static alias is B.
- Concurrent requests for different tenants MUST each read only their own file and MUST NOT share or overwrite another request’s configuration.
- Directory traversal or alias values that attempt to escape the configured directory MUST be rejected; only a single configuration file directly under the configured directory, named `{alias}.json`, is eligible.
- Changing a tenant file takes effect according to the documented reload or restart procedure; live hot-reload of files is not required for this increment.
- Credentials, tokens, and real client records MUST NOT appear in committed examples or fixtures; synthetic files only.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST read tenant configuration from a filesystem directory whose location is supplied by a dedicated environment setting (the tenant configuration directory).
- **FR-002**: For host-associated requests, the system MUST load configuration exclusively from `{directory}/{tenantAlias}.json`, where `tenantAlias` is the tenant identity already determined from the trusted host binding. It MUST NOT reinterpret the host inside the configuration reader.
- **FR-003**: Each tenant MUST have at most one configuration file, named exactly `{tenantAlias}.json`, directly under the configured directory.
- **FR-004**: The filesystem source MUST preserve the existing consumer contract: callers obtain the current tenant and matching configuration without knowledge of storage layout, and host association remains separate from configuration reads.
- **FR-005**: A missing file for a host-bound alias MUST be treated as an unknown tenant (HTTP 403), with no configuration substitution.
- **FR-006**: An unreadable directory, unreadable file, malformed file, invalid configuration content, or file whose tenant identity does not match the requested alias MUST be treated as a configuration failure (fail visible; no successful context; distinguishable from unknown tenant where the product already distinguishes those outcomes).
- **FR-007**: Development-only static resolution MUST accept a dedicated environment setting that supplies only the tenant alias (name), not a full configuration document. The system MUST load that alias’s file from the same tenant configuration directory.
- **FR-008**: Static mode MUST remain development-only and MUST NOT bypass host association in production. Missing or invalid static name or file MUST produce an understandable local configuration error with no default tenant.
- **FR-009**: The former inline multi-tenant records environment document and the former full static configuration environment document MUST cease to be the configuration source once the filesystem directory source is adopted. Documentation and examples MUST describe the directory and static-name settings instead.
- **FR-010**: Configuration file contents MUST continue to satisfy the existing tenant configuration validation rules (including Display Name, OIDC settings, and optional idle timeout). Files MUST identify the same tenant alias as their filename; a mismatch is a configuration failure.
- **FR-011**: Reads MUST be confined to the configured directory: aliases MUST NOT resolve to paths outside that directory or to nested paths.
- **FR-012**: Per-request isolation MUST be preserved: overlapping requests for different tenants MUST NOT observe each other’s configuration.
- **FR-013**: Developers and operators MUST have documented instructions for setting the directory, naming files, using static tenant name mode, recognizing missing-file vs configuration-error outcomes, and any reload or restart needed after file changes. Examples and fixtures MUST be synthetic.

### Key Entities

- **Tenant alias**: The unique tenant identity already used as the slug (for example `springfield`). Derived from the host in host mode, or supplied by the static-name setting in static mode.
- **Tenant configuration directory**: The configured filesystem location that holds one JSON file per tenant.
- **Tenant configuration file**: The JSON document at `{directory}/{tenantAlias}.json` holding that tenant’s configuration and confirming the same alias.
- **Static tenant name**: The development-only environment value naming which single tenant file to use when host association is disabled locally.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Across acceptance cases with at least two tenant files, 100% of successful host-associated visits expose only the intended tenant’s configuration (for example Display Name), including overlapping requests.
- **SC-002**: 100% of missing-file host cases refuse with HTTP 403 and zero substituted configurations; 100% of malformed/mismatched/unreadable file cases fail as configuration failures with no successful tenant context.
- **SC-003**: A developer following the updated instructions can complete static mode on `localhost` using only the directory setting plus the static tenant name, with zero dependence on the former full static JSON environment document.
- **SC-004**: A developer or tester can complete host-associated local or production-like flows using only per-tenant files under the directory, with zero dependence on the former inline multi-tenant JSON environment document.
- **SC-005**: Changing a tenant file’s Display Name changes the visible name after the documented reload or restart for both host-associated and static-name workflows.
- **SC-006**: All production bypass attempts using static-name or static-mode settings fail to disable required host association; path-escape and cross-tenant file attempts yield zero successful wrong-tenant contexts.
- **SC-007**: Consumers that already call the current tenant/configuration accessors require no new host parsing or storage-path knowledge to keep working after the source cutover.

## Assumptions

- “Tenant alias” in this feature is the same unique slug already used for host binding and tenant identity (`springfield`, not a separate parallel identifier).
- File naming is exactly `{alias}.json` (lowercase canonical alias), one level under the configured directory; no subdirectories or alternate extensions in this increment.
- Each file includes enough identity information to verify it matches the filename alias (same fail-closed mismatch rule as today’s record/slug checks). Exact JSON field layout remains a planning concern so long as existing configuration validation continues to apply.
- The filesystem source is read-only from the application’s perspective: no in-product editor, upload, or write API is required.
- Live file watching / hot reload is out of scope; documented process reload or restart is acceptable.
- Existing host-binding rules, HTTP 403 vs configuration-failure distinctions, development-only static mode gating, Display Name presentation, OIDC fields, and idle timeout validation remain as already specified; this feature replaces the configuration **source**, not those policies.
- Environment setting **names** are chosen in planning; this specification requires the two new settings’ **roles** (directory path; static tenant name only).
- Former `TENANT_CONFIG_RECORDS_JSON` and `TENANT_LOCAL_CONFIG_JSON` roles are superseded as configuration sources; removing dead code and updating `.env.example` / docs are in scope for implementation planning.
- Synthetic fixtures under a sample directory satisfy verification; real client records and secrets stay out of the repository.
- Backend domain persistence and shared packages are out of scope; tenant configuration remains frontend-owned.
