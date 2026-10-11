---
applyTo: "tests/bdd/**,**/*.feature"
---

# Requirements BDD review

Use [Requirements-backed BDD](../../docs/engineering/testing/requirements-bdd.md) as the semantic and traceability
authority, [Testing as evidence](../../docs/engineering/testing/README.md) for observations, and
[step guidance](../../tests/bdd/steps/README.md) for the owned application boundary.

- Read each changed scenario and its step implementations, following relevant shared helpers and callers.
  Apply the same review when only a step or helper changes. Flag hidden product assertions in steps or setup.
- Every scenario must carry or inherit lowercase requirement-ID tags such as `@preets-tenant-003`. Resolve them
  to the corresponding `PREETS-TENANT-003` entry in the current main-branch requirements, equivalent to
  `origin/main` locally. Identify the baseline revision. Do not use PR-only additions or stronger promises to
  justify assertions, even when this PR targets another branch. Retired requirements are historical references.
- Justify every product assertion through the referenced requirement's meaning, conditions, criteria, or explicit
  design constraints. Current UI content, implementation choices, and technical incidentals do not create obligations.
  Dashboard HTTP reachability alone does not justify asserting tenant-name presentation or prove tenant selection.
- Flag assertions outside the promise and observations that cannot establish the claimed slice. Ground suggestions
  to add assertions in requirement IDs too. Flag desirable undocumented behavior separately as a gap for consideration;
  do not suggest inserting it into tests before its requirement is merged into main.
- Respect intermediate slices. Feature-level `@partial` means incomplete evidence for one or more referenced
  requirements; its description should name the established slice and remaining gaps. Scenarios still execute and
  must pass. Do not demand full requirement coverage, exhaustive matrices, or redundant permutations in the PR.
- Consult issues explicitly linked to the PR when accessible for slice context. Issue scope cannot expand the
  main-branch requirement. Report unavailable baseline or issue access as limitations without inventing approval,
  issue URLs, or slice intent. Missing optional issue context alone is not a defect.
- Suggest removing `@partial` when that feature's scenarios and step implementations establish the full applicable
  scope of all referenced requirements, including scenario-level IDs. Evidence elsewhere, closed issues, and passing
  partial scenarios do not establish feature completeness. Removal does not set register verification or prove execution.

Report actionable defects with requirement IDs, locations, consequences, and bounded corrections. Separate requirement
gaps and evidence/access limitations. Preserve historical specifications and `features/TRACEABILITY.md`.
