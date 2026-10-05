# Contract: Backend Request Span Attributes

**Consumers**: Developers and agents inspecting traces in Grafana / OTLP backends.

**Producer**: Effect backend HTTP request handling when traces are enabled.

## Required attributes (acceptance minimum)

| Attribute                   | Example                       | Notes                         |
| --------------------------- | ----------------------------- | ----------------------------- |
| `http.request.method`       | `GET`                         | Verb for the request          |
| `http.route`                | `/health` or `/api/items/:id` | Route template when available |
| `http.response.status_code` | `200`                         | Final status code             |

## Demo verification set (SC-003)

| Request                                  | Expected status | Expected `http.route` |
| ---------------------------------------- | --------------- | --------------------- |
| `GET http://127.0.0.1:8080/health`       | 200             | `/health`             |
| `GET http://127.0.0.1:8080/health/error` | 500             | `/health/error`       |

Each MUST produce an exportable request-scoped span with all three required
attributes.

## Prohibited attributes / payloads

MUST NOT appear on spans:

- `Authorization` / bearer tokens / API keys
- Cookie headers or session identifiers
- Raw request/response bodies containing user or health data
- Tenant secrets or credentials from configuration

## Correlation (this increment)

- Request span is a root span (no required inbound `traceparent` from frontend).
- Cross-process propagation is explicitly out of scope.

## Verification

Given the demo routes above, a trace search by `service.name` (`pre-ets-backend`)
and route/method MUST locate a span containing all three required attributes.

Unit tests for the attribute allow-list helper MUST include at least one
**negative fixture** that rejects a prohibited attribute (e.g. Authorization).
Manual/sample span review (SC-007) remains required in addition to unit tests.
