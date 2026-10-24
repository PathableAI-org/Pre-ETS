# Feature Specification: Deterministic Application Bootstrap and Runtime Composition

**Feature Branch**: `157-runtime-bootstrap`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "Refactor frontend application bootstrap and runtime composition to provide deterministic startup, fail-fast lifecycle guarantees, progressive observability, coherent startup configuration, explicit readiness, and preserved application behavior."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Start Only When Fully Ready (Priority: P1)

As an operator, I need the application to become ready only after required configuration, observability, application services, and external resources have initialized successfully so that requests never encounter a partially initialized application.

**Why this priority**: Serving before required dependencies are usable can produce inconsistent authentication, tenant, and session behavior. A trustworthy readiness boundary is the primary safety outcome of this refactor.

**Independent Test**: Start the application with valid configuration and available required dependencies, then show that readiness and business request processing occur only after all required startup stages complete.

**Acceptance Scenarios**:

1. **Given** valid startup configuration and available required dependencies, **When** the application starts, **Then** it establishes bootstrap diagnostics, validates configuration, initializes configured observability, acquires all required application services and resources, and only then declares readiness.
2. **Given** a required asynchronous resource is still being acquired, **When** the hosting environment evaluates startup completion, **Then** the application has not declared readiness and business operations do not execute against the incomplete application.
3. **Given** the application is being built rather than started for request handling, **When** the production build runs, **Then** it completes without acquiring production runtime resources or requiring live external services.

---

### User Story 2 - Terminate Failed Starts Safely (Priority: P1)

As an operator, I need every required startup failure to be diagnosed and to terminate the process so that an unhealthy instance cannot remain available or appear ready.

**Why this priority**: A process that survives a failed start can receive traffic without the configuration or resources needed to preserve tenant, authentication, and session guarantees.

**Independent Test**: Introduce one controlled failure at each startup stage and observe the stage-specific diagnostic, cleanup attempt, bounded telemetry delivery where applicable, nonzero termination, and absence of readiness.

**Acceptance Scenarios**:

1. **Given** invalid required process-wide configuration, **When** startup validation fails, **Then** the application records a safe diagnostic through the bootstrap logging path, identifies configuration validation as the failing stage, never reports readiness, and terminates with a nonzero status.
2. **Given** explicitly configured required observability cannot initialize, **When** startup reaches observability initialization, **Then** the application records a safe fallback diagnostic, never begins application-service acquisition, never reports readiness, and terminates with a nonzero status.
3. **Given** configured observability is ready but a required application resource such as the distributed store cannot be acquired, **When** startup reaches application acquisition, **Then** the failure is diagnosed through the fully initialized observability capabilities, previously acquired resources are released where possible, buffered telemetry receives a bounded delivery attempt, and the process terminates with a nonzero status.
4. **Given** diagnostic delivery or cleanup fails or does not complete within its bound, **When** fatal startup handling runs, **Then** that secondary failure does not prevent eventual nonzero process termination.

---

### User Story 3 - Observe Bootstrap Progressively (Priority: P2)

As an operator, I need useful diagnostics from the first startup action onward and unified operational signals after observability initializes so that startup and runtime failures can be investigated without making an external collector an unconditional readiness dependency.

**Why this priority**: Configuration and telemetry initialization can fail before the normal application environment exists. Diagnostics must therefore improve progressively while retaining a reliable local fallback.

**Independent Test**: Execute the manual startup matrix with observability enabled, intentionally disabled, invalid, and later disconnected, then inspect actual local logs and configured telemetry destinations.

**Acceptance Scenarios**:

1. **Given** the process has begun startup but configured observability is not yet ready, **When** bootstrap emits a diagnostic, **Then** the diagnostic is written to standard error without depending on tenant, authentication, distributed storage, or other application services.
2. **Given** observability is valid and enabled, **When** it finishes initializing, **Then** subsequent startup and application execution provide structured logs, traces, and metrics through the configured telemetry destinations while retaining local logging according to application policy.
3. **Given** a telemetry capability is intentionally disabled by valid configuration, **When** the application starts, **Then** the disabled capability is not treated as a failure and local diagnostics remain available.
4. **Given** observability initialized successfully and its external collector later becomes unavailable, **When** telemetry delivery fails, **Then** delivery follows the documented best-effort policy and the otherwise healthy application continues serving.

