# Session state

The frontend owns temporary session state; the backend owns durable domain records.
See [domain persistence](./domain-persistence.md) for that boundary and
[authentication](./authentication.md) for the current initiation flow.

`packages/frontend/src/lib/session.ts` exposes the readonly
`SessionService.hasSession(): Effect<boolean>` capability. Its production implementation
always reports false for this increment. It inspects no cookie, store or request tenant
and creates no identity. The root consumer uses absence to redirect to `/auth/login`
before tenant lookup. The enclosing layout no longer reads the tenant eagerly.
There is no supported positive-session rendering path.

The initiation request generates PKCE/state/nonce for the selected tenant and discards
its server-local verifier after building the redirect. It writes no application cookie,
Redis key, transaction record or process-memory substitute. The callback remains a
denying fallback even when a provider returns a code.

[#217](https://github.com/PathableAI-org/Pre-ETS/issues/217) owns both persistence of
correlation/verifier context before redirect and callback recovery/consumption.
[#218](https://github.com/PathableAI-org/Pre-ETS/issues/218) owns authenticated session
establishment. Later service lifecycle and enforcement slices retain their published
ownership; #154 owns comprehensive application integration and evidence. A future
usable session must be checked against independently resolved request-tenant identity
before protected access. Presence alone cannot authorize access.

Redis remains available in Compose for downstream work. Historical cookie formats,
Redis records, idle rollout mechanics and recovery UI are not current implementation
evidence. Effective timeout/warning derivation remains available from the tenant
service for the future session consumers; see [tenant policy](./multi-tenancy.md#idle-timeout-and-warning-policy).
