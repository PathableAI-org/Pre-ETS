# Infrastructure

This area owns infrastructure outcomes independently of application behavior. The protected-data entries below
are proposed and unverified; [HIPAA application safeguards](hipaa.md#scope-and-regulatory-basis) supply the shared
PHI-handling assumption and application boundary. Operational programs and human procedures remain deferred.

## PREETS-INFRA-001

**Title:** Block test-route traffic at production ingress
**Classification:** Functional Requirement
**Owner / responsible boundary:** Production infrastructure ingress
**Lifecycle:** accepted
**Verification:** unverified

### Statement

Every production ingress must block all traffic to `/_test/*` before it reaches the frontend application,
regardless of route, HTTP method, or tenant host. The ingress response must not expose diagnostic configuration.

### Rationale and sources

Infrastructure owns production isolation of application diagnostics. Application availability does not establish
that external production access is blocked.

- Source: Functional Requirement.
- Decision: Maintainer approval on 2026-10-03 authorizes this replacement, preserving the approved behavior from
  2026-10-02 and 2026-10-03 except for the explicitly revised request scope and static selector clarification.

### Acceptance criteria

1. `GET /_test/tenant-config` on a valid configured tenant host is blocked through every production ingress.
2. Other routes and HTTP methods under `/_test/*` are also blocked before reaching the application.
3. Blocking responses do not expose tenant configuration, and application availability of diagnostics does not
   bypass ingress protection.

### Design constraints

- Production ingress rules block the entire `/_test/*` prefix; application-level environment gating is not the control.

### Open questions

None.

### Related requirements

- Replaces the ingress obligation in [PREETS-TENANT-002](tenant-resolution.md#preets-tenant-002).
- Protects [PREETS-TENANT-006](tenant-resolution.md#preets-tenant-006).

### Verification plan

Use Copilot PR review as an initial check against repository review instructions: production ingress must block
all `/_test/*` routes and methods before forwarding, rule ordering must not permit a bypass, and application-level
environment gating must not replace ingress protection. These instructions are planned work. Copilot review is
advisory and does not establish deployed enforcement.

Before deployment, use HashiCorp Sentinel to check Terraform plans for the required blocking rules on every
production frontend ingress, including their precedence and coverage of all methods and paths under `/_test/*`.
Test the policy with compliant and deliberately noncompliant plans, including missing rules and bypassing rule
order. A passing policy establishes the checked plan's compliance, not runtime traffic behavior.

After deployment, run a dedicated Playwright API verification suite against every deployed production ingress.
Exercise `GET /_test/tenant-config` on a valid tenant host plus other routes and methods under `/_test/*`. Assert
the ingress's blocking response and absence of diagnostic configuration, supporting criteria 1 through 3. Correlate
probe requests with ingress evidence showing rejection before forwarding; a 404 alone could originate from the
application and cannot establish blocking. Include a permitted application request as a control so a generally
unreachable ingress cannot make the blocking checks pass.

The deployment process must run the Sentinel gate before applying infrastructure and mark deployment successful
only after the post-deployment ingress suite passes. Record policy and deployed-test results separately with their
revision, environment, exercised entry points, and limitations. Finite probes cover the exercised cases; policy
checks support broader route coverage. Neither application-only tests nor configuration review alone establish
executed production ingress enforcement. Tools and deployment gates described here are planned, not implemented.

### Verification evidence

No reviewed, executed evidence has been recorded. This documentation change does not establish runtime behavior.

## PREETS-INFRA-002

**Title:** Reproduce the local backend database and migration workflow
**Classification:** Functional Requirement
**Owner / responsible boundary:** Local development infrastructure and backend persistence
**Lifecycle:** proposed
**Verification:** unverified

### Statement

A developer must be able to use repository-owned Docker Compose configuration and developer-generated local
passwords to start a machine-local Postgres database and explicitly apply the backend's ordered SQL migrations with
Flyway. Repeating the migration command must not reapply successful versioned migrations.

### Rationale and sources

The shared Compose and migration files make local database setup repeatable without sharing a running developer
database or requiring host-installed Postgres and Flyway tools.

- External references: [Docker Compose](https://docs.docker.com/compose/) and
  [Flyway migrations](https://www.baeldung.com/database-migrations-with-flyway).

### Acceptance criteria

1. A developer with Docker Compose and generated, nonempty local passwords can start healthy Postgres from the
   repository; blank passwords fail before a service starts.
2. Postgres publishes only on the loopback interface and retains data across ordinary container recreation.
3. A developer can use the repository Flyway service to inspect, apply, and validate the ordered backend SQL files.
4. A second migration run reports the schema as current without reapplying successful migrations.
5. Removing the local Postgres volume and rerunning the documented commands reconstructs the migrated schema.
6. Tracked examples and migrations contain no production credentials, client records, or PHI.

### Design constraints

- Application processes remain on the host; Compose supplies external services only.
- Migration execution is explicit and does not run as a side effect of starting Postgres.
- The proof-of-process schema is synthetic and does not establish the Consumer service-log domain model.
- Deployment automation is a future increment.

### Open questions

None for the local proof of process. Production database topology, credentials, deployment automation, and the
domain schema require separate decisions.

### Verification plan

Render the Compose model with each password missing in turn and confirm it fails before service startup. Supply two
generated passwords and confirm the Postgres host binding, health check, named volume, Flyway dependency, read-only
migration mount, and disabled `clean` behavior. Start Postgres from an empty volume and capture its healthy status.
Run Flyway `info`, `migrate`, and `validate`; query the dummy table and `flyway_schema_history`; run `migrate` again
and confirm no migration is reapplied. Recreate the Postgres container without deleting the volume and confirm the
table and history remain. Finally, delete the disposable local volume, repeat the setup, and confirm the same schema
is reconstructed.

This evidence establishes the exercised local Docker environment only. It does not establish deployment behavior,
production durability, application persistence, or approval of the domain schema.

### Verification evidence

No reviewed, executed evidence has been recorded. The implementation pull request should record command output,
platform, revision, covered criteria, and limitations after executing the verification plan.

## PREETS-HIPAA-007

**Title:** Recover protected data from infrastructure backups
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Deployed backup, storage, and recovery infrastructure
**Lifecycle:** proposed
**Verification:** unverified

### Statement

For a deployment storing ePHI, infrastructure must maintain retrievable exact backup copies and support restoration of protected data and its associations after loss of the primary data store.

### Rationale and sources

Users depend on recovery after storage loss, independently of ordinary application-process durability. The historical ID is preserved when moving this proposal from the HIPAA area.

- Source: [45 CFR 164.308(a)(7)(ii)(A)–(C)](https://www.ecfr.gov/current/title-45/section-164.308). Reviewed 2026-10-09; rechecked 2026-10-10. The criteria define infrastructure capability; emergency-mode staffing and procedures remain deferred.
- Scope decision: Maintainer direction (2026-10-10) retains supporting software capabilities and separates infrastructure from application requirements. This scope decision does not approve the detailed obligation or establish verification.

### Acceptance criteria

1. The deployed infrastructure produces and retains retrievable exact copies of the protected datasets identified by the backup-scope contract, including stored incomplete and ordinarily deleted records and their associations where retained by policy.
2. After controlled loss of the primary store, infrastructure can restore an actual backup into a replacement store without relying on the lost store or its application process; restored identities, tenant/owner associations, recorded values, and deletion status match the selected recovery point.
3. Restored data remains protected by the selected infrastructure access and confidentiality controls; recovery does not expand access or turn ordinarily deleted records into visible records.
4. The selected backup frequency, permitted data-loss window, and restore-time target are reflected in infrastructure behavior and supported by measured backup/restore evidence. Targets must be specified before delivering the affected infrastructure.

### Open questions

Backup scope/frequency, retention, acceptable data loss, restore-time targets, recovery-point selection, dependencies such as schema and keys, and infrastructure behavior needed for protected emergency continuity. Provider responsibilities, human recovery procedures, critical-business-operation selection, and contingency review programs remain deferred operational work. No zero-data-loss or continuous-availability guarantee is selected.

Maintainer decision (2026-10-10): choose backup frequency, acceptable data loss, and restore-time targets during
infrastructure delivery planning, before delivering the affected infrastructure.

### Verification plan

Planned evidence only: exercise deployed backup and restore mechanisms with synthetic protected records, incomplete and deleted records, and multiple tenants. Remove access to the original primary store, restore a real backup into a replacement, compare restored contents and associations with the selected recovery point, and measure data-loss/restore-time bounds against approved targets. Verify access restrictions after restoration. Application process restart, ordinary reload, fixtures, and a backup configuration alone do not establish restore capability.

### Related requirements

- [PREETS-ONSITE-004](data-input-workflows.md#preets-onsite-004) covers application-process-independent durability; it does not establish backup recovery.
- [PREETS-INFRA-003](#preets-infra-003) protects infrastructure copies and transfers.
- [PREETS-INFRA-004](#preets-infra-004) applies retention and disposal policy to infrastructure copies.
- Application authorization remains governed by [PREETS-HIPAA-002](hipaa.md#preets-hipaa-002).

### Verification evidence

No reviewed, executed evidence has been recorded. This documentation change does not establish runtime behavior or compliance.

## PREETS-INFRA-003

**Title:** Infrastructure confidentiality for protected storage and transport
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Deployed storage, transport, and platform key-management controls
**Lifecycle:** proposed
**Verification:** unverified

### Statement

Infrastructure storing or transmitting ePHI must enforce the selected confidentiality protections and restrict data and key access to authorized identities.

### Rationale and sources

Protected application behavior cannot establish protection of database volumes, backup copies, infrastructure-managed transfers, or platform key access. This separates the infrastructure portion of PREETS-HIPAA-006.

- Source: [45 CFR 164.312(a)(2)(iv), (e)](https://www.ecfr.gov/current/title-45/section-164.312). Reviewed 2026-10-09; rechecked 2026-10-10. Encryption/alternative approval remains separate operational work.
- Scope decision: Maintainer direction (2026-10-10) retains supporting software capabilities and separates infrastructure from application requirements. This scope decision does not approve the detailed obligation or establish verification.

### Acceptance criteria

1. Deployed database/storage volumes, backup copies, and infrastructure-managed network hops containing ePHI use the selected encryption or approved alternative safeguards, including during backup and restoration.
2. Direct infrastructure access to protected data and keys is restricted to authorized identities; unauthorized and revoked identities cannot obtain protected contents or keys through those interfaces.
3. Replacement storage and recovery environments preserve the selected confidentiality and access protections; successful application authentication alone does not establish access to infrastructure copies.

### Open questions

Selected storage/transport protection contract, infrastructure identities, algorithms, key-access/rotation behavior, and failure outcomes. Human key custody, approval of addressable controls, and provider responsibility allocation remain deferred operational work.

### Verification plan

Planned evidence only: inspect the deployed storage/backup/transport protections and exercise authorized, unauthorized, and revoked infrastructure identities with synthetic PHI. Include a replacement recovery environment and platform key access. Configuration checks and runtime access/transport observations establish different claims; record each boundary and limitation.

### Related requirements

- Separates infrastructure protection from [PREETS-HIPAA-006](hipaa.md#preets-hipaa-006).
- Applies to backups under [PREETS-HIPAA-007](#preets-hipaa-007).

### Verification evidence

No reviewed, executed evidence has been recorded. This documentation change does not establish runtime behavior or compliance.

## PREETS-INFRA-004

**Title:** Infrastructure enforcement of protected-copy retention and disposal
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Deployed storage, backup-retention, and infrastructure deletion controls
**Lifecycle:** proposed
**Verification:** unverified

### Statement

Infrastructure must protect retained ePHI copies and enforce the separately approved retention, hold, and disposal contract for storage and backup copies it owns.

### Rationale and sources

Application removal alone cannot establish removal or continued protection of retained infrastructure copies. This separates infrastructure-copy treatment from PREETS-HIPAA-011.

- Source: [45 CFR 164.310(d)](https://www.ecfr.gov/current/title-45/section-164.310) and [HHS record-retention FAQ](https://www.hhs.gov/hipaa/for-professionals/faq/does-hipaa-require-covered-entities-to-keep-medical-records-for-any-period/index.html). Reviewed 2026-10-09; applicability follows the shared PHI-handling assumption.
- Scope decision: Maintainer direction (2026-10-10) retains supporting software capabilities and separates infrastructure from application requirements. This scope decision does not approve the detailed obligation or establish verification.

### Acceptance criteria

1. Storage and backup copies retained by the approved policy remain protected by infrastructure access and confidentiality controls, including after application records are ordinarily or permanently deleted.
2. Infrastructure retention/deletion mechanisms enforce the approved copy-level retention and hold contract: they do not destroy copies still required by that contract, and authorized eligible disposal removes them within the selected infrastructure scope.
3. A retained backup containing records removed from the application remains protected until its policy permits disposal. Recovery applies the approved handling of records disposed of after that backup's recovery point before restored data becomes available for application access; recovery does not silently reintroduce disposed records contrary to policy.
4. Disposal evidence identifies the copy scope and result; application record deletion or an expiry configuration alone does not establish destruction of infrastructure copies or sanitization of physical media.

### Open questions

Infrastructure copy inventory, retention/hold contract and granularity, authorized disposal, deletion failure outcomes, evidence from externally managed storage, and post-restore handling of intervening disposals. Legal/contract retention schedules and physical media sanitization remain deferred operational work; no blanket six-year service-record retention is selected.

### Verification plan

Planned evidence only: use synthetic protected data to exercise retention, holds, eligible disposal, and denied disposal against actual infrastructure copies. Verify retained-copy access protection after application removal. Restore an older backup and observe the selected handling of subsequent disposals before application exposure. Inspect copy-specific disposal results and state their limits.

### Related requirements

- Separates infrastructure copies from [PREETS-HIPAA-011](hipaa.md#preets-hipaa-011).
- Applies during restoration under [PREETS-HIPAA-007](#preets-hipaa-007).
- [PREETS-INFRA-003](#preets-infra-003) protects retained copies.

### Verification evidence

No reviewed, executed evidence has been recorded. This documentation change does not establish runtime behavior or compliance.
