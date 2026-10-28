---
applyTo: "specs/**/plan.md,specs/**/contracts/**,specs/**/research.md,specs/**/data-model.md,specs/**/quickstart.md"
---

# Engineering plan review

Review the architecture and contract decision. The approved `spec.md` and `verification.md` are the feature
contract. Use [Git and pull request workflow](../../docs/engineering/git-workflow.md).

- Check whether each affected responsibility is preserved, extended, subdivided, extracted, or promoted, and whether
  every new abstraction has a current consumer.
- Check public TypeScript and Effect contracts, error ownership, consumer-inward types, compatibility, and the
  Next.js boundary.
- Check that module evidence names a claim, a meaningful violation, and a boundary. Do not demand executed results
  in a plan review. `quickstart.md` at this phase is the planned execution mapping.
- Do not redefine acceptance criteria, delivery scope, or accepted requirements.
- If the diff only records execution results in `quickstart.md`, review those results as evidence rather than as a
  new architecture decision.
- Flag any path under `specs/` outside this pull request's single `specs/{number}-{slug}/` directory. Those
  files are historic. Do not ask for another feature's plan or contracts to be revised. Current behavior belongs
  in `docs/`.
