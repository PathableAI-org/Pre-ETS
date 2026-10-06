# Contract: Next Request Span Attributes

**Consumers**: Developers and agents inspecting traces in Grafana / OTLP backends.

**Producer**: Next.js Node HTTP demo handlers when traces are enabled
(Effect `Effect.withSpan` via `ManagedRuntime` + `OtlpTracer`).

## Required attributes (acceptance minimum)

The request span MUST identify method, route/path template, and status/outcome.
Next **16.3.8** may emit older or newer HTTP semantic-convention names; either
form is acceptable if all three facts are present:

| Fact             | Accepted attribute keys (any one per fact)            | Example       |
| ---------------- | ----------------------------------------------------- | ------------- |
| HTTP method      | `http.request.method` **or** `http.method`            | `GET`         |
| Route template   | `http.route` **or** `next.route`                      | `/api/health` |
| Status / outcome | `http.response.status_code` **or** `http.status_code` | `200`         |

## Demo verification set (SC-003)

| Request                                      | Expected status | Expected route      |
| -------------------------------------------- | --------------- | ------------------- |
| `GET http://127.0.0.1:3000/api/health`       | 200             | `/api/health`       |
| `GET http://127.0.0.1:3000/api/health/error` | 500             | `/api/health/error` |

Each MUST produce an exportable request-scoped span with all three required
facts.

## Prohibited attributes / payloads

MUST NOT appear on spans:

- `Authorization` / bearer tokens / API keys
- Cookie headers or session identifiers
- Raw request/response bodies containing user or health data
- Tenant secrets or credentials from configuration

## Correlation (this increment)

- Request span is a root span (no required inbound `traceparent` from browser).
- Cross-process propagation is explicitly out of scope.
- Effect-native spans / second exporters are out of scope.

## Verification

Given the demo routes above, a trace search by `service.name`
(`pre-ets-frontend`) and route/method MUST locate a span containing all three
required facts.

Unit tests for attribute filtering MUST include:

1. At least one **negative fixture** that rejects a prohibited attribute (e.g. Authorization) on the helper.
2. At least one **producer-boundary** test that captures an **emitted** span after the register/export pipeline and asserts prohibited attributes are absent (helper-only tests do not satisfy FR-009 / SC-007).
   Manual/sample span review (SC-007) remains required in addition to unit tests.
