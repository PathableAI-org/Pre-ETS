# Pre-ETS preset-aware constitution setup

Apply this runtime rule while executing the wrapped constitution workflow.

Run
`uv run --with pyyaml==6.0.3 -- .specify/scripts/bash/resolve-template.sh constitution-template --json`
instead of invoking the Bash resolver directly. Parse `TEMPLATE_CONTENT` exactly as the
wrapped workflow requires. Preset composition requires PyYAML that may not exist in the
system Python.

{CORE_TEMPLATE}
