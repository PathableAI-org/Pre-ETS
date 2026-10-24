# Feature Verification Plan: Deterministic Application Bootstrap and Runtime Composition

**Feature specification**: [spec.md](spec.md)

**Delivery issue**: None — explicit maintainer exception authorized 2026-10-24

**Status**: Planned — no execution evidence is recorded by this document

## Authority and scope

This plan covers the direct 2026-10-24 maintainer instruction for deterministic bootstrap, fatal startup handling,
progressive observability, coherent process-wide configuration, explicit readiness, and preserved application
behavior. Current `origin/main` revision `d75c6eac498d6c6c59821e71cef6a74bf5e81ecd` supplies the preserved
PREETS-TENANT-004, PREETS-SECURITY-001, PREETS-SESSION-002, PREETS-SESSION-003, and PREETS-SESSION-006 contracts.
The maintainer explicitly waived the ordinary delivery-issue prerequisite for this cross-cutting refactor.

Observability evidence is entirely manual. Automated evidence is limited to deterministic application outcomes and
composition contracts; it must not inspect logs, spans, metrics, exporters, or telemetry-pipeline internals. This
document plans evidence only and makes no claim that any procedure has run.

## Claims and traceability

| ID    | Claim to establish                                                                                                                                                                | Authoritative source                                                                                                             | Meaningful violation                                                                                                                                      | Required observation                                                                                                                                                                                   |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V-001 | Successful startup follows the required stages and declares readiness only after the complete application and required resources are acquired.                                    | Direct maintainer instruction 2026-10-24, Desired Behavior 1 and 7                                                               | Readiness or business work begins while a required stage or resource remains incomplete.                                                                  | Actual startup reaches readiness only after configuration, observability, application services, and required resources report successful initialization.                                               |
| V-002 | Every required startup failure is stage-identified, safely diagnosed, cleaned up where possible, and followed by nonzero process termination without readiness.                   | Direct maintainer instruction 2026-10-24, Desired Behavior 2                                                                     | A failed start remains running, appears ready, omits the failing stage, leaks sensitive data, or hangs during reporting/cleanup.                          | Controlled failures at configuration, observability, and application acquisition show the expected diagnostic path, cleanup attempt, bounded delivery behavior, exit status, and absence of readiness. |
| V-003 | Bootstrap has reliable standard-error diagnostics before configured observability, and enabled application execution exposes real structured logs, traces, and metrics afterward. | Direct maintainer instruction 2026-10-24, Desired Behavior 3                                                                     | Early failure is silent, or enabled runtime telemetry lacks one of the required signal types.                                                             | Inspect actual standard error and configured log, trace, and metric destinations for one startup execution and related request.                                                                        |
| V-004 | Intentional telemetry disablement permits startup with local diagnostics, while invalid required telemetry initialization fails startup.                                          | Direct maintainer instruction 2026-10-24, Desired Behavior 3                                                                     | Disabled telemetry is treated as fatal, local diagnostics disappear, or invalid required settings are silently ignored.                                   | Compare real disabled and invalid configurations and observe startup/exit outcomes and local diagnostics.                                                                                              |
| V-005 | Collector loss after successful initialization follows best-effort delivery and does not terminate an otherwise healthy application.                                              | Direct maintainer instruction 2026-10-24, Desired Behavior 3                                                                     | Later exporter connectivity loss makes the application unready or terminates it.                                                                          | Stop or isolate the collector after startup, exercise a request, observe local delivery diagnostics, and confirm continued request service.                                                            |
| V-006 | Process-wide configuration is validated before dependent service acquisition and can be substituted as one coherent dependency in composition tests.                              | Direct maintainer instruction 2026-10-24, Desired Behavior 4–6                                                                   | Services independently reinterpret process settings or composition cannot be acquired with controlled configuration and infrastructure.                   | Deterministic configuration and composition scenarios demonstrate one validated input and replaceable dependencies without process startup.                                                            |
| V-007 | Per-request tenant loading and existing authentication, transaction, session, typed-error, and HTTP outcomes remain unchanged.                                                    | PREETS-TENANT-004 AC1–5; PREETS-SECURITY-001 AC1–3; PREETS-SESSION-002 AC1–3; PREETS-SESSION-003 AC1–3; PREETS-SESSION-006 AC1–3 | Refactor changes tenant selection/fallback, secret boundaries, authentication outcomes, transaction/storage semantics, session behavior, or HTTP mapping. | Existing public-service, integration, framework, and requirements-backed application scenarios retain their accepted outcomes.                                                                         |
| V-008 | Production build does not acquire runtime resources, while supported request integration never executes business operations against a partial application.                        | Direct maintainer instruction 2026-10-24, Desired Behavior 7                                                                     | Build requires live services, or a request executes through an incomplete runtime.                                                                        | Build succeeds with runtime dependencies unavailable; startup/readiness probe records the strongest request-gating guarantee supported by the exercised host.                                          |
| V-009 | Startup and telemetry diagnostics expose no credentials, resolved secrets, authorization material, tokens, or tenant configuration contents.                                      | PREETS-SECURITY-001 AC1–3; direct maintainer instruction 2026-10-24, Desired Behavior 2–3                                        | Sensitive configuration appears in standard error or exported telemetry.                                                                                  | Manual inspection of all retained startup failure and telemetry samples finds no prohibited values.                                                                                                    |