---

### User Story 4 - Preserve Application Contracts While Improving Composition (Priority: P2)

As a maintainer, I need startup configuration and application dependencies to have clear ownership and replaceable test boundaries so that the composition can evolve without changing tenant, authentication, persistence, session, or HTTP behavior.

**Why this priority**: The feature is an architectural and lifecycle refactor. Its value depends on making composition independently testable without changing established application outcomes.

**Independent Test**: Assemble the application with controlled dependencies outside process startup, exercise existing public service and framework-boundary tests, and confirm existing external behavior remains unchanged.

**Acceptance Scenarios**:

1. **Given** validated process-wide startup configuration, **When** dependent services are assembled, **Then** they receive the same validated configuration through one consistent application dependency boundary and do not independently reinterpret process environment settings.
2. **Given** a test supplies controlled infrastructure dependencies, **When** application composition is acquired without starting the process or a web server, **Then** service behavior can be exercised through existing public contracts.
3. **Given** the refactored application is exercised through existing tenant, authentication, persistence, session, and HTTP scenarios, **When** results are compared with the accepted contracts, **Then** statuses, redirects, errors, storage behavior, and tenant isolation remain unchanged.
4. **Given** production startup, **When** the application composition is acquired, **Then** it does not use a construction path designated specifically as a test harness.

### Edge Cases

