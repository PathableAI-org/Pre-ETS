# Requirements BDD step definitions

Follow [Requirements-backed BDD](../../../docs/engineering/testing/requirements-bdd.md) before authoring or
reviewing steps and support. Inspect the referenced main-branch requirements and the scenario's evidence slice.
Step implementations and shared helpers must establish that outcome without adding incidental product assertions.
Feature-level `@partial` limits evidence scope; it does not permit pending or failing steps.

Steps interact with the owned Next.js process over HTTP and in a real Chromium browser. Browser steps establish
missing-page presentation, provider arrival and callback delivery, and the session journeys: cross-tab expiration,
history protection, and recovery after expiry. They must not open Redis clients, session stores, or mock identity
providers. Redis is observed only through application outcomes. Browser requests preserve the logical Host header
while routing to the owned loopback process, so no step establishes infrastructure ingress behavior.

Shared support under `tests/bdd/support/` owns temporary tenant directories, spawning/stopping the
frontend, recording the last HTTP response, the scoped browser transport, and the browser helpers in
`support/browser.ts`. Product assertions belong in steps, not in setup hooks.

## Step ownership

| File                      | Owns                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `http.ts`                 | Generic requests and responses                                                                          |
| `tenant.ts`               | Tenant configuration setup and tenant-specific observations                                             |
| `presentation.ts`         | Rendered missing-page content after navigation                                                          |
| `authentication.ts`       | Provider destination/protocol, callback delivery, and public sign-in observations                       |
| `session-coordination.ts` | Raw in-page activity communications sent without a browser                                              |
| `expiration.ts`           | Idle expiration across named tabs: concealment, the expiration modal, resumed tabs, logout, and history |
| `expired-recovery.ts`     | Recovery from an expired or removed session: recovery documents, form submissions, and second tabs      |
| `fresh-recovery.ts`       | Fresh authentication with a provider single sign-on session: logout, history, and session replacement   |

Add a step to the file that owns its journey. A browser journey that keeps state across steps (its browser, named
tabs or contexts, observed traffic) keeps it in a module-level `WeakMap` keyed by the world and closes its browser
in an `After` hook in the same file, after deleting the world's entry. The shared `After` hook in
`support/hooks.ts` then stops the site and removes fixtures. Steps in another file reach that state only through
the owning file's steps, never by importing it.

## Controlled browser time

Expiration and recovery journeys wait in real time for the server's idle deadline; the server clock, the session
store, and application responses are never controlled. Steps may control only the page's clock through
Playwright, and only to arrange a condition the referenced requirement or its approved verification plan names:
a suspended tab returning, a device waking, or a skewed or corrected client clock.

- `suspendTimers.beforeLoad` installs the clock before the page loads; `suspendTimers.afterLoad` pauses it right
  after, so no page timer fires while its clock stands still. The page still receives events.
- `resumeAt` emulates a suspended tab returning: it sets the page clock without running timers, reports the page
  hidden and then visible, answers whether the protected control was hidden in that same task, and only then lets
  timers run at real speed. This is the approved "emulated freeze"; it does not observe paint before script runs.

Use these helpers rather than calling `page.clock` to install or pause a clock directly. A step that claims a
timer-driven outcome, such as concealment at the deadline in an active tab, must leave that tab's timers running at
real speed. Paused or advanced time may arrange only the condition the scenario names; reviewers should flag
controlled time that substitutes for the outcome under test, since it could hide a real timer defect. Assertions
observe application outcomes: what the page shows or hides, documents served or restored, status answers, and login
traffic.

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
Missing-page comparison, provider arrival, callback delivery, and the session journeys share this transport. Scenarios that use it
require Chromium, local loopback sockets, Redis, and Keycloak. None of this proves production ingress behavior.