## Automated behavioral evidence

| Claim IDs | Evidence boundary                                                | Planned scenario or property                                                                                                                                                      | Why this boundary is meaningful                                                                          | Known limits                                                                                           |
| --------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| V-006     | Startup-configuration public boundary                            | Valid, omitted/defaulted, malformed, and cross-field-invalid process settings yield the documented validated value or typed failure.                                              | Protects deterministic configuration semantics without observing telemetry or private parsing structure. | Does not prove process exit, diagnostics, or deployment environment values.                            |
| V-006     | Application composition boundary                                 | Acquire the production application composition with controlled configuration and substitute infrastructure; exercise public services without a web server or process termination. | Proves dependency substitution and resource acquisition from a real consumer boundary.                   | Does not prove Next.js startup sequencing or real external-adapter behavior.                           |
| V-007     | Existing frontend public-service and integration suites          | Retain tenant, authentication, authentication-failure, configuration, and real-Redis scenarios with unchanged outcomes.                                                           | Detects contract drift in the services and adapters affected by recomposition.                           | Simulated dependencies do not establish real infrastructure; existing requirements limitations remain. |
| V-007     | Existing framework and requirements-backed application scenarios | Run applicable HTTP/browser scenarios against the composed application, including tenant and authentication failure mappings.                                                     | Detects regressions at the running-application boundary rather than private structure.                   | Only scenarios backed by accepted `origin/main` requirements may be added to requirements BDD.         |
| V-008     | Production build                                                 | Run the production build with runtime-only services unavailable and no usable production credentials.                                                                             | Directly protects import/build separation from process startup.                                          | Does not establish deployed readiness or runtime acquisition.                                          |

No automated scenario may assert standard-error text, emitted log records, spans, metrics, exporter calls, telemetry
payloads, or pipeline internals. Requirements-backed BDD remains limited to accepted `origin/main` behavior, carries
requirement-ID tags, and uses feature-level `@partial` for bounded intermediate evidence. A dry run establishes
discovery only, not runtime behavior.

## Agent-executable manual feature verification _(mandatory)_

### Purpose

Exercise the real frontend process across successful and failed bootstrap stages, inspect progressive diagnostics and
actual telemetry destinations, and establish the strongest readiness/request-gating guarantee supported by the
Next.js host. This adds lifecycle and operational observations that deterministic automated service tests cannot make.

### Prerequisites