- Startup configuration is syntactically readable but violates a cross-field constraint.
- Observability is validly disabled while other observability-related settings remain present.
- An observability endpoint is syntactically invalid before initialization versus reachable at initialization but unavailable during later export.
- One observability capability is intentionally disabled while other configured capabilities remain required.
- A required resource connects and then fails while later services are still being acquired.
- Resource cleanup, telemetry flushing, or diagnostic reporting itself fails during fatal startup handling.
- The hosting environment cannot fully block its network listener even though application readiness is incomplete.
- A request reaches application integration during startup despite deployment-specific listener limitations.
- The production build imports application modules in an environment where runtime configuration and external resources are unavailable.
- Request-selected tenant configuration is malformed even though process-wide startup configuration was valid.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The application MUST execute startup as an explicit ordered lifecycle: establish bootstrap diagnostics, load and validate process-wide configuration, initialize configured observability, acquire required application services and resources, and declare readiness.
- **FR-002**: Application-service acquisition MUST NOT begin until configured observability initialization has completed successfully or valid configuration has intentionally disabled the applicable telemetry capability.
- **FR-003**: The application MUST await acquisition of every required asynchronous startup resource before declaring readiness.
- **FR-004**: The application MUST NOT declare readiness or permit business operations to run against an incompletely initialized application.
- **FR-005**: Where the hosting environment can block request handling until startup completes, the application MUST use that supported capability. Where it cannot fully control listener acceptance, integration MUST still prevent business operations from using a partial application and the limitation MUST be documented.
- **FR-006**: Before loading configuration or initializing external infrastructure, the application MUST provide a bootstrap diagnostic path that writes to standard error.
- **FR-007**: Once enabled observability is initialized, application execution MUST provide structured logging, tracing, and metrics through the configured telemetry infrastructure, while continuing local standard-error or console logging according to application policy.
- **FR-008**: Observability initialization MUST remain independent of tenant resolution, authentication, distributed storage, session behavior, and other application capabilities.
- **FR-009**: Valid configuration that intentionally disables a telemetry capability MUST NOT cause startup failure.
- **FR-010**: Invalid explicitly configured observability settings or failure to initialize telemetry designated as required MUST be fatal startup failures.
- **FR-011**: External exporter connectivity failures that occur after successful observability initialization MUST follow the documented best-effort delivery policy and MUST NOT by themselves terminate an otherwise healthy application, unless configuration explicitly makes collector availability a readiness requirement.
- **FR-012**: All process-wide startup configuration MUST be loaded and validated before dependent application services initialize.
- **FR-013**: Dependent application services MUST receive a coherent validated startup-configuration value through one consistent application dependency boundary rather than independently parsing the same process environment settings.
- **FR-014**: Startup configuration MUST remain distinct from request-selected tenant configuration and request-specific data. This refactor MUST NOT change when or how per-request tenant configuration is selected and loaded.
- **FR-015**: Any failure to complete required startup initialization, including required configuration, observability, application-service, or external-resource initialization, MUST be fatal at the application bootstrap boundary.
- **FR-016**: Every fatal startup failure MUST record a meaningful diagnostic using the best diagnostic capability available at the failing stage and MUST identify that stage.
- **FR-017**: Startup diagnostics MUST preserve useful typed or categorized failure information where available without exposing credentials, secret references resolved to values, collector authorization material, tokens, tenant configuration contents, or other sensitive configuration.
- **FR-018**: Fatal startup handling MUST release resources acquired by completed earlier stages where possible and MUST attempt bounded delivery of buffered telemetry when applicable.
- **FR-019**: Diagnostic, cleanup, or telemetry-delivery failure MUST NOT prevent eventual process termination with a nonzero status.
- **FR-020**: Individual application services MUST report acquisition failures to their caller and MUST NOT independently terminate the process.
- **FR-021**: Request handling MUST use one shared, fully initialized process-lifetime application environment until shutdown, with explicit ownership and disposal of acquired resources.
- **FR-022**: The complete set of application capabilities MUST be independently acquirable with substitute configuration and infrastructure dependencies without starting the process or a web server.
- **FR-023**: Production startup MUST use a production-designated construction path and MUST NOT depend on a construction path designated specifically for tests.
- **FR-024**: Required startup ordering MUST be enforced by the bootstrap lifecycle and MUST NOT depend on unspecified ordering among otherwise independent application capabilities.
- **FR-025**: Production builds MUST remain possible without validating runtime-only deployment configuration, acquiring application resources, connecting to external services, or declaring application readiness.
- **FR-026**: Existing externally observable tenant resolution, tenant configuration loading, authentication initiation and callback handling, authentication transaction persistence, distributed-store behavior, session behavior, typed errors, HTTP mappings, supported configuration semantics, and dependency-substitution capabilities MUST remain unchanged.
- **FR-027**: Automated tests MAY verify deterministic non-telemetry behavior such as configuration validation, dependency substitution, composition acquisition, and preserved service outcomes, but MUST NOT assert logs, spans, metrics, telemetry records, exporter calls, telemetry snapshots, or telemetry-pipeline internals.
- **FR-028**: Observability and composed startup evidence MUST be gathered manually from real process startup, standard error, actual application requests, and configured telemetry destinations; no dedicated automated observability suite may be introduced.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In the planned startup matrix, 100% of successful starts declare readiness only after configuration, configured observability, application services, and required external resources are ready.
- **SC-002**: In the planned startup matrix, 100% of required failures at configuration, observability, and application-acquisition stages produce a stage-identifying safe diagnostic, never declare readiness, and terminate with a nonzero status.
- **SC-003**: The application passes all seven manual observability and startup cases defined in the verification plan using actual standard-error output and configured telemetry destinations.
- **SC-004**: With telemetry intentionally disabled, the application starts successfully in 100% of valid test runs and retains local diagnostic output.
- **SC-005**: With a collector becoming unavailable after successful initialization, the application continues serving valid requests in 100% of planned trials while recording best-effort delivery failure locally.
- **SC-006**: A production build completes successfully with required runtime services unavailable and without acquiring application runtime resources.
- **SC-007**: Existing automated tenant, authentication, persistence, session, configuration, and framework-boundary behavioral checks pass without weakening their assertions or changing accepted outcomes.
- **SC-008**: Application composition can be acquired in a test process with substituted startup configuration and infrastructure dependencies, without starting a web server or invoking process termination.
- **SC-009**: Manual review of startup failure diagnostics finds zero exposed credentials, resolved secrets, authorization headers, tokens, or tenant configuration contents across the planned failure cases.

## Assumptions

- The direct maintainer instruction on 2026-10-24 authorizes this one-time cross-cutting refactor without a delivery issue; accepted requirements on `origin/main` remain authoritative for all preserved product behavior.
- A telemetry capability is optional only when valid startup configuration explicitly disables it or does not configure it under the supported semantics. Explicitly invalid configuration is not equivalent to disabling the capability.
- Collector availability is best-effort after successful telemetry initialization unless a future approved configuration contract explicitly makes availability required for readiness.
- A bounded cleanup or telemetry-delivery attempt means a finite documented limit selected during planning; fatal termination cannot wait indefinitely for cleanup or export.
- Tenant files remain request-selected configuration. Only process-wide configuration is loaded as one coherent startup dependency.
- Deployment environments differ in how much control the application has over listener acceptance. Verification will record the actual guarantee and limitation of each exercised environment.
- Existing application contracts and supported environment-setting semantics are preserved unless an accepted requirement is separately changed through its owning workflow.

