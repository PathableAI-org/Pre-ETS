# Pre-ETS specification and planning preset

This project-owned preset adapts the upstream Spec Kit specification, clarification,
planning, task, constitution, and checklist commands without editing their generated
core files.

It establishes this flow:

1. One authorized GitHub delivery issue is the feature input.
2. Accepted requirements on `origin/main`, the reviewed delivery plan, and the issue
   remain read-only authorities.
3. Specification produces an implementation-independent `spec.md` and
   `verification.md`.
4. Planning proceeds through module architecture, public contracts and type
   signatures, contract evidence, then private implementation architecture.
5. Task generation consumes both feature verification and module contracts.

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
