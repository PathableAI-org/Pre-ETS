# Feature Verification Plan: [FEATURE NAME]

**Feature specification**: [spec.md](spec.md)

**Delivery issue**: [GitHub issue URL]

**Status**: Planned — no execution evidence is recorded by this document

## Authority and scope

[Identify the accepted requirements, delivery-plan slice, issue revision, applicable constraints, and explicit
verification limits. This plan may refine evidence for the slice but may not create new product obligations.]

## Claims and traceability

| ID    | Claim to establish                         | Authoritative source                         | Meaningful violation        | Required observation                  |
| ----- | ------------------------------------------ | -------------------------------------------- | --------------------------- | ------------------------------------- |
| V-001 | [Implementation-independent feature claim] | [Requirement ID and criterion / issue scope] | [Observable counterexample] | [Outcome an observer can distinguish] |

## Automated behavioral evidence

| Claim IDs | Evidence boundary                           | Planned scenario or property | Why this boundary is meaningful  | Known limits                 |
| --------- | ------------------------------------------- | ---------------------------- | -------------------------------- | ---------------------------- |
| [V-001]   | [HTTP, browser, BDD, integration, or other] | [Planned observation]        | [Distinct uncertainty addressed] | [What it does not establish] |

Requirements-backed BDD scenarios must use requirement versions from current `origin/main`, carry requirement-ID
tags, and use feature-level `@partial` when the feature supplies only intermediate evidence. A dry run establishes
discovery only, not runtime behavior.

## Agent-executable manual feature verification _(mandatory)_

### Purpose

[State the distinct feature claim or composed experience that requires direct inspection. Do not mechanically
repeat the automated scenarios.]

### Prerequisites

- [Running services, synthetic fixtures, permissions, MCP/tool availability, and safe environment]

### Procedure

1. [Concrete agent-executable action using Playwright, Grafana, HTTP inspection, or another appropriate tool]
2. [Observation action]
3. [Cleanup action]

### Expected observations

- [Observable outcome tied to claim IDs]

### Evidence to retain

- [Revision, environment, inputs/actions, safe observation, result, and limitation]

## Operational observability verification

[For applicable requirement obligations, describe manual inspection or a temporary probe against real logs,
traces, metrics, or operational behavior. State "No operational observability claim in this slice" only when the
authoritative sources establish none. Do not plan durable tests of telemetry output or exporter wiring.]

## Environment and data controls

- [Synthetic data and isolation]
- [Secret/PHI handling]
- [External services and controlled failure prerequisites]
- [Owned cleanup]

## Evidence retention and reporting

[Describe where execution results will record revision, conditions, observations, pass/fail result, cleanup, and
limitations. Planned procedures are not executed evidence.]

## Limitations and incomplete claims

- [Claim or condition deliberately not established by this feature and its owner/dependency]

## Readiness review

- [ ] Every feature claim maps to an authoritative source.
- [ ] Successful, failure, rejection, security/privacy, accessibility, and operational outcomes are covered where applicable.
- [ ] The manual feature procedure is non-empty, executable by an agent, and adds a distinct observation.
- [ ] Environmental prerequisites, evidence retention, cleanup, and limitations are explicit.
- [ ] Planned evidence is not described as executed or verified.
- [ ] No implementation architecture is required to understand the feature claims.
