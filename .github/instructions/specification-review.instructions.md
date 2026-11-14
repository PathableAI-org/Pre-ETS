---
applyTo: "specs/**/spec.md,specs/**/verification.md,specs/**/checklists/**"
---

# Specification review

Review as an external stakeholder. Use the linked delivery issue, the accepted requirements on the current main
branch, the reviewed delivery plan, and [Git and pull request workflow](../../docs/engineering/git-workflow.md).

- Check scope, exclusions, behavior, failure conditions, acceptance criteria, and feature-level observability.
- Check that `verification.md` maps each claim to planned evidence, includes an agent-executable manual procedure,
  and keeps planned evidence distinct from executed results.
- Check that each claim names the observation a verifier must make and an evidence channel able to make it, as
  described in [the verification harness](../../docs/engineering/verification-harness.md#telemetry-follows-verification).
  The observation is a fact, not a span or attribute name.
- Flag unsupported behavioral assumptions and unauthorized product decisions.
- Do not request module interfaces, public types, internal algorithms, or runtime composition.
- Do not request edits to accepted requirements or approved delivery plans. Name that owning workflow instead.
- Check the pull request body opens with
  [Decisions for the reviewer](../../docs/engineering/git-workflow.md#decisions-for-the-reviewer) and that it is
  honest: every accepted limitation, open question still needing a decision, and deferred scope recorded further down
  the body appears there. Flag `None` when the body records any of them.
- Check the pull request states a [risk tier](../../docs/engineering/git-workflow.md#risk-tiers) and that the delivery
  issue's tier matches the triggers. Flag a lower tier than a trigger produces unless the issue records the
  maintainer's reason, and any lowering below High for a `Regulatory` or `Security` requirement without a constitution
  exception. For a Standard combined stack, also review the plan with the engineering-plan lens, and flag any claim
  that uses a server or browser telemetry channel.