- A clean implementation revision with dependencies installed and repository quality checks complete.
- Synthetic tenant and authentication configuration only; no PHI, real client records, production credentials, or production collector headers.
- The repository's supported Node and pnpm versions.
- Redis and any other required application services, with owned test keys and explicit cleanup.
- The existing `otel-lgtm` Compose profile and an authorized Grafana UI or read-only Grafana MCP connection.
- Two unused local ports when a readiness/request race must be observed through separate process and probe clients.
- A shell capable of capturing standard error, process exit status, timestamps, and request outcomes without committing raw transcripts.

### Procedure

1. Record the exact Git revision, runtime/tool versions, environment type, synthetic fixture identity, enabled telemetry capabilities, collector address class (not credentials), and deployment host mode. Confirm that no real secrets or PHI are present.
2. Start the existing local observability stack with `docker compose --profile observability up -d otel-lgtm --wait`. Use the configured frontend OTLP endpoint and start required Redis/application dependencies with owned synthetic data.
3. Start the production application with valid configuration and telemetry enabled. Capture standard error and startup timestamps. Attempt a request during startup when the host permits it, then issue a request after startup completion. Record whether the listener blocked, rejected, or deferred the early request and confirm no business operation used a partial application. Confirm readiness occurs only after required resources are acquired. This is case 1: successful enabled startup and readiness (V-001, V-008).
4. Inspect the configured destinations for actual structured application logs, an application startup trace and request trace, and application metrics from the recorded window. Inspect one representative item of each signal for safe attributes and correlation, and retain identifiers rather than full payload dumps. Confirm local logging remains available. This completes case 1 (V-003, V-009).
5. Stop the frontend cleanly. Restart it with telemetry intentionally disabled using supported configuration. Confirm successful readiness, continued local standard-error or console diagnostics, absence of a requirement for collector connectivity, and successful request handling. This is case 2 (V-004).
6. Stop the frontend. Remove or invalidate one required process-wide setting such as the tenant configuration directory setting. Start the real process, capture the stage-identifying standard-error diagnostic and exit status, confirm no readiness or request service, and inspect output for sensitive values. This is case 3: configuration-validation failure (V-002, V-009).
7. Restore application configuration and configure an explicitly invalid required observability setting that fails initialization rather than merely making later export unreachable. Start the real process, confirm fallback standard-error diagnostics identify the observability stage, confirm application-service acquisition did not begin, and record nonzero termination. This is case 4 (V-002, V-004, V-009).
8. Restore valid enabled observability and make Redis unavailable on the configured address while leaving the collector available. Start the real process; inspect standard error and configured telemetry for the application-acquisition failure, confirm Redis/application readiness was never declared, confirm acquired observability resources receive cleanup and bounded flush attempts, and record nonzero termination even if export or cleanup is impaired. This is case 5 (V-002, V-003, V-009).
9. Restore Redis and complete a healthy telemetry-enabled startup. After initialization succeeds, stop or isolate only the collector, issue valid application requests, and confirm the process remains healthy and serves them while local output records best-effort delivery failure. This is case 6 (V-005).
10. Repeat the successful startup/readiness observation in each supported deployment form used for this feature (at minimum the documented local production server). For each form, record whether listener acceptance can be blocked and how the integration prevents a partial runtime from executing business operations. This is case 7 (V-001, V-008).
11. With runtime services stopped or unreachable and runtime-only credentials absent, run the production build. Confirm it completes without acquiring production resources or claiming runtime readiness (V-008).
12. Stop only services started for this procedure, remove owned Redis keys and synthetic temporary configuration, restore controlled failure settings, and confirm no temporary probes, output, credentials, or generated reports remain in the worktree.

### Expected observations