## Delivery Authority and Scope _(mandatory)_

**Delivery issue**: None — explicit maintainer exception authorized in this conversation on 2026-10-24 for a general refactor of existing requirements.

**Originating delivery slice**: None — cross-cutting lifecycle refactor based on current `origin/main` revision `d75c6eac498d6c6c59821e71cef6a74bf5e81ecd` and the direct maintainer instruction.

### Accepted requirement coverage

| Requirement                                                                    | Acceptance criteria in this slice                  | Feature disposition                                                                                                                                                                            |
| ------------------------------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [PREETS-TENANT-004](../../docs/requirements/tenant/PREETS-TENANT-004.md)       | AC2; preservation of AC1–5                         | Preserve startup rejection for invalid required process configuration and preserve every request-time directory/file outcome without fallback.                                                 |
| [PREETS-SECURITY-001](../../docs/requirements/security/PREETS-SECURITY-001.md) | AC1–3                                              | Preserve separation and non-disclosure of credentials and resolved secrets, including in bootstrap diagnostics and telemetry.                                                                  |
| [PREETS-SESSION-002](../../docs/requirements/session/PREETS-SESSION-002.md)    | AC1–3                                              | Preserve tenant-configured, provider-neutral OIDC initiation and completion behavior.                                                                                                          |
| [PREETS-SESSION-003](../../docs/requirements/session/PREETS-SESSION-003.md)    | AC1–3                                              | Preserve authenticated-session identity and rejection behavior as existing implementation evolves.                                                                                             |
| [PREETS-SESSION-006](../../docs/requirements/session/PREETS-SESSION-006.md)    | AC1–3                                              | Preserve the distributed-storage and cross-instance session contract; this refactor changes startup ownership, not storage semantics.                                                          |
| Direct maintainer instruction, 2026-10-24                                      | Desired Behavior 1–8 and Verification Requirements | Authorizes deterministic bootstrap, fail-fast startup, progressive logging/tracing/metrics, coherent startup configuration, explicit composition/readiness, and manual observability evidence. |

### Authorized outcome

The frontend starts through a deterministic, diagnosable, fail-fast lifecycle; becomes ready only with a complete shared application runtime; exposes progressively stronger observability without making ordinary exporter delivery an unconditional health dependency; and preserves existing application behavior.

### In scope

- Ordered application startup and explicit readiness guarantees.
- Fatal startup policy, safe stage-specific diagnostics, resource cleanup, bounded telemetry delivery, and nonzero termination.
- Unified logging, tracing, and metrics after observability initialization, with reliable standard-error bootstrap diagnostics.
- Coherent validation and supply of process-wide startup configuration.
- Independently testable application composition and production-safe construction boundaries.
- Hosting-framework startup/build integration and documented deployment-specific readiness limitations.
- Adaptation of existing deterministic behavioral tests and a manual real-telemetry verification procedure.

### Out of scope

- Changes to tenant hostname resolution, tenant-file selection, tenant schema, or request-time tenant loading behavior.
- Changes to authentication protocol behavior, callback validation, transaction semantics, session policy, persistence representation, or HTTP mappings.
- A second long-lived bootstrap runtime, mutable global service locator, or ad hoc readiness flags.
- A requirement that every deployment keep an external telemetry collector reachable after successful startup.
- Browser telemetry, backend-process observability, vendor selection, production sampling policy, alerting, or service-level objectives unless separately authorized.
- Automated assertions over telemetry output, exporter behavior, or observability internals.

### Dependencies and blockers

- Planning must verify the selected lifecycle, configuration, observability, and resource-management mechanisms against the repository's installed platform versions.
- Manual verification requires safe synthetic configuration, the existing distributed store and local observability stack, and an environment where controlled dependency failures can be introduced.

### Authority findings

The normal one-delivery-issue intake requirement was explicitly waived by the maintainer for this general refactor. No unresolved product-behavior conflict remains: accepted requirements govern preserved behavior, and the direct 2026-10-24 instruction governs the new operational lifecycle and observability obligations.
