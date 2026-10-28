---
applyTo: ".agents/skills/speckit-stack/**,docs/engineering/git-workflow.md,.github/PULL_REQUEST_TEMPLATE/**,.github/instructions/*review.instructions.md"
---

# Stack workflow review

`docs/engineering/git-workflow.md` is the policy. The `speckit-stack` skill is the procedure and should stay a thin
command guide. Pull request templates and the specification, plan, and implementation review instructions should
match that policy without copying it.

- Keep requirements, delivery-plan, and delivery-issue authority unchanged.
- Keep read-only inspection separate from rebase, push, and merge.
- Require an explicit human merge request. Passing checks and Copilot comments are not approval.
- Keep pull requests draft until a phase is ready for one review.
- Refuse force-push, hard reset, and rewriting commits already on the default branch.
- Confirm plan and implementation branches keep the specification's Spec Kit number and are not created with
  `speckit.git.feature`.
- Confirm a pull request changes `specs/` only inside its own `specs/{number}-{slug}/` directory. Other feature
  directories stay historic. Living documentation belongs in `docs/`.
