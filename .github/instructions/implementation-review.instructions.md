---
applyTo: "packages/**,tests/**,e2e/**,features/**,specs/**/tasks.md,specs/**/quickstart.md"
---

# Implementation review

Review the implementation against the approved specification and engineering plan. Use
[Git and pull request workflow](../../docs/engineering/git-workflow.md), the constitution, and
[Testing as evidence](../../docs/engineering/testing/README.md).

- Check correctness, public-contract compatibility, meaningful tests, security constraints, and stated limitations.
- Flag behavior or signatures that drift from the approved specification or `contracts/modules.md`.
- A planned `quickstart.md` procedure is not defective because it has not yet been executed. On an implementation
  review, identify evidence the pull request claims but does not show.
- Do not treat a Copilot suggestion as approval to change an accepted requirement, delivery slice, or public contract.
