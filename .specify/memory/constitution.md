<!--
Sync Impact Report
Version change: uninitialized scaffold -> 1.0.0 (initial adoption)
Modified principles: template placeholders replaced with project principles:
- I. Evidence-Grounded Specification
- II. Explicit Ownership and Authoritative Data
- III. Tenant Isolation
- IV. Accessible, Server-Rendered UI
- V. Meaningful Behavioral Tests
- VI. Simplicity and Verifiable Quality
Added sections: Architecture Constraints; Development Workflow and Review; Governance
Removed sections: none (generic template examples removed)
Template synchronization: no template or command changes; consumers read this file at runtime.
Follow-up TODOs: none.
-->

# Pre-ETS Constitution

## Core Principles

### I. Evidence-Grounded Specification

Features MUST start from an identified user workflow, explicit scope, and observable acceptance
criteria. Specifications MUST distinguish source evidence, inference, approved decisions, and open
questions. Client forms and prototype behavior MUST NOT become business rules without validation.
Domain terms and closed sets of values MUST have a clear definition and remain consistent across
specification, plan, tasks, and implementation.

Material uncertainty affecting behavior, data ownership, or access MUST be resolved before dependent
implementation. Scope corrections MUST replace superseded requirements in the active artifacts.
This keeps implementation grounded in the client's operations as understanding develops.

### II. Explicit Ownership and Authoritative Data

The frontend and backend MUST remain separate processes with implementation in its owning workspace.
The frontend owns presentation, tenant configuration, authentication orchestration, and temporary
session/UI state. The backend owns business rules, domain authorization, and durable domain records.

Session state MUST NOT become the business source of truth. When an object needs durable identity,
a business lifecycle, or access beyond its originating session, the frontend MUST persist it through
the backend API. After a successful write, the backend record is authoritative. Frontend caches and
session drafts MUST NOT substitute for domain persistence.

Each store MUST have one explicit owner. Frontend and backend MUST NOT share writable domain tables
or bypass their API boundary. Shared contracts MUST be introduced only for concrete cross-process
requirements; domain concepts MUST remain independent of UI and HTTP transport details.

### III. Tenant Isolation

Each request MUST bind to exactly one tenant through a single trusted host-binding boundary.
Unknown or invalid tenants MUST fail closed without substituting another tenant's configuration or
identity provider. Downstream frontend modules MUST receive the resolved tenant context rather than
reinterpret the URL.

Authentication callbacks and sessions MUST remain bound to the originating tenant. Tenant mismatch
MUST reject authentication or invalidate the session as appropriate. Session cookies MUST be
host-only. The backend MUST verify authentication and enforce tenant-scoped domain authorization
independently; frontend validation or possession of a record identifier MUST NOT confer access.

Features affecting these boundaries MUST specify and verify rejection paths as well as successful
access. Credentials, tokens, and real client records MUST NOT be committed as fixtures or examples.

### IV. Accessible, Server-Rendered UI

Accessibility, simplicity, and user ergonomics MUST be acceptance criteria for UI work. Interfaces
MUST provide semantic structure, meaningful accessible names, keyboard operation, visible focus,
appropriate focus movement, and understandable labels, instructions, and errors. Workflows MUST
make the next action and its outcome clear and avoid unnecessary steps or repeated input.

UI MUST use the team's `@pathableai/react` component library. Before creating or changing UI,
contributors MUST read the installed package's `agent-guidance/pathable-react/SKILL.md` and relevant
linked guidance. Component defects and missing component capabilities MUST be reported in the
library's issue tracker, or linked to an existing matching issue, with a reproducible example or
concrete use case and expected behavior. Local replacements or workarounds MUST NOT silently hide
library gaps; any temporary workaround MUST document its issue, reason, and removal condition.

Pages MUST default to server rendering. Client components and browser state MUST be limited to
interactions that require them, with the reason recorded in the plan. Introducing an interactive
control MUST NOT move unrelated page composition or data loading into the client. Semantic controls
and straightforward composition MUST take precedence over custom interaction machinery.

Using the library does not establish accessibility by itself. Feature verification MUST exercise the
actual composed experience, including relevant keyboard and focus behavior.

### V. Meaningful Behavioral Tests

Tests MUST protect a named requirement, business rule, failure mode, or user capability. E2E scenarios
MUST trace from domain workflow to experience specification to observable behavior in the running
product. Titles, actions, and outcomes MUST use language recognizable to product, design, and
engineering reviewers.

Playwright tests MUST exercise user intent and assert a meaningful outcome. Static text inventories,
element-existence checks, and assertions that merely mirror implementation MUST NOT serve as
workflow coverage. Text assertions are valid when the text is itself a required outcome, such as a
validation error or a saved record visible after submission. An action normally proves the control
can be used; a preceding visibility assertion MUST have a separate behavioral purpose.

Locators MUST use user-facing semantics: labels for labeled capabilities, roles and accessible names
when the role matters, and text when the copy is part of the experience contract. Test IDs are
permitted only when no meaningful user-facing semantic identity exists, with the reason documented.
Tests MUST NOT bypass missing labels or roles by adding test IDs. CSS classes, DOM ancestry, sibling
relationships, framework internals, and incidental element types MUST NOT define E2E contracts.