- V-001: Enabled startup exhibits the required stage order and readiness only after full acquisition.
- V-002: Each required failure identifies its stage, remains safely diagnosable, never reaches readiness, and terminates nonzero despite secondary reporting/cleanup problems.
- V-003: Bootstrap output exists on standard error before full observability; enabled operation yields actual structured logs, traces, and metrics plus local output.
- V-004: Intentional disablement starts successfully with local logs; invalid required observability configuration fails startup.
- V-005: Post-initialization collector loss is best-effort and does not terminate or unready the application.
- V-008: The exercised host's readiness/request-gating behavior is recorded accurately, and production build remains resource-independent.
- V-009: No prohibited sensitive value appears in inspected local or exported diagnostic samples.

### Evidence to retain

- Exact Git revision; date/time window; OS, Node, pnpm, Next.js host mode, and relevant service versions.
- Safe configuration summary listing enabled/disabled capabilities and synthetic fixture names without values that are secret or tenant-sensitive.
- Commands/actions, process exit statuses, readiness timing/order observations, request statuses, and cleanup result for each of the seven cases.
- Safe standard-error excerpts or summaries identifying the stage without retaining configuration payloads.
- Grafana datasource identifiers, trace IDs, log query window/labels, and metric query names/results sufficient for independent review; do not retain authorization headers or full sensitive payloads.
- A limitation statement for listener control, batching delay, exporter behavior, and any deployment form not exercised.

## Operational observability verification

All observability evaluation is manual and uses the real application process and configured telemetry infrastructure.
The observer will use the existing Grafana/OTLP procedure in `docs/observability.md`, extended by the implementation
plan for logs and metrics. Actual exported Effect logs, traces, and metrics must be found in their configured
destinations for the successful startup/request window. Bootstrap and exporter-failure diagnostics must be inspected
from actual standard error. Disabled telemetry, invalid initialization, application acquisition failure, and later
collector unavailability must be exercised as distinct cases.

No permanent telemetry test, in-memory exporter assertion, output snapshot, log-text assertion, span/attribute
assertion, metric assertion, or exporter mock is permitted. Temporary probes must be removed before completion.

## Environment and data controls

- Use repository-owned synthetic tenant fixtures and scenario-owned Redis prefixes; never clear shared Redis globally.
- Do not use or retain PHI, production tenant identifiers, real credentials, tokens, cookies, authorization headers, or collector secrets.
- Controlled failures must target owned local services or isolated test endpoints; do not disrupt shared environments.
- Mask or omit endpoint userinfo, header values, configuration contents, and provider data from retained evidence.
- Stop only services started by this procedure and remove owned keys, temporary configuration, logs, probes, and captures.

## Evidence retention and reporting

Implementation execution results belong in the implementation pull request or the plan's designated execution record,
not in this planned specification. The record must identify revision, environment, safe inputs/actions, observation,
pass/fail result, cleanup, and limitations for every case. Summaries may link to access-controlled operational evidence
when raw output cannot be retained safely. Planned commands or static checks must never be reported as executed runtime
or telemetry evidence.

## Limitations and incomplete claims

- Local `otel-lgtm` evidence does not establish behavior for every hosted collector, network, deployment platform, or authorization scheme.
- The application can document but cannot exceed the listener/readiness control provided by its Next.js deployment environment.
- This feature does not establish browser telemetry, backend telemetry, vendor selection, alerting, service-level objectives, or production sampling policy.
- Passing preserved behavior suites does not newly establish Microsoft-provider compatibility or complete session features owned by other delivery work.
- Build success does not establish runtime readiness; simulated composition does not establish real Redis or collector behavior.

## Readiness review

- [x] Every feature claim maps to an authoritative source or the explicit maintainer exception.
- [x] Successful, failure, rejection, security/privacy, accessibility, and operational outcomes are covered where applicable.
- [x] The manual feature procedure is non-empty, executable by an agent, and adds a distinct observation.
- [x] Environmental prerequisites, evidence retention, cleanup, and limitations are explicit.
- [x] Planned evidence is not described as executed or verified.
- [x] No implementation architecture is required to understand the feature claims.
