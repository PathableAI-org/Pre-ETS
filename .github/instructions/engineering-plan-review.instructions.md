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
- Check that `contracts/telemetry.md` gives every telemetry-channel observation in `verification.md` a signal and a
  verifier query, follows the
  [verification telemetry conventions](../../docs/observability.md#verification-telemetry-conventions), and emits no
  forbidden data class. A fact that cannot be emitted safely needs another stated way to verify it.
- Check the slices against
  [Implementation slices](../../docs/engineering/git-workflow.md#implementation-slices): one decision each, about 15
  hand-written files at most or a stated reason, and vertical.
- Do not redefine acceptance criteria, delivery scope, or accepted requirements.
- If the diff only records execution results in `quickstart.md`, review those results as evidence rather than as a
  new architecture decision.
