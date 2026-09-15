# Session Setup Contract

Status: proposed implementation contract. No public session API or new UI is added.

## Participating request

The current application path `/`, including its server-rendered/RSC handling, enters `src/proxy.ts`.
Assets, image optimization, framework resources, and unrelated paths do not create sessions. Test actual
Next behavior as well as matcher configuration; future tenant routes must explicitly join this boundary.

Inputs are the browser cookie and, in host mode, the original trusted `Host`. Ignore `X-Forwarded-Host`,
query-string tenants, and browser-provided context headers. Environment-specific tenant selection stays
in the existing tenant owner: host mode binds `Host`; development static mode resolves
`TENANT_LOCAL_CONFIG_JSON` without Host binding; production always uses host mode. Production never
imports/reads development static configuration.

### Ordered internal interface

`setupSession(request)` owns this sequence and returns either a ready context plus optional new cookie,
or a typed terminal outcome. It receives narrow cookie, store, clock/id-generation, and tenant operations
for direct behavioral tests; these are function seams, not a dependency-injection framework. Session
configuration is parsed lazily on first use, not at module import.

1. Inspect the cookie. Verify signature/claims/expiry before using its id for a single Redis lookup.
2. Await any lookup. Do not resolve tenant configuration before it completes.
3. Validate the current tenant through the mode-aware tenant owner (Host binding or static local record).
4. Accept the candidate only when cookie tenant = stored tenant = validated tenant and expiry agrees.
5. Otherwise generate a fresh unpredictable id and persist the minimal record with atomic expiry, only
   when `expiresAt` remains safely later than setup completion relative to the store timeout.
6. Return ready state only after persistence succeeds. The response adapter sets a cookie for that
   new state and supplies the same bounded session fields to downstream rendering of this first request.

Cookie creation/signing should be prepared before the store write where possible; no signature failure
may cause a successful response. Returning visitors cause no write, cookie renewal, or expiry extension.
All session state remains anonymous and temporary.

## HTTP outcomes

| Condition                                        | HTTP outcome                                                              | Session effects                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| Valid tenant, no usable session                  | Existing normal tenant page                                               | Persist fresh record first, then exactly one new cookie. |
| Fully matching live session                      | Existing normal tenant page                                               | Same id/tenant/expiry; no replacement or renewal.        |
| Invalid/unknown tenant with available store      | 403, `Access denied.`, no redirect                                        | No accepted context, write, or session cookie.           |
| Selected tenant/session configuration invalid    | 500; production generic; static-dev retains current local-config guidance | No successful setup or session cookie.                   |
| Store connection, read, or write failure/timeout | 503, `Service unavailable.`, no normal tenant content                     | No new cookie and no fallback session.                   |
| Asset/framework request                          | Existing resource response                                                | No session lookup/create solely for that resource.       |

All participating responses, including 403/500/503, carry `Cache-Control: private, no-store`. Never expose
internal request context as response headers. An outage during candidate lookup may return 503 before
an invalid host is checked, as expressly permitted by the spec. Missing cookie requires no store read;
an invalid host discovered before any creation write still returns 403.

Compatibility: revise `specs/001-tenant-resolution/contracts/tenant-context.md` so participating routes
may terminate refusal/configuration failures in Proxy while preserving the same visible outcomes and
static-mode guidance. Keep regression coverage for both layers during the transition.

## Same-request trust boundary

Reserved session header: `x-pathable-session-context`. Proxy removes any incoming value and serializes
only bounded `{ sessionId, tenantId, expiresAt }` into upstream request headers—never `tenantConfig` /
Display Name. Also remove every caller-supplied `x-preets-tenant-*` header and overwrite only names that
remain part of the approved handoff after the tenant-contract update. Use
`NextResponse.next({ request: { headers } })`; top-level response headers are not equivalent.

Server Components obtain session context through a server-only read accessor. `AppLayout` (renamed from
`TenantLayout`) is the application-wide gate: it requires validated session context and performs the
conditional tenant/config consumption for rendering. Configuration is loaded via the tenant source from
`tenantId`, not from the header. No response cookie reflection, global mutable request state, or
downstream fallback setup is allowed.

The accessor's caller must be on a covered route. Integration and acceptance coverage must send forged
`x-pathable-session-context` and forged legacy `x-preets-tenant-*` headers with absent, invalid, and
foreign cookies and prove they cannot skip tenant checks or choose session ids. Name an explicit
`@http`/`@contract` (and, where needed, automated integration) case in the delivery slice—not only a
manual quickstart bullet. Test first-request delivery and repeated accessor use in the real framework
without shipping a public diagnostic endpoint. Use a test-only rendering fixture if necessary, excluded
from application routes.

## Store interface

- `read(id)` returns a validated record or missing/unusable; rejects on transport/service failure.
- `create(id, record)` uses `SET NX EXAT` and returns created/collision; rejects on transport failure.
- Do not read/write a record for an invalid id, mutate a mismatched tenant, or expose raw Redis data.
- Default operation deadline is 2 seconds, including connection wait, capped to the Node timer-safe
  range. Disable offline command queuing and do not let timed-out promises later emit a cookie or permit
  rendering. Recover the connection for subsequent requests; a stored orphan from an ambiguous write
  expires normally.
- Share connections only; request results and accepted sessions are not global caches.
- Key namespace comes from production default or `SESSION_KEY_PREFIX` / isolated Redis DB for fixtures.

## Traceability and proof

| Requirements / outcomes | Required proof                                                                                                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001/002, SC-002      | Ordered setup test observes cookie inspection/read completion before tenant operation; mode-aware static and host paths; existing tenant policy and forged-host/header rejection tests remain green after the tenant-contract update.                       |
| FR-003/004/012, SC-001  | Failed write emits no cookie; same-request SSR receives newly created id; repeated access creates once; mismatch leaves old record byte-for-byte unchanged; AppLayout consumes context without re-setup.                                                    |
| FR-005, SC-003          | Real Redis record and browser reference survive stop/start of frontend with stable settings, running Redis, and a preserved cookie jar (or capture/replay). Backend has no new dependency or access path.                                                   |
| FR-006                  | Raw response cookie flags and strict signed claims; browser cannot read HttpOnly cookie, host-only cookie is not sent to another tenant. Production Secure verified over HTTPS or raw HTTP response headers without pretending an HTTP browser retained it. |
| FR-007                  | Clock-controlled exact cookie/record expiry; Redis `EXAT` uses the same application-clock seconds; malformed/evicted/missing record replacement; TTL minimum vs store timeout prevents issuing expired cookies.                                             |
| FR-008, SC-004          | Read failure and write failure independently cause bounded 503; recovery reuses an intact live record or creates fresh when missing.                                                                                                                        |
| FR-009/010, SC-005      | Compose renders one pinned official Redis service on loopback; docs updated in the Compose slice; documented clean-checkout startup, connection, verification, stop/start and shutdown succeed; CI provisions Redis for `test:bdd`.                         |
| FR-011                  | Existing tenant regression scenarios, static development mode on localhost, production host restrictions, Display Name outcome, and asset exclusion remain intact.                                                                                          |

Complete existing `@session-setup` step stubs, retaining their requirement tags. Add `@browser` tags (or
an explicit Playwright partition) for lifecycle cases that require a real cookie jar. Internal
ordering/store proof belongs below the browser layer. Browser first visit/reload and cross-host
navigation must exercise a real server and actual cookie jar; page text alone is not session continuity
evidence. Build-without-secrets and runtime-missing-config 500 coverage are required contract proofs.
