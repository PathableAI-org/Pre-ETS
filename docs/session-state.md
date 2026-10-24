# Session state

The frontend owns temporary session state; the backend owns durable domain records.
See [domain persistence](./domain-persistence.md) for that boundary and
[authentication](./authentication.md) for the current initiation flow.

`packages/frontend/src/lib/session.ts` exposes the public `SessionService` with three
operations:

- `establish(input)` creates one tenant-bound session record and returns its opaque
  reference plus the same consumer-visible state: issuer/subject identity, the exact
  tenant alias, the authoritative initial idle deadline, and the effective warning policy.
- `read({ reference })` recovers that state for a usable, strictly-unexpired record and
  returns fieldless `NoUsableSession` otherwise. A storage/transport/encode/decode failure
  and exhausted random-reference collisions return the typed `SessionServiceUnavailable`.
- `hasSession()` remains `false` for the current no-input root consumer; it does not read
  cookies, Redis, or request-tenant identity, and does not turn presence into authorization.

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

The root consumer uses absence to redirect to `/auth/login` before tenant lookup. A usable
session must still be checked against the independently resolved request-tenant identity
before protected access; presence alone cannot authorize access.
[#219](https://github.com/PathableAI-org/Pre-ETS/issues/219) owns request-reference and
protected-entry consumption, [#154](https://github.com/PathableAI-org/Pre-ETS/issues/154)
owns comprehensive application integration. Later lifecycle slices retain their published
ownership: renewal and current-policy adoption ([#220](https://github.com/PathableAI-org/Pre-ETS/issues/220)),
explicit invalidation and recovery ([#221](https://github.com/PathableAI-org/Pre-ETS/issues/221)),
and warning/presentation UI ([#155](https://github.com/PathableAI-org/Pre-ETS/issues/155)–#158).

Independent session clients read identical state from the same record without creator
affinity. This is not independently running protected HTTP recognition, and it does not
replace the backend's durable domain records. Effective timeout/warning derivation remains
owned by the tenant service; see [tenant policy](./multi-tenancy.md#idle-timeout-and-warning-policy).
