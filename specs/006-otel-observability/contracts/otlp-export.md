# Contract: OTLP Trace Export

**Consumers**: Effect backend process; any OTLP-compatible collector (local
`grafana/otel-lgtm:0.35.0` or deployed).

**Producer**: `@pathableai/pre-ets-backend` when traces are enabled.

## Transport

- Protocol: OTLP over HTTP
- Default local endpoint base: `http://127.0.0.1:4318`
- Traces URL: `{base}/v1/traces`
- Auth: none locally; optional headers from configuration when deployed

## Enablement & precedence

Evaluation order at process boot (first matching row wins for “install tracer /
export?”):

| Priority | Condition                                               | Result                                                                                                        |
| -------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1        | `OTEL_TRACES_ENABLED` not `true`/`1`                    | No tracer Layer; process healthy; no export                                                                   |
| 2        | `OTEL_SDK_DISABLED=true`                                | No export (even if traces “enabled”); process healthy                                                         |
| 3        | Enabled + missing/invalid `OTEL_EXPORTER_OTLP_ENDPOINT` | Clear diagnostic; **local/dev** fail-soft (no export); **production** (`NODE_ENV=production`) refuse-to-start |
| 4        | Enabled + valid endpoint                                | Install tracer Layer; batch export of ended sampled spans                                                     |

**Why `OTEL_TRACES_ENABLED` exists**: Default-off Layer install so local
workflows do not export merely because an OTEL endpoint env var is present from
unrelated tooling. Standard OTEL vars (`OTEL_EXPORTER_OTLP_*`,
`OTEL_SDK_DISABLED`, `OTEL_SERVICE_NAME`) still apply once enabled.

`OtlpTracer.layerFromConfig` may be used for endpoint/header/batch wiring, but
the host MUST still gate Layer installation on `OTEL_TRACES_ENABLED`.

## Runtime export failure

| Condition                         | Export behavior                         |
| --------------------------------- | --------------------------------------- |
| Collector unreachable after start | Best-effort; request handling continues |

## Resource

- `service.name` = configured service name (default `pre-ets-backend`)
- Local sampling: **100%**

## Compatibility

Any backend accepting OTLP/HTTP traces satisfies this contract. No vendor-specific
export format is permitted as the primary path.
