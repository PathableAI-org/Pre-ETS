# Contract: OTLP Trace Export

**Consumers**: Next.js Node process; any OTLP-compatible collector (local
`grafana/otel-lgtm:0.35.0` or deployed).

**Producer**: `@pathableai/pre-ets-frontend` (Next Node runtime) when traces are
enabled.

## Transport

- Protocol: OTLP over HTTP
- Default local endpoint base: `http://127.0.0.1:4318`
- Traces URL: `{base}/v1/traces`
- Auth: none locally; optional headers from `OTEL_EXPORTER_OTLP_HEADERS` when
  deployed (MUST be forwarded; SC-004 verifies a synthetic header)

## Enablement & precedence

Evaluation order at process boot (first matching row wins for “register OTEL /
export?”):

| Priority | Condition                                               | Result                                                                                                        |
| -------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1        | `OTEL_TRACES_ENABLED` not `true`/`1`                    | No OtlpTracer Layer; process healthy; no export                                                               |
| 2        | `OTEL_SDK_DISABLED=true`                                | No export (even if traces “enabled”); process healthy                                                         |
| 3        | Enabled + missing/invalid `OTEL_EXPORTER_OTLP_ENDPOINT` | Clear diagnostic; **local/dev** fail-soft (no export); **production** (`NODE_ENV=production`) refuse-to-start |
| 4        | Enabled + valid endpoint                                | Provide Effect `OtlpTracer` Layer; batch export of ended sampled spans                                        |

**Why `OTEL_TRACES_ENABLED` exists**: Default-off Layer install so local workflows do
not export merely because an OTEL endpoint env var is present from unrelated
tooling. Standard OTEL vars (`OTEL_EXPORTER_OTLP_*`, `OTEL_SDK_DISABLED`,
`OTEL_SERVICE_NAME`) still apply once enabled.

## Runtime export failure

| Condition                         | Export behavior                         |
| --------------------------------- | --------------------------------------- |
| Collector unreachable after start | Best-effort; request handling continues |

## Resource

- `service.name` = configured service name (default `pre-ets-frontend`)
- Local sampling: **100%**

## Headers

When `OTEL_EXPORTER_OTLP_HEADERS` is set (e.g.
`Authorization=Bearer test-token`), every OTLP/HTTP export request MUST include
those headers. SC-004 / live second-endpoint proof MUST assert header presence,
not only that a span payload arrived.

## Compatibility

Any collector accepting OTLP/HTTP traces satisfies this contract. No
vendor-specific export format is permitted as the primary path.
