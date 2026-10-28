---
applyTo: "specs/**"
---

# Spec Kit artifact scope

Review changed paths under `specs/` against the Artifacts section of
[Git and pull request workflow](../../docs/engineering/git-workflow.md).

- Every changed path under `specs/` must sit in the one `specs/{number}-{slug}/` directory this pull request is
  for. The branch name and pull request should name that feature.
- Flag edits in any other feature directory. That includes plan, specification, contract, research, task, and
  quickstart updates that only catch those files up to later code.
- A correction is in scope only when the pull request is for that same feature.
- Do not ask the author to revise another feature's Spec Kit files. Current behavior belongs in `docs/`.
