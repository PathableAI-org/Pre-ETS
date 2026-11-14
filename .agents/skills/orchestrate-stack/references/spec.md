# Specification brief

Role: `specification`. Set `{{combined}}` to `yes` for Standard new behavior (one combined specification-and-plan
pull request), otherwise `no`.

---

**Task.** Specify delivery issue #{{issue}}. Combined specification and plan: {{combined}}.

**Identifiers.**

- Delivery issue: #{{issue}}; tier {{tier}}; triggers: {{triggers}}
- Start from: `origin/main`. Spec Kit allocates `{number}-{slug}`, the branch, and `specs/{number}-{slug}/`.

**Read first.**

- [Git and pull request workflow](docs/engineering/git-workflow.md): risk tiers, the full or combined stack,
  branches, and Decisions for the reviewer
- [Verification harness](docs/engineering/verification-harness.md): what `verification.md` needs at tier {{tier}}
- [Testing as evidence](docs/engineering/testing/README.md) and the delivery issue's accepted requirements
- The constitution's [Development Workflow](.specify/memory/constitution.md#development-workflow-and-review)

**Do.**

1. Run `speckit-specify` for exactly this issue, then `speckit-clarify`. Ask the person your clarification questions
   in this session; end your turn while you wait.
2. Write `spec.md` with the tier and triggers in its header, `verification.md`, and the specification checklist.
3. If combined is `yes`, also run `speckit-plan` on the same branch for `plan.md`, `contracts/modules.md`, and
   `quickstart.md`, with no `contracts/telemetry.md`. A claim that needs telemetry makes the work High: stop and
   escalate.
4. Through `speckit-stack`, submit the draft pull request with the specification template, a Conventional Commit
   title, `Contributes to #{{issue}}`, the `risk:` label, and Decisions for the reviewer first. Mark it ready when its
   checks pass.

**Boundaries.** Do not plan modules or telemetry unless combined is `yes`. Do not edit requirements, delivery plans,
or any other `specs/` directory. A requirement or delivery-slice conflict stops the work: report it to the
orchestrator.

**Done when** the pull request is ready for review with passing checks. Report the pull request number, branch, and
feature directory, then stop. A person approves it.
