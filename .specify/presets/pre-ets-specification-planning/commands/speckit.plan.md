# Pre-ETS phased engineering planning

Apply this project workflow before and while executing the wrapped planning command.

When the wrapped workflow performs setup, run
`uv run --with pyyaml==6.0.3 -- .specify/scripts/bash/setup-plan.sh --json` instead of invoking
the Bash script directly. Preset-aware plan-template composition requires PyYAML that
may not exist in the system Python.

## Planning gate and authority

Load `verification.md` from the feature directory in addition to the wrapped command's
inputs. Re-read the delivery issue and authoritative requirement/delivery sources as
needed, but treat the approved `spec.md` and `verification.md` as the feature contract
for planning. Do not edit those sources to make an architecture convenient.

If behavior, authorized scope, acceptance expectations, or verification obligations are
materially ambiguous or conflict with an authority, stop the affected design and report
the five-part blocking finding. Resolve ordinary technical choices in the plan. Do not
send product questions back merely because multiple sound implementations exist.

Before designing Effect code, read `docs/engineering/effect-guidance.md`, the affected
workspace `AGENTS.md`, the available Effect v4 `LLMS.md` and only its relevant linked
material. Verify every proposed external API against the owning workspace's installed
declarations; local source may be ahead of the product pin.

## Required design order

The wrapped research phase may establish the current implementation and dependency
facts. After that, design in this explicit order and keep the phases reviewable:

### 1. Module architecture

Inspect actual consumers and the current recursive ownership boundaries. For every
affected responsibility, decide whether to preserve the structure, extend an existing
public module, decompose it into private children, extract another public module, or
promote an independently owned concern into a package/workspace. Record the decision and
why a new abstraction is or is not warranted. Size or novelty alone is not a reason.

### 2. Public module contracts

Run
`uv run --with pyyaml==6.0.3 -- .specify/scripts/bash/resolve-template.sh modules-contract-template --json`
and use the returned content to create or update `contracts/modules.md`. Cover every
affected public module, including changed existing contracts. Design from actual
consumers inward and state concrete TypeScript signatures before private implementation.

For each public capability identify inputs, success, expected errors, Effect environment
requirements where applicable, semantic invariants, validation/decoding ownership,
compatibility, and relationships with other public modules. The owning parent controls
its public error vocabulary; translate private failures where consumers need stable
semantics without hiding distinct expected outcomes or confusing defects/interruption
with recoverable failure.

Do not add provider interfaces, services, packages, re-exports, or future-shaped types
without a current consumer. Pure transformations and framework-specific adapters remain
idiomatic when Effect adds no useful semantics.

### 3. Module contract evidence

For each contract claim use the repository sequence: consumer → claim → possible
violation → evidence → limitations. Select the smallest meaningful boundary:

- public-interface Vitest examples or Effect service scenarios;
- Fast-Check properties for useful invariants;
- real integration evidence for distinct infrastructure uncertainty;
- existing evidence that already supports the claim;
- manual or transient probes when they add an observation durable tests should not own.

Manual module evidence is conditional, unlike standard feature manual verification.
Observability remains manual or transient. Temporary code and instrumentation must have
cleanup instructions and must not be committed; retain the claim, revision, environment,
observation, result, and limitation instead. Never expose credentials or raw sensitive
values in output.

### 4. Implementation architecture

Only after phases 1–3, design private children, Effect services and Layers, runtime and
resource composition, external adapters, configuration/infrastructure, thin Next.js
boundaries, telemetry instrumentation, and concrete implementation sequencing. Prefer
Effect ecosystem capabilities when they solve an actual Effect workflow; do not wrap
pure TypeScript or framework behavior for uniformity. Reuse the host-owned runtime
rather than constructing one per operation.

### 5. Feature verification integration

Consume rather than replace `verification.md`. In `quickstart.md`, turn its accepted
claims into an implementation-aware execution guide with exact prerequisites, commands,
manual procedures, expected observations, cleanup, retained records, and limitations.
Distinguish module evidence from feature evidence and avoid duplicate observations that
make the same claim at several layers.

Complete the appended sections in `plan.md`; link rather than duplicate
`contracts/modules.md` and `verification.md`. Generate `data-model.md` and external
interface contracts only when the feature actually needs them.

{CORE_TEMPLATE}

## Pre-ETS completion rule

Do not report planning complete until the five design phases are explicit,
`contracts/modules.md` covers every affected public module, proposed external APIs were
checked against installed declarations, module evidence is claim-based, and
`quickstart.md` operationalizes the approved feature verification plan. No unresolved
product decision may be hidden as an implementation assumption. Follow
`docs/engineering/git-workflow.md`: `$speckit-stack` opens the engineering-plan pull
request from the specification branch. Generate tasks only after it adds the
implementation branch.
