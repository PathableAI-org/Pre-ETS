# Requirements BDD step definitions

Follow [Requirements-backed BDD](../../../docs/engineering/testing/requirements-bdd.md) before authoring or
reviewing steps and support. Inspect the referenced main-branch requirements and the scenario's evidence slice.
Step implementations and shared helpers must establish that outcome without adding incidental product assertions.
Feature-level `@partial` limits evidence scope; it does not permit pending or failing steps.

Steps interact with the owned Next.js process over HTTP and a real Chromium browser for
missing-page presentation. They must not open Redis clients, session stores, or mock identity
providers. Redis is observed only through application outcomes. `http.ts` owns generic requests and responses, and `tenant.ts` owns tenant
configuration setup and tenant-specific observations. `presentation.ts` compares rendered missing-page
content after navigation; browser requests preserve the logical Host header while routing to the
owned loopback process, so this does not establish infrastructure ingress behavior.

Structured `/_test/*` responses are application outcomes when the requirements BDD guide authorizes them as a sparse
evidence seam. Request them through the same owned HTTP boundary; do not import their implementation or use them to
reach a backing store. Assert only the minimal semantic fields needed by the tagged requirement, and keep the feature's
description explicit that a diagnostic observation does not establish the ordinary user workflow or production ingress
blocking. Reuse an existing diagnostic where it owns the required fact. Adding a new endpoint is product work, not step
scaffolding, and needs the guide's authority, data-minimization, no-store, and side-effect review first.

Shared support under `tests/bdd/support/` owns temporary tenant directories, spawning/stopping the
frontend, and recording the last HTTP response. Product assertions belong in steps, not in setup
hooks.

See [requirements BDD commands](../../../features/README.md). Historical Spec Kit dispositions remain
in the [migration ledger](../../../features/TRACEABILITY.md).

Initiation and successful callback scenarios use the real tracked Keycloak realm; start Redis and Keycloak and wait
for both before running them. Each world supplies its own `OIDC_CALLBACK_ORIGINS_JSON`,
`OIDC_ALLOW_INSECURE_LOOPBACK`, and `OIDC_TX_KEY_PREFIX`. Registered tenant `.localhost:3000` callbacks are
independent of random Next transport ports. Callback scenarios run two independently composed production Next
processes behind the same logical authority: provider departure uses instance A and `/auth/callback` uses instance B.
The host-only, callback-path cookie crosses those instances through the browser without being sent to another tenant.

`authentication.ts` owns provider destination/protocol and public sign-in observations. Raw HTTP stays unfollowed:
assert root delegation first, then explicitly request `/auth/login` for tenant/provider status. Generic status
assertions always inspect the actual most recent response. `support/browser.ts` owns a scoped browser proxy;
each application redirect reaches the owned process with its logical Host, while external requests keep their
real destination. The proxy can capture a real provider return before delivery for wrong-state, cross-tenant, race,
expiry, and replay requests; steps retain callback URLs and cookies only for the scenario and never inspect Redis.
Missing-page comparison, provider arrival, and callback delivery share this transport. The harness regression
requires Chromium, local loopback sockets, Redis, and Keycloak. None of this proves production ingress behavior.
