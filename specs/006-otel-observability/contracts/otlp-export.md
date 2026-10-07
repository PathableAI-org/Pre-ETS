# Contract: OTLP Trace Export

**Consumers**: Next.js Node process; any OTLP-compatible collector (local
`grafana/otel-lgtm:0.35.0` or deployed).

**Producer**: `@pathableai/pre-ets-frontend` (Next Node runtime) when
`OTEL_EXPORTER_OTLP_ENDPOINT` is present — `@vercel/otel` is the sole OTLP exporter.
Registration runs inside ManagedRuntime boot (via Next `instrumentation.ts` import).

## Transport

- Protocol: OTLP over HTTP (SDK / `@vercel/otel` defaults and env)
- Default local endpoint base: `http://127.0.0.1:4318`
- Traces URL: `{base}/v1/traces` (SDK)
- Auth: none locally; optional headers from `OTEL_EXPORTER_OTLP_HEADERS` when
  deployed (MUST be forwarded by the SDK; SC-004 verifies a synthetic header)

## Enablement & precedence

App-owned gate (presence only). Endpoint URL shape is not validated by app code.

| Priority | Condition                                   | Result                                                                  |
| -------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| 1        | `OTEL_EXPORTER_OTLP_ENDPOINT` missing/blank | No `registerOTel`; process healthy; no export                           |
| 2        | Endpoint present (non-blank)                | `registerOTel` + Effect global Tracer bridge during ManagedRuntime boot |

Once registered, the OpenTelemetry SDK / `@vercel/otel` apply
`OTEL_SDK_DISABLED`, headers, protocol, and exporter behavior from the environment.

**Why endpoint presence enables**: Standard OTEL operator model. Unset endpoint
keeps local workflows quiet. Operators are responsible for a correct endpoint address.

## Runtime export failure

| Condition                         | Export behavior                         |
| --------------------------------- | --------------------------------------- |
| Collector unreachable after start | Best-effort; request handling continues |

## Resource

- `service.name` = configured service name (default `pre-ets-frontend`)
- Local sampling: **100%** (`traceSampler: "always_on"`)

## Headers

When `OTEL_EXPORTER_OTLP_HEADERS` is set (e.g.
`Authorization=Bearer test-token`), every OTLP/HTTP export request MUST include
those headers. SC-004 / live second-endpoint proof MUST assert header presence,
not only that a span payload arrived.

## Compatibility

Any collector accepting OTLP/HTTP traces satisfies this contract. No
vendor-specific export format is permitted as the primary path.
