# Verification Telemetry Contract: [FEATURE NAME]

**Plan**: [plan.md](../plan.md)

**Feature verification**: [verification.md](../verification.md)

**Module contracts**: [modules.md](modules.md)

**Status**: Planned design — no instrumentation exists until an implementation slice adds it

This contract designs the runtime telemetry a verification agent needs for the feature's claims. It follows the
[verification telemetry conventions](../../../docs/observability.md#verification-telemetry-conventions) and the
[verification harness](../../../docs/engineering/verification-harness.md). Instrumentation listed here is committed
product code. Durable tests do not assert it.

## Observation coverage

Every claim in `verification.md` whose evidence channel is server or browser telemetry appears here.

| Claim IDs | Required observation (from `verification.md`) | Signal rows    | Slice |
| --------- | --------------------------------------------- | -------------- | ----- |
| [V-001]   | [Fact the verifier must learn]                | [T-001, T-002] | [S1]  |

## Signals

| ID    | Signal       | Name                                 | Emitted by                        | Attributes or fields and data class                                | Correlation                                                  | Verifier query                          | Expected negative observation                       |
| ----- | ------------ | ------------------------------------ | --------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ | --------------------------------------- | --------------------------------------------------- |
| T-001 | [Span / log] | [`Service.operation` or log message] | [Owning public module or adapter] | [`preets.<area>.<name>`: meaning, type, allowed data class]        | [trace context, `session.id`, `preets.tenant.alias`]         | [TraceQL or LogQL with revision filter] | [What the verifier sees when the claim is violated] |
| T-002 | [Metric]     | [metric name]                        | [Owning public module or adapter] | [Enumerated low-cardinality attributes: meaning, closed value set] | [`service.version`, environment, enumerated attributes only] | [PromQL with revision filter]           | [What the verifier sees when the claim is violated] |

Spans and correlated logs may correlate by trace context, `session.id`, and `preets.tenant.alias`. Metrics never
carry session, trace, user, or request identifiers or timestamps; they correlate only by `service.version`,
environment, and the low-cardinality attributes listed under [Metrics cardinality](#metrics-cardinality).

### Outcome values

| Signal | `preets.outcome` values and meaning |
| ------ | ----------------------------------- |
| T-001  | [`value`: meaning]                  |

Use one closed set per signal. Every value must be reachable and distinguishable by the verifier.

## Facts not emitted

| Claim IDs | Fact                                   | Why it is not emitted          | How it is verified instead                       |
| --------- | -------------------------------------- | ------------------------------ | ------------------------------------------------ |
| [V-002]   | [Fact a verifier would otherwise need] | [Forbidden data class or cost] | [Module test, browser interaction, or opaque ID] |

## Metrics cardinality

[For each metric, list its attributes and confirm none is a session, trace, user, or request identifier or a
timestamp. State "No metrics" when the feature adds none.]

## Verifier environment

[Settings the verifier needs beyond the standard harness environment: tenant fixtures, short policy values or
controllable time, services, and export delays. Never include credentials or real header values.]

## Readiness review

- [ ] Every telemetry-channel claim in `verification.md` maps to at least one signal row or a stated alternative.
- [ ] Every signal names its emitting module, its query, and the observation that shows a violation.
- [ ] No attribute or field falls in a forbidden data class.
- [ ] Metric attributes are low-cardinality.
- [ ] Every signal is assigned to the implementation slice that implements the behavior it observes.
