# Specification Quality Checklist: Browser Tracing for the Verification Harness

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-11
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Pre-ETS Authority and Verification Readiness

- [x] The specification identifies exactly one authorized delivery issue
- [x] Accepted requirement coverage is traced to current `origin/main` (none applies; recorded in Authority finding 1)
- [x] The reviewed delivery slice and approved revision are identified (none; the issue is the sole authority)
- [x] Every cited acceptance criterion has an explicit feature disposition (no requirement criteria cited)
- [x] `verification.md` maps each claim to authority and a meaningful violation
- [x] Manual feature verification is non-empty, agent-executable, and distinct from automated evidence
- [x] Planned and executed evidence are clearly distinguished
- [x] Environment prerequisites, retained evidence, cleanup, limitations, and incomplete claims are explicit
- [x] No specification-blocking authority finding or architectural decision remains in the stakeholder contract

## Notes

- Validation iteration 1: all items passed; no `[NEEDS CLARIFICATION]` markers were introduced.
- The audience is the verification agent, the developer, and the reviewer, because this is harness tooling with no
  end-user-visible behavior. W3C trace context, CORS, the collector, and Tempo are named because the issue requires
  them; they are observable obligations, not design choices.
- No record name, attribute name, closed-set value, module, public type, or library selection appears in `spec.md`
  or `verification.md`. Those belong to the plan's `contracts/telemetry.md` and `contracts/modules.md`.
- The settled decisions in #368 (separate switch effective only with server telemetry, direct header-free export with
  CORS, same-origin propagation, rendered trace context for document loads, closed-set harness facts, local-only) are
  encoded as accepted expectations, not re-decided.
- Two defaults recorded in Assumptions were confirmed by the maintainer on 2026-11-11: URL fragments are excluded with
  query strings, and trace context is sent only on same-origin requests.
- Authority finding 1 (no delivery slice or requirement) is resolved by the maintainer's direction. Finding 2 (whether
  production must refuse the switch) was resolved by the maintainer on 2026-11-11 with proposal A: the switch defaults
  to off, production never sets it, and browser tracing is documented as assumed never active in production.
- V-008 and V-012 are hand-run browser checks by the verification agent, not durable browser tests. The only durable
  browser suite is requirements BDD, which needs requirement-ID tags that #368 does not have (maintainer decision,
  2026-11-11). The module test for V-007 remains the only automated evidence.
- Correction, 2026-11-11 (maintainer-approved): `verification.md` permits a prepared-session fixture for claims that
  assert nothing about login, callback, or session issuance (V-001–V-006, V-008–V-017), with approved limitation
  L-fixture. Feature 163's precedent against prepared sessions concerned session behavior itself.
- Correction, 2026-11-12 (maintainer-approved): procedure step 7 triggers V-013's concealment with a current-session
  hint naming another session plus a visibility change, instead of freezing tab B and advancing its clock. The clock
  approach future-dates browser records and Playwright Chromium delivers no freeze or resume events. V-013's required
  observation is unchanged.
- `verification.md` records planned evidence only. No browser, collector, or trace-store procedure was executed during
  specification.
