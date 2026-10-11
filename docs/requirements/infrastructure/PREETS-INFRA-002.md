---
id: PREETS-INFRA-002
classifications:
  - Functional
---

# Reproduce the local backend database and migration workflow

**Owner / responsible boundary:** Local development infrastructure and backend persistence

## Description

A developer must be able to use repository-owned Docker Compose configuration and developer-generated local
passwords to start a machine-local Postgres database and explicitly apply the backend's ordered SQL migrations with
Flyway. Repeating the migration command must not reapply successful versioned migrations.

## Rationale

The shared Compose and migration files make local database setup repeatable without sharing a running developer
database or requiring host-installed Postgres and Flyway tools.

## Sources

- Repository decision: [Local Postgres migrations PR #113](https://github.com/PathableAI-org/Pre-ETS/pull/113), merged into main; the former proposed label does not override Git approval history.

- External references: [Docker Compose](https://docs.docker.com/compose/) and
  [Flyway migrations](https://www.baeldung.com/database-migrations-with-flyway).

## Acceptance criteria

1. A developer with Docker Compose and generated, nonempty local passwords can start healthy Postgres from the
   repository; blank passwords fail before a service starts.
2. Postgres publishes only on the loopback interface and retains data across ordinary container recreation.
3. A developer can use the repository Flyway service to inspect, apply, and validate the ordered backend SQL files.
4. A second migration run reports the schema as current without reapplying successful migrations.
5. Removing the local Postgres volume and rerunning the documented commands reconstructs the migrated schema.
6. Tracked examples and migrations contain no production credentials, client records, or PHI.

## Design constraints

- Application processes remain on the host; Compose supplies external services only.
- Migration execution is explicit and does not run as a side effect of starting Postgres.
- The proof-of-process schema is synthetic and does not establish the Consumer service-log domain model.
- Deployment automation is a future increment.

## Open questions

None for the local proof of process. Production database topology, credentials, deployment automation, and the
domain schema require separate decisions.

## Verification Plan

Manual local-environment verification and configuration assessment must establish credential prerequisites, loopback binding, healthy Postgres startup, persistence across ordinary recreation, explicit ordered Flyway migration, non-reapplication of successful migrations, and reconstruction from disposable empty storage. Repository-content assessment must establish that tracked examples and migrations contain no production credentials, client records, or PHI. The existing [local Docker guide](../../docker-compose.md) supplies setup context; detailed pre-migration verification instructions remain available in Git history.

Evidence must identify its local platform, revision, observed outcomes, and limitations. It establishes the exercised local environment, not production durability, deployed behavior, application persistence, or approval of the domain schema. Production verification remains outside this contract.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.
