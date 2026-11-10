---
applyTo: "packages/**,tests/**,e2e/**,features/**,specs/**/tasks.md,specs/**/quickstart.md"
---

# Implementation review

Review the implementation against the approved specification and engineering plan. Use
[Git and pull request workflow](../../docs/engineering/git-workflow.md), the constitution, and
[Testing as evidence](../../docs/engineering/testing/README.md).

- Check correctness, public-contract compatibility, meaningful tests, security constraints, and stated limitations.
- In Effect workspaces, apply [Errors and identifiers](../../docs/engineering/effect-guidance.md#errors-and-identifiers).
  Lint cannot see two of its rules: a service error that carries an HTTP status or another transport detail, and an
  untagged wrapper error where a tagged `reason` union belongs. Check for both.
- In Effect workspaces, flag file, request, or stored content routed through a `ConfigProvider` or `Config` recipe
  instead of being read and decoded with Schema. Also flag a failure classified by string matching on a cause,
  including when the matching is wrapped in a helper that lint does not see. Flag hand-written type checks on
  untrusted input where a Schema of the accepted shapes belongs. Flag a sync decoder bound outside a generator and
  called inside one. See
  [Validation, errors, and runtime checks](../../docs/engineering/effect-guidance.md#validation-errors-and-runtime-checks).
- In Effect workspaces, flag a retry written as self-recursion with a counter instead of `Effect.retry`, and a
  production module object exported only so tests can patch it with `vi.spyOn`; see
  [Resources, time, and existing application code](../../docs/engineering/effect-guidance.md#resources-time-and-existing-application-code).
- Flag a helper, constant, or type that repeats one already in the workspace or in the package it shares with,
  such as loopback detection, cookie attributes, or cache headers. Flag local annotations that restate an inferred
  type, and ternaries that build two object shapes only to omit an optional property.
- Flag single-use helpers whose only purpose is to lower a complexity score. Ask for a representation that removes
  the branches; see [Fallow](../../docs/engineering/fallow.md#complexity-dead-code-and-type-aware-analysis).
- Flag behavior or signatures that drift from the approved specification or `contracts/modules.md`.
- Flag instrumentation that drifts from `contracts/telemetry.md`, a telemetry attribute or log field in a forbidden
  data class from the
  [verification telemetry conventions](../../docs/observability.md#verification-telemetry-conventions), and durable
  tests that assert telemetry output.
- For a delivery-issue implementation slice, check that the pull request names its slice from `plan.md` and
  summarizes a verification report for that slice's claims, as described in
  [the verification harness](../../docs/engineering/verification-harness.md). Flag a missing or unusable assigned
  telemetry row, a full claim that is not `established`, and a `not established` or `blocked` result that does not
  match a limitation already approved in `verification.md` or `plan.md`; the slice cannot create that exception. Flag a slice well over 15 hand-written
  files without a stated reason. A single pull request that the
  [Git workflow](../../docs/engineering/git-workflow.md#implementation-slices) exempts from the stack, such as a
  dependency update or a fix inside an approved contract, needs no slice or verification report; check that it
  says why the stack does not apply.
- A planned `quickstart.md` procedure is not defective because it has not yet been executed. On an implementation
  review, identify evidence the pull request claims but does not show.
- Do not treat a Copilot suggestion as approval to change an accepted requirement, delivery slice, or public contract.
- Flag any path under `specs/` outside this pull request's single `specs/{number}-{slug}/` directory. This phase
  may update that feature's `tasks.md` and `quickstart.md`. Other feature directories are historic. Current
  behavior belongs in `docs/`.
