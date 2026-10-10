# Requirements BDD step definitions

Follow [Requirements-backed BDD](../../../docs/engineering/testing/requirements-bdd.md) before authoring or
reviewing steps and support. Inspect the referenced main-branch requirements and the scenario's evidence slice.
Step implementations and shared helpers must establish that outcome without adding incidental product assertions.
Feature-level `@partial` limits evidence scope; it does not permit pending or failing steps.

Steps interact with the owned Next.js process over HTTP and a real Chromium browser for
missing-page presentation. They must not open Redis clients, session stores, or mock identity
providers. `http.ts` owns generic requests and responses, and `tenant.ts` owns tenant
configuration setup and tenant-specific observations. `presentation.ts` compares rendered missing-page
content after navigation; browser requests preserve the logical Host header while routing to the
owned loopback process, so this does not establish infrastructure ingress behavior.

Shared support under `tests/bdd/support/` owns temporary tenant directories, spawning/stopping the
frontend, and recording the last HTTP response. Product assertions belong in steps, not in setup
hooks.

See [requirements BDD commands](../../../features/README.md). Historical Spec Kit dispositions remain
in the [migration ledger](../../../features/TRACEABILITY.md).
