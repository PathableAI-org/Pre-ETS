# Contract: OTLP Trace Export

**Consumers**: Effect backend process; any OTLP-compatible collector (local
`otel-lgtm` or deployed).

**Producer**: `@pathableai/pre-ets-backend` when traces are enabled.

## Transport

- Protocol: OTLP over HTTP
- Default local endpoint base: `http://127.0.0.1:4318`
- Traces URL: `{base}/v1/traces`
- Auth: none locally; optional headers from configuration when deployed

## Enablement

| Condition                      | Export behavior                         |
| ------------------------------ | --------------------------------------- |
| `OTEL_TRACES_ENABLED` not true | No export; process healthy              |
| Enabled + valid endpoint       | Batch export of ended sampled spans     |
| Collector unreachable          | Best-effort; request handling continues |

## Resource

- `service.name` = configured service name (default `pre-ets-backend`)

## Compatibility

Any backend accepting OTLP/HTTP traces satisfies this contract. No vendor-specific
export format is permitted as the primary path.
