# Pre-ETS clarification authority

Apply these rules throughout the wrapped clarification workflow.

Before asking questions, read the active `verification.md` as well as `spec.md`, then
recheck the delivery issue, its reviewed delivery-plan slice, and accepted requirement
sources from current `origin/main`. Clarification may refine the feature contract only
within that authorized scope.

- Ask product-behavior, scope, security/privacy, acceptance, observability, or evidence
  questions only when the authoritative sources do not already answer them.
- Do not ask stakeholders to choose implementation architecture, module structure,
  dependency injection, libraries, or internal algorithms during specification.
- Do not silently resolve a contradiction with accepted requirements or an approved
  delivery slice. Use the five-part blocking-finding format from the project
  constitution and stop the affected work.
- Treat answers that would change an accepted requirement or delivery scope as
  proposals. Record the owning workflow that must approve the change; do not encode the
  proposal as an accepted feature promise.
- When an accepted clarification changes an observable claim, update both `spec.md` and
  `verification.md` atomically so their claim, source, expected observation, and
  limitations remain aligned.
- Never edit requirements, delivery plans, or GitHub issues from this command.

The readiness result covers both feature artifacts. Recommend `$speckit-plan` only when
the behavioral contract and feature verification obligations are sufficiently clear.

{CORE_TEMPLATE}

## Pre-ETS completion rule

Report whether `spec.md` and `verification.md` remain aligned, identify any authority
blocker separately from ordinary clarification coverage, and never describe a proposed
source change as already approved.
