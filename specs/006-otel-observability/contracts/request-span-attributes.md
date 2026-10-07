# Contract: Next Request Span Attributes

**Consumers**: Developers and agents inspecting traces in Grafana / OTLP backends.

**Producer**: `@vercel/otel` auto-instrumented HTTP request spans on the Next.js
Node server when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Effect `Effect.withSpan`
may add logical child spans via `@effect/opentelemetry` when used; those children
are not required to carry HTTP semantic attributes.

## Required attributes (acceptance minimum)

The **HTTP request span** SHOULD identify method, route/path template, and
status/outcome when Next emits them. Next **16.3.8** may emit older or newer HTTP
semantic-convention names; either form is acceptable if all three facts are
present:

| Fact             | Accepted attribute keys (any one per fact)            | Example |
| ---------------- | ----------------------------------------------------- | ------- |
| HTTP method      | `http.request.method` **or** `http.method`            | `GET`   |
| Route template   | `http.route` **or** `next.route`                      | `/`     |
| Status / outcome | `http.response.status_code` **or** `http.status_code` | `307`   |

## Verification set (SC-003)

Any Next Node HTTP request that reaches the instrumented process MUST produce an
exportable request-scoped HTTP span for service `pre-ets-frontend`. Redirect or
auth challenge outcomes are acceptable for smoke checks (e.g. `GET /`).

## Prohibited attributes / payloads

MUST NOT appear on spans:

- `Authorization` / bearer tokens / API keys
- Cookie headers or session identifiers
- Raw request/response bodies containing user or health data
- Tenant secrets or credentials from configuration

Operators MUST NOT configure `@vercel/otel` `attributesFromHeaders` to map
sensitive headers. Application code MUST NOT annotate secrets onto
`Effect.withSpan` attributes.

## Correlation (this increment)

- HTTP request span is a root span (no required inbound `traceparent` from browser).
- Cross-process propagation is explicitly out of scope.
- A second OTLP exporter (including Effect `OtlpTracer`) is out of scope.

## Verification

A Tempo (or equivalent) search by `service.name` (`pre-ets-frontend`) after
traffic MUST locate at least one HTTP span. SC-007 is a **manual** sample review
that prohibited attributes are absent (no custom SpanProcessor required).
