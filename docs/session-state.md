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
  returns fieldless `NoUsableSession` otherwise. A storage/transport/encode/decode failure,
  a malformed store reply, and exhausted random-reference collisions return the typed
  `SessionServiceUnavailable`. Only a definite `SET NX` "already exists" reply retries
  establishment with a new reference; any other unexpected creation reply fails without retry.
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
Later lifecycle slices retain their published ownership: renewal and
current-policy adoption ([#220](https://github.com/PathableAI-org/Pre-ETS/issues/220)),
explicit invalidation and recovery ([#221](https://github.com/PathableAI-org/Pre-ETS/issues/221)),
and warning/presentation UI ([#155](https://github.com/PathableAI-org/Pre-ETS/issues/155)–#158).

## Default entry-point protection

`createProtectionProxy` in `frontend-services` is the Next proxy for every path except
`/_next/static/**`, `/_next/webpack-hmr`, and `/__nextjs*`
([#154](https://github.com/PathableAI-org/Pre-ETS/issues/154)). Every page, Route Handler,
and Server Action, including resources added later and absent paths, is protected unless it
is in the closed public designation: `/_test` or a path under `/_test/` without an encoded
`/`, `\`, or `.`, for every method; or `GET`/`HEAD` of exactly `/auth/callback`,
`/auth/login`, or `/login-unavailable`. A Server Action candidate is never public: a request
with a `next-action` header (any method), or a `POST` whose `content-type` is
`multipart/form-data` or `application/x-www-form-urlencoded` (Next's own possible-action
test). Every other method on the three exact paths is protected. Public requests read no
session state and each resolves its own tenant.

A protected request is a **document entry** when it is a `GET`/`HEAD` without `next-action`
whose Fetch Metadata is a navigation (`sec-fetch-mode: navigate`, or without a mode,
`sec-fetch-dest: document`). Every other protected request, including RSC fetches,
prefetches, `router.refresh()`, subresources such as `/favicon.ico` and `/_next/image`,
Server Action calls, and requests without Fetch Metadata, is an **application request**.
Next strips Flight headers before the proxy, so they are not used.

The gate resolves the request tenant first, then reads the session for that tenant. Every
response it returns carries `Cache-Control: private, no-store`; its denials have empty
bodies and set no cookie.

| Outcome (in order)                | Document entry                                   | Application request |
| --------------------------------- | ------------------------------------------------ | ------------------- |
| Runtime not started               | 503                                              | 503                 |
| Tenant failure                    | Tenant 404 page or 500                           | Same                |
| Session state undeterminable      | 503                                              | 503                 |
| No usable session                 | 307 to same-origin `/auth/login`                 | 401                 |
| Session for another tenant        | 403 forbidden page (rewrite to `/access-denied`) | 403                 |
| Usable session for request tenant | Passes through                                   | Passes through      |

A defect rejects the proxy promise (Next answers 500); nothing passes through on failure.
A document entry renews a usable session as `deliberate-page-request`, and a `POST` with
`next-action` as `deliberate-form-submission`, through `refreshForTenant` with the tenant's
effective policy; the gate then re-issues `pathable-session` with `Max-Age` equal to the
remaining idle seconds. Every other request only reads. The gate never creates a session.

`/` and `runReferenceOperation` keep their own `readSessionRequest` check. The reference
consumer shows a rejected action invocation as "The operation was not performed." without
retrying. The root layout renders a history guard that reloads a page restored from the
back-forward cache and refreshes the route on `popstate`, so history traversal reaches the
gate.

Inventory: protected pages `/` and `/access-denied`; protected Server Action
`runReferenceOperation`; no protected Route Handler; public resources as designated above.

Known gaps: `/_next/static/**` is publicly served and `/favicon.ico`, metadata routes, and
`/_next/image` answer 401 without a session until the public-asset decision is made.
Expired- or missing-session recovery content and Server Action 401 recovery belong to
[#157](https://github.com/PathableAI-org/Pre-ETS/issues/157). The callback cannot establish a
session until freshness confirmation exists
([#158](https://github.com/PathableAI-org/Pre-ETS/issues/158)), so admission of a real session
is not yet observable in the running application.

Independent session clients read identical state from the same record without creator
affinity. This is not independently running protected HTTP recognition, and it does not
replace the backend's durable domain records. Effective timeout/warning derivation remains
owned by the tenant service; see [tenant policy](./multi-tenancy.md#idle-timeout-and-warning-policy).
