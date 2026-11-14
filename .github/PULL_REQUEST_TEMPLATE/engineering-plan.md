## Decisions for the reviewer

<!-- Required first section. Name the pull requests approved with this one, if any, then 3–5 bullets, each labeled
Tradeoff, Contract change, Accepted limitation, Beyond plan, Evidence substitution, or Outstanding manual check.
Every limitation, not established or blocked result, workaround, and pending manual check below must appear here.
With nothing to decide, write: None: conforms to the approved specification and plan, with no limitations.
Policy: docs/engineering/git-workflow.md, "Decisions for the reviewer". -->

-

## Review objective

Engineering-plan review. Approval means the proposed module boundaries, public contracts, verification telemetry,
and implementation slices are an appropriate way to satisfy the approved specification. This pull request does not redefine acceptance criteria.

## Authority

- Risk tier and triggers (from the delivery issue):
- Specification pull request:
- Delivery issue:
- Approved `spec.md` and `verification.md`:

## Decision

- Modules introduced, extended, subdivided, extracted, or promoted, and why:
- Public contracts and error ownership:
- Evidence at each module boundary:
- Telemetry added for verification, and facts deliberately not emitted:
- Implementation slices, with estimated hand-written files and the claims each advances:

Contributes to #<issue>. This pull request does not close the issue.

## Validation

- [ ] `contracts/modules.md` covers every affected public module
- [ ] Proposed external APIs were checked against installed declarations
- [ ] `contracts/telemetry.md` covers every telemetry-channel observation and emits no forbidden data class
- [ ] Each implementation slice is one decision, vertical, and about 15 hand-written files at most or says why
- [ ] `quickstart.md` records the planned execution mapping, not executed results
- [ ] Local formatting check, or the reason it was not run

## Review notes

Technical choices left open, and any discovery that belongs back in the specification:
