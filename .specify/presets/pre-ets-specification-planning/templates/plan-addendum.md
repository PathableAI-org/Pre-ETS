## Phased Engineering Design

### Phase 1 — Module architecture

[Describe affected logical responsibilities and consumers. For each concern, record the decision to preserve,
extend, decompose, extract, or promote a module/package and justify whether a new abstraction is warranted.]

### Phase 2 — Public module contracts

[Link to `contracts/modules.md` and summarize compatibility-sensitive public contract decisions. Do not duplicate
the full signatures or private design.]

### Phase 3 — Module contract evidence

[Summarize the consumer claims, meaningful violations, evidence boundaries, and limitations designed in
`contracts/modules.md`. Distinguish durable, manual, transient, and existing evidence.]

### Phase 4 — Implementation architecture

[Describe private children, Effect/Layer and resource composition, adapters, configuration, infrastructure,
telemetry, and sequencing that follow from the public contracts.]

### Phase 5 — Feature verification integration

[Link to `verification.md` and `quickstart.md`. Explain how implementation-aware procedures establish each feature
claim without replacing the approved feature verification design or duplicating module evidence.]

### Phase 6 — Verification telemetry contract

[Link to `contracts/telemetry.md`. Summarize which claims the telemetry observes, the spans, logs, and metrics it
adds, and the facts deliberately not emitted with how each is verified instead. Do not duplicate the signal table.]

### Phase 7 — Implementation slices

| Slice | Decision a reviewer accepts | Contracts and modules         | Telemetry rows | Claim IDs advanced     | Est. hand-written files |
| ----- | --------------------------- | ----------------------------- | -------------- | ---------------------- | ----------------------- |
| [S1]  | [One reviewable decision]   | [From `contracts/modules.md`] | [T-001]        | [V-001, partial V-002] | [≤ ~15, or the reason]  |

[Each slice is vertical: it passes the repository checks on its own, and each public contract lands with its first
consumer and its evidence. Explain the order and any slice that cannot stay near 15 hand-written files. See
`docs/engineering/git-workflow.md#implementation-slices`.]
