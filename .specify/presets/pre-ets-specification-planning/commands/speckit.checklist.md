# Pre-ETS preset-aware checklist setup

Apply this runtime rule while executing the wrapped checklist workflow.

When the wrapped workflow performs setup, run
`uv run --with pyyaml==6.0.3 -- .specify/scripts/bash/check-prerequisites.sh --json --template checklist-template`
instead of invoking the Bash script directly. Preset-aware checklist-template
composition requires PyYAML that may not exist in the system Python.

{CORE_TEMPLATE}
