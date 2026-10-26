# Session state

The frontend owns temporary session state; the backend owns durable domain records.
See [domain persistence](./domain-persistence.md) for that boundary and
[authentication](./authentication.md) for the current initiation flow.

`packages/frontend-services/src/session.ts` exposes the public `SessionService` with these
operations:

- `establish(input)` creates one tenant-bound session record and returns its opaque
  reference plus the same consumer-visible state: issuer/subject identity, the exact
  tenant alias, the authoritative initial idle deadline, and the effective warning policy.
- `read({ reference })` recovers that state for a usable, strictly-unexpired record and
  returns fieldless `NoUsableSession` otherwise. A storage/transport/encode/decode failure
  and exhausted random-reference collisions return the typed `SessionServiceUnavailable`.
- `readForTenant({ reference, tenantAlias })` delegates classification to `read`. It
  returns that same usable session only when the stored tenant equals the supplied
  branded alias. A different alias fails with fieldless `SessionTenantMismatch`.
  `hasSession()` is removed.

The record lives in Redis under `SESSION_KEY_PREFIX` (default `preets:session:v1`), addressed
by SHA-256 of the opaque reference, written with `SET ... NX PX` so the TTL is the remaining
idle budget. The browser holds only the reference in a host-only `pathable-session` cookie
(`HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`, the existing loopback `Secure` rule) and
never receives identity, policy, tokens, or the record itself.

Session establishment runs after the callback has validated a trusted identity **and** that
authentication event has been confirmed fresh. The freshness comparison and clock tolerance
are not chosen here ([#158](https://github.com/PathableAI-org/Pre-ETS/issues/158)), so the
current callback treats a trusted but unconfirmed identity as the safe return and creates no
session or cookie. Confirmed-fresh establishment, the shared-reader capability, and the
fail-closed outcome vocabulary are implemented but live establishment is blocked on that
unresolved policy.

`/` resolves the tenant under the configured mode and then reads the session. A resolved
tenant with no usable session redirects to `/auth/login`. A host-mode invalid host or
other tenant failure on `/` remains that tenant 404 or 500. Static mode stays independent
of Host. A usable session is admitted only when its tenant equals that resolved tenant.
[#154](https://github.com/PathableAI-org/Pre-ETS/issues/154) owns comprehensive application
integration. Later lifecycle slices retain their published ownership: renewal and
current-policy adoption ([#220](https://github.com/PathableAI-org/Pre-ETS/issues/220)),
explicit invalidation and recovery ([#221](https://github.com/PathableAI-org/Pre-ETS/issues/221)),
and warning/presentation UI ([#155](https://github.com/PathableAI-org/Pre-ETS/issues/155)–#158).

## Reference enforcement inventory

This inventory records the bounded [#219](https://github.com/PathableAI-org/Pre-ETS/issues/219)
reference. It is not evidence that every listed path behaves as described.

- Delivered protected consumers: `GET /` and `runReferenceOperation`.
- Outcomes: a matching session returns 200 with the unchanged idle deadline and warning
  policy; absence on the page is 307 to `/auth/login`; a tenant mismatch is 403; a session
  service failure fails closed and stays distinct from login, 403, and success.
- Public exceptions: `/auth/callback`, `/login-unavailable`, `/auth/login`, and `/_test/*`,
  including `GET /_test/tenant-config`.
- Reusable fixtures: the OIDC harness, distributed Redis tests, two-process routing, and
  receipt-count observation.
- Unexercised categories: other pages, Route Handlers, Server Actions, direct and new
  resources, final forbidden and recovery UI, action HTTP 401, history and freshness, and
  renewal, invalidation, and outage recovery.

Independent session clients read identical state from the same record without creator
affinity. This is not independently running protected HTTP recognition, and it does not
replace the backend's durable domain records. Effective timeout/warning derivation remains
owned by the tenant service; see [tenant policy](./multi-tenancy.md#idle-timeout-and-warning-policy).
