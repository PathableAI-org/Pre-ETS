## Decisions for the reviewer

<!-- Required first section. Name the pull requests approved with this one, if any, then 3–5 bullets, each labeled
Tradeoff, Contract change, Accepted limitation, Beyond plan, Evidence substitution, or Outstanding manual check.
Every limitation, not established or blocked result, workaround, and pending manual check below must appear here.
With nothing to decide, write: None: conforms to the approved specification and plan, with no limitations.
Policy: docs/engineering/git-workflow.md, "Decisions for the reviewer". -->

-

## Review objective

Specification review for one delivery issue. Approval means the feature's expectations and verification obligations
are defined. This pull request does not decide module boundaries or public types.

For a Standard feature this pull request is the combined stack: it also carries `plan.md`, `contracts/modules.md`,
and `quickstart.md`, and approval also means the architecture and implementation slices fit the specification.

## Authority

- Risk tier and triggers (from the delivery issue):
- Delivery issue:
- Accepted requirements and criteria:
- Reviewed delivery plan and slice:

This pull request does not change requirements or the delivery plan.

## Scope

- In scope:
- Out of scope and deferred work:

## Decision

Standard tier only, the plan:

- Modules introduced, extended, subdivided, extracted, or promoted, and why:
- Public contracts and error ownership:
- Evidence at each module boundary:
- Implementation slices, with estimated hand-written files and the claims each advances:

Contributes to #<issue>. This pull request does not close the issue.

## Validation

- [ ] Specification checklist is complete
- [ ] `verification.md` maps claims to planned automated, manual, and operational evidence
- [ ] Each claim names the observation that distinguishes it and the evidence channel for that observation
- [ ] Planned evidence is labeled as planned
- [ ] Standard tier: no claim uses a server or browser telemetry channel, and the plan meets the engineering-plan template's checks other than telemetry
- [ ] Local formatting check, or the reason it was not run

## Review notes

Material ambiguities and decisions that still belong to the requirements or delivery workflow:
