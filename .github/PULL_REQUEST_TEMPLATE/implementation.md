## Decisions for the reviewer

<!-- Required first section. Name the pull requests approved with this one, if any, then 3–5 bullets, each labeled
Tradeoff, Contract change, Accepted limitation, Beyond plan, Evidence substitution, or Outstanding manual check.
Every limitation, not established or blocked result, workaround, and pending manual check below must appear here.
With nothing to decide, write: None: conforms to the approved specification and plan, with no limitations.
Policy: docs/engineering/git-workflow.md, "Decisions for the reviewer". -->

-

## Review objective

Implementation review. Approval means this increment matches the approved specification and engineering plan,
including its public contracts and evidence. Unapproved contract or acceptance changes belong in an earlier phase.

## Authority

- Risk tier and triggers (from the delivery issue):
- Specification pull request:
- Engineering-plan pull request:
- Delivery issue:
- Implementation slice from `plan.md` (ID and position in the stack):

## Decision

- Behavior implemented:
- Contracts preserved or intentionally deferred:
- Evidence produced, with conditions and limitations:
- Hand-written files changed, and the reason if well over 15:

## Verification report

Summarize the latest verification report for this slice. Do not paste raw query output. Name the verified SHA; commits
after it may only record `quickstart.md` execution results. Name the approved limitation in `verification.md` or
`plan.md` for each `not established` or `blocked` result.

| Claim ID | Result | Revision | Evidence (trace IDs or query) | Limits |
| -------- | ------ | -------- | ----------------------------- | ------ |
|          |        |          |                               |        |

Forbidden telemetry data observed (High tier): none / describe

Use `Closes #<issue>` only when this pull request satisfies the issue's completion evidence. Otherwise use
`Contributes to #<issue>`.

## Validation

- [ ] Affected typecheck, lint, unit, property, and BDD commands, with results
- [ ] Manual or operational evidence, including what was not run
- [ ] Temporary probes and generated output are absent
- [ ] `tasks.md` and `quickstart.md` agree with the evidence actually collected
- [ ] High tier: instrumentation matches `contracts/telemetry.md`. Any tier: no durable test asserts telemetry

## Review notes

Discoveries that require a specification or plan correction:
