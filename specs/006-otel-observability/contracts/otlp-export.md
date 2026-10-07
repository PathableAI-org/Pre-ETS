# Contract: OTLP Trace Export

**Consumers**: Next.js Node process; any OTLP-compatible collector (local
`grafana/otel-lgtm:0.35.0` or deployed).

**Producer**: `@pathableai/pre-ets-frontend` (Next Node runtime) —
`@vercel/otel` is the sole OTLP exporter. Registration always runs inside
ManagedRuntime boot (via Next `instrumentation.ts` import).

## Transport

- Protocol: OTLP over HTTP (SDK / `@vercel/otel` defaults and env)
- Default local endpoint base: `http://127.0.0.1:4318`
- Traces URL: `{base}/v1/traces` (SDK)
- Auth: none locally; optional headers from `OTEL_EXPORTER_OTLP_HEADERS` when
  deployed (MUST be forwarded by the SDK; SC-004 verifies a synthetic header)

## Enablement & precedence

App always calls `registerOTel` + installs the Effect global Tracer bridge.
Off/on is owned by the SDK env, not `ServerConfig`.

| Priority | Condition                           | Result                                                                      |
| -------- | ----------------------------------- | --------------------------------------------------------------------------- |
| 1        | `OTEL_SDK_DISABLED` set (non-empty) | `@vercel/otel` early-returns; no exporters/instrumentation; process healthy |
| 2        | SDK not disabled                    | SDK exports using endpoint/headers/protocol from the environment            |

When the SDK is enabled and `OTEL_EXPORTER_OTLP_ENDPOINT` is unset,
`@vercel/otel` defaults the traces URL to `http://localhost:4318/v1/traces`.

**Why `OTEL_SDK_DISABLED` for off**: Calling `registerOTel` without an endpoint
still configures an OTLP exporter (localhost default). The standard SDK disable
flag is the quiet local kill switch.

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
