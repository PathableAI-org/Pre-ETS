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

Initiation scenarios use the real tracked Keycloak realm; start it and wait for realm discovery before running
success scenarios. Each world supplies its own `OIDC_CALLBACK_ORIGINS_JSON` and `OIDC_ALLOW_INSECURE_LOOPBACK`
settings. Registered tenant `.localhost:3000` callbacks are independent of logical `example.test` request Hosts
and the random Next transport port. No callback listener is required because the evidence stops at provider arrival.

`authentication.ts` owns provider destination/protocol and public sign-in observations. Raw HTTP stays unfollowed:
assert root delegation first, then explicitly request `/auth/login` for tenant/provider status. Generic status
assertions always inspect the actual most recent response. `support/browser.ts` owns a scoped browser proxy;
each application redirect reaches the owned process with its logical Host, while external requests keep their
real destination. Native Chromium redirects bypass Playwright route interception, so no `route.fetch` redirect
following is used. Missing-page comparison and provider arrival share this transport. The harness regression
requires Chromium and local loopback sockets. None of this proves production ingress or callback acceptance.