E2E assertions MUST target outcomes users can perceive or use. Internal API, persistence, and
component contracts MUST be tested at the appropriate lower layer when they need independent
verification. A test MUST survive an HTML refactor that preserves its specified experience.
Abstractions MUST preserve visible actions and domain language instead of obscuring the workflow.

Verification MUST cover relevant failure, permission, validation, and persistence behavior as well
as the successful path. Persistence requirements MUST be demonstrated across the applicable reload
or session boundary; a success message alone is insufficient. Test scope MUST follow the change's
behavior and risk, without adding redundant tests to inflate counts. Fixtures MUST be synthetic and
isolated so tests do not depend on execution order or another test's state.

The project's reference is
[Playwright E2E Testing Best Practices](https://app.notion.com/p/3bb7cbd04b6d81729a42e209d82aad1a).
These rules incorporate its semantic workflow approach. Gherkin and test-first sequencing are not
blanket requirements; a feature plan MUST identify the scenarios, test layers, and validation order
needed to prove its acceptance criteria.

### VI. Simplicity and Verifiable Quality

Changes MUST stay within the specified scope. New dependencies, abstractions, shared packages, or
infrastructure MUST answer a current requirement and have an explicit owner. Direct package scripts
and existing conventions MUST be preferred over custom wrappers or parallel tooling.

Strict TypeScript settings MUST apply to all code, including non-Effect code. Contributors MUST run
the applicable behavior checks and repository quality gates, investigate failures, and report any
unverified behavior accurately. Blanket suppressions, weakened checks, and tests without meaningful
failure signals MUST NOT be used to obtain a passing result.

## Architecture Constraints

- Use one repository-root Spec Kit workflow and constitution for the coordinated product.
- Use pnpm from the root, one root lockfile, and private ESM workspaces under `packages/` in the
  `@pathableai` scope. Runtime and dependency versions belong in their existing configuration files.
- The frontend is an SSR-first Next.js App Router application. The planned backend is a stateless
  RESTful Effect v4 service; this decision does not imply that backend workflows already exist.
- The frontend owns OIDC login through the broker and first-party server-side sessions. The broker
  handles tenant identity-provider protocols. The backend verifies broker tokens independently.
- Redis holds frontend session state. Postgres holds separately owned frontend tenant configuration
  and backend domain data. The backend MUST NOT read Redis sessions or persist frontend form drafts.
- Local Compose provides external services; frontend and backend development processes run on the
  host. Machine-local credentials and deployment settings MUST remain outside committed secrets.

Detailed strategies live in [multi-tenancy](../../docs/multi-tenancy.md),
[authentication](../../docs/authentication.md), [session state](../../docs/session-state.md),
[domain persistence](../../docs/domain-persistence.md), and
[local services](../../docs/docker-compose.md). Feature plans MUST consult applicable strategies and
resolve conflicts explicitly before implementation. These documents describe intended architecture;
implementation and verification status MUST be established from repository evidence.

## Development Workflow and Review

1. Specify the user workflow, evidence, scope, and acceptance criteria. Resolve material questions
   before planning dependent behavior.
2. Plan workspace and data ownership, tenant/authentication boundaries, rendering boundaries,
   accessibility behavior, and meaningful verification. Record a Constitution Check for each
   applicable principle and explain any non-applicable principle.
3. Derive implementation tasks with traceability to acceptance criteria. Keep Spec Kit templates and
   commands unchanged by constitution updates; they consume this file at runtime.
4. Implement focused changes and validate their behavior. For UI, review the installed PathAble
   guidance and report library gaps upstream as required by Principle IV.
5. Before committing, run `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm format:check`, and
   `pnpm check:unused`, plus feature-specific checks. Apply lint fixes before formatting when fixes
   are needed, then verify both pass. Preserve the root pre-commit hook's staged-file protections and
   single `pnpm check:changes` audit. Do not commit generated output.
6. Review for acceptance-criteria coverage, meaningful assertions, accessibility, ownership, tenant
   isolation, and unnecessary complexity. Report what was actually tested and any limitations.
   Passing static checks MUST NOT be described as proof of runtime workflows.

Root policy and workspace-local configuration MUST retain the ownership described in
[AGENTS.md](../../AGENTS.md). [README.md](../../README.md) is the operational command reference.

## Governance

This constitution governs project specifications, plans, implementation, and review. Operational
instructions and detailed architecture documents MUST remain consistent with it. When a conflict
arises, contributors MUST identify the conflict and resolve the affected decision explicitly rather
than silently reinterpret a principle.

Amendments MUST state the reason, changed rules, affected artifacts, and any migration or follow-up
work, and require project-maintainer approval through review. Feature-specific exceptions MUST name
the affected rule, justification, scope, and removal condition and receive maintainer approval before
dependent implementation. A permanent change to a principle requires an amendment.

Constitution versions use semantic versioning: MAJOR for incompatible principle removals or
redefinitions, MINOR for new principles or materially expanded guidance, and PATCH for wording or
clarifications that preserve obligations. Amendments MUST update the Sync Impact Report and last
amended date while preserving the original ratification date.

Plans and pull requests MUST be reviewed against the applicable principles. Any required follow-up
synchronization MUST be recorded; this constitution workflow modifies only this file.

**Version**: 1.0.0 | **Ratified**: 2026-09-13 | **Last Amended**: 2026-09-13
