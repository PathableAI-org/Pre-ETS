# Capability step definitions

Steps are split by capability and execution boundary (`*.application.ts`, `*.http.ts`, `*.browser.ts`).
Every scenario selects exactly one execution level. Shared support owns fixtures and resources, never
business policy. Application steps call production modules. HTTP steps inspect real responses. Browser
steps use accessible roles and actual keyboard input.

See [capability commands and evidence](../../../features/README.md) and the
[scenario migration ledger](../../../features/TRACEABILITY.md).

The World is constructed fresh for each scenario; hooks acquire only tagged dependencies and clean up
independent resources even after a failure. Tests never start/stop Compose, flush Redis, synthesize a
successful authentication outcome, or claim test-owned collections establish durable persistence.
