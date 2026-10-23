---
applyTo: "specs/**/spec.md,specs/**/verification.md,specs/**/checklists/**"
---

# Specification review

Review as an external stakeholder. Use the linked delivery issue, the accepted requirements on the current main
branch, the reviewed delivery plan, and [Git and pull request workflow](../../docs/engineering/git-workflow.md).

- Check scope, exclusions, behavior, failure conditions, acceptance criteria, and feature-level observability.
- Check that `verification.md` maps each claim to planned evidence, includes an agent-executable manual procedure,
  and keeps planned evidence distinct from executed results.
- Flag unsupported behavioral assumptions and unauthorized product decisions.
- Do not request module interfaces, public types, internal algorithms, or runtime composition.
- Do not request edits to accepted requirements or approved delivery plans. Name that owning workflow instead.
