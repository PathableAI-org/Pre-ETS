# Infrastructure

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
