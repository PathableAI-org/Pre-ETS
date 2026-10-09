# Requirements BDD step definitions

Steps interact only with the owned Next.js process over HTTP (and, when needed later, a real
browser against that process). They must not open Redis clients, session stores, or mock identity
providers. `http.ts` owns generic requests and responses, and `tenant.ts` owns tenant
configuration setup and tenant-specific observations.

Shared support under `tests/bdd/support/` owns temporary tenant directories, spawning/stopping the
frontend, and recording the last HTTP response. Product assertions belong in steps, not in setup
hooks.

See [requirements BDD commands](../../../features/README.md). Historical Spec Kit dispositions remain
in the [migration ledger](../../../features/TRACEABILITY.md).
