# Pre-ETS specification and planning preset

This project-owned preset adapts the upstream Spec Kit specification, clarification,
planning, task, implementation, constitution, and checklist commands without editing their generated
core files.

It establishes this flow:

1. One authorized GitHub delivery issue is the feature input.
2. Accepted requirements on `origin/main`, the reviewed delivery plan, and the issue
   remain read-only authorities.
3. Specification produces an implementation-independent `spec.md` and
   `verification.md`. Each claim names the observation that distinguishes it and
   its evidence channel.
4. Planning proceeds through module architecture, public contracts and type
   signatures, contract evidence, private implementation architecture, feature
   verification integration, the verification telemetry contract in
   `contracts/telemetry.md`, then implementation slices.
5. Task generation consumes feature verification, module contracts, and the
   telemetry contract, grouped by slice with a verification handoff per slice.
6. Implementation runs one slice per branch: it resolves the slice from the branch
   name, executes only that slice's tasks, checks its hand-written file count, and
   stops after its verification handoff.
7. Specification, plan, and each implementation slice are reviewed on their own
   pull requests, as described in `docs/engineering/git-workflow.md` and
   `docs/engineering/verification-harness.md`.

The preset composes with upstream commands through `wrap` and with upstream document
templates through `append`. Upstream command and template improvements therefore remain
part of the effective artifacts after Spec Kit upgrades.

The composed template resolver requires PyYAML. Preset commands invoke it through
`uv run --with pyyaml==6.0.3 -- ...` so the dependency is isolated from the product workspaces
and does not require a machine-global Python installation.

The installed package lives under
`.specify/presets/pre-ets-specification-planning/`. The Spec Kit registry and rendered
Codex skills are CLI-managed outputs and should be refreshed through the Spec Kit CLI,
not hand-edited.
