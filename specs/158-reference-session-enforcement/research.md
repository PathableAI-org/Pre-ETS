# Research: Reference Session Enforcement

**Feature**: `158-reference-session-enforcement`

**Date**: 2026-10-26

## Decision 1: Extend the existing session owner with tenant-bound reads

**Decision**: Add `SessionService.readForTenant(input)` and a fieldless
`SessionTenantMismatch` expected error to `packages/frontend-services/src/session.ts`. Preserve `read` for the
established session-construction and independent-client consumers, and remove the temporary `hasSession()` operation,
its `entry.ts`/package export, and its root/test consumers after the reference adapter replaces them.

**Rationale**: The approved #218 plan made `SessionService` the public owner of session establishment/read semantics and
explicitly left `hasSession()` false until #219 supplied an independently tenant-bound read. The new operation consumes
the existing `UsableSession`, `NoUsableSession`, and `SessionServiceUnavailable` vocabulary without exposing the Redis
adapter or introducing a second owner. A matching read returns the existing `UsableSession` unchanged, preserving its
identity, idle deadline, and warning policy. A mismatch error carries no tenant or identity fields.

**Alternatives considered**:

- A new `SessionEnforcementService` and Layer: rejected because two current consumers can use the existing session
  owner, and another service would add runtime composition and a second error vocabulary without a distinct resource or
  lifecycle.
- A standalone `enforceSession` function requiring `SessionService`: viable but rejected because the established
  session parent already owns the read outcome and the #218 contract explicitly deferred this exact extension to #219.
- Tenant comparison in each page/action: rejected because #154 needs one reusable, framework-independent contract and
  duplicated comparisons could drift.

## Decision 2: Preserve static selection, then normalize only a failed host-mode candidate

**Decision**: The exported request adapter in `packages/frontend-services/src/session-request.ts` receives the raw
request Host and first calls `TenantConfigService.getAlias(rawHost)`. Static mode therefore selects its configured
alias for every Host, including empty, malformed, unknown, and otherwise unresolvable values, as required by
PREETS-TENANT-003 AC3 and PREETS-TENANT-005 AC5. A successful direct selection proceeds to `getConfigFromAlias` without
parsing the Host.

When direct selection fails, the adapter applies the same strict acceptance rules as the unexported
`parseRequestHost` in `packages/frontend-services/src/authentication.ts`: reject an empty value, surrounding whitespace,
`/`, `?`, `#`, `@`, or `\`, an invalid `opaque://` URL, an empty hostname, or a non-empty path, query, or fragment. A
valid portful host contributes only its lowercased hostname to a second `getAlias` call. If normalization is invalid or
the retry still fails, the adapter preserves the original direct-selection failure through `httpErrorPage`; for an
invalid or unknown host in host mode that failure is the tenant 404, while an invalid static selector retains its own
configuration-failure mapping. The adapter does not redirect to `/auth/login` or read the session. After alias
selection, it calls `getConfigFromAlias` and only then calls `readForTenant({ reference, tenantAlias })`.

`alias.localhost:3000` is the required host-mode adapter example: the direct selection fails on the retained port and
the fallback calls `getAlias("alias.localhost")`. `alias.localhost/extra` remains a host-mode 404 after direct selection
and normalization fail, but selects the configured static alias in static mode. `127.0.0.1` and a bare base host are
parseable fallback inputs in host mode and retain `getAlias`'s existing pattern failure.

**Rationale**: Installed `getAlias` rejects a retained port in host mode
(`packages/frontend-services/tests/unit/tenant-alias.test.ts`). Login and callback avoid that failure because
`parseRequestHost` returns the lowercase hostname before authentication calls `getAlias`. Running OIDC evidence uses
hosts such as `springfield.localhost:3000`, so the protected adapter needs the same host-mode fallback. Pre-parsing
every Host would instead violate static selection by rejecting values that static mode is required to ignore.

This resolves the strategy conflict without changing the service. `docs/multi-tenancy.md` still says a retained port
fails direct host-mode alias resolution, the diagnostic adapter passes the incoming Host header to the service, and
consumers do not change `getAlias` or `getConfigFromHost`. Authentication still normalizes before its only `getAlias`
call. The protected adapter instead uses direct selection as the resolution-mode discriminator and normalizes only
after that selection fails. `GET /_test/tenant-config` keeps its existing raw-host contract.

`/_test/onsite` calls the shared `requireTenantConfig()` helper and must keep its current outcomes: static mode at
`127.0.0.1` stays 200, host mode at `springfield.example.test` stays 200, and `unknown.example.test` stays 404. The
onsite page does not become a session consumer.

The normalization is a private pure function under the public `session-request.ts` package adapter. It is not an
Effect service, a public parser, or an export of authentication's `parseRequestHost`. `TenantNotFound` stays
module-private; the adapter preserves service failures rather than constructing one.

**Documentation the implementation pass replaces**: This planning pass does not edit product docs. Implementation
replaces these superseded sentences:

- `docs/authentication.md`: "The root uses `SessionService.hasSession()` before request-tenant lookup."
- `docs/authentication.md`: "Root's separate first hop remains 307 even when tenant lookup will fail."
- `docs/session-state.md`: "`hasSession()` remains `false` for the current no-input root consumer; it does not read
  cookies, Redis, or request-tenant identity, and does not turn presence into authorization."
- `docs/session-state.md`: "The root consumer uses absence to redirect to `/auth/login` before tenant lookup."

The replacement states that the reference page resolves the tenant under the configured mode and then reads the
session. A resolved tenant with no usable session redirects to `/auth/login`. A host-mode invalid host or other tenant
failure on `/` is that tenant 404 or 500; static mode remains independent of Host. `hasSession()` is removed.

**Alternatives considered**:

- Use only the raw `Host` result: rejected because host mode rejects retained ports and the local evidence hosts include
  a port. The raw attempt remains necessary to preserve static-mode Host independence.
- Normalize before the first `getAlias` call: rejected because a malformed Host must not prevent static selection.
- Teach `getAlias` or `getConfigFromHost` to strip ports: rejected. Those operations and the diagnostic route keep the
  raw-host contract.
- Pass the request host into `SessionService`: rejected because it would move tenant/configuration ownership into the
  session module.
- Derive the request tenant from `UsableSession.tenantAlias`: rejected because it violates independent tenant
  resolution and enables cross-tenant substitution.
- Change `TenantConfigService.getConfigFromHost` to return a new public wrapper: rejected because the package request
  adapter can compose the existing `getAlias` and `getConfigFromAlias` operations without a public tenant-service
  change.

## Decision 3: Use `/` as the bounded protected reference page

**Decision**: Replace the current fail-closed root placeholder with the SSR-first reference consumer at `/`. The Next
page reads request state and calls the exported `@pathableai/pre-ets-frontend-services` request adapter before rendering
protected content. Effect workflows remain in `packages/frontend-services`; the page owns only presentation and Next
control flow.

**Rationale**: `/` is already the bounded entry used by the current session/OIDC evidence. Reusing it removes the
temporary `hasSession()` path and does not imply comprehensive application protection. Public callback, failure,
recovery, and `/_test` resources remain outside this `(app)` consumer.

**Alternatives considered**:

- Add a new `/protected-reference` route: rejected because it would retain the misleading root placeholder and add a
  second reference path without a separate requirement.
- Implement protection in `proxy.ts`: rejected because Proxy cannot stand in for page, Route Handler, and Server Action
  enforcement, and #154 owns default application-wide coverage.
- Protect the root layout: rejected because installed Next.js does not allow `forbidden()` in the root layout and the
  feature deliberately exercises one bounded page rather than every child route.

## Decision 4: Map framework outcomes at thin Next.js boundaries

**Decision**: The page and Server Action map public session outcomes as follows:

| Condition                   | Page mapping                                                                            | Server Action mapping                                        |
| --------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Tenant 404/500              | Existing `httpErrorPage` mapping                                                        | Same tenant-first failure; no effect                         |
| `NoUsableSession`           | `redirect("/auth/login")` after tenant success                                          | Safe denial state; no OIDC start and no effect               |
| `SessionTenantMismatch`     | Awaited `forbidden()` before streaming                                                  | `forbidden()` before the effect                              |
| `SessionServiceUnavailable` | Safe server failure, not login or admission                                             | Safe server failure, not a returned success/absence          |
| `UsableSession`             | Render identity and the exact stored deadline/warning policy plus the reference control | Perform one synthetic effect and return the protected result |

**Rationale**: Installed Next.js 16.4.3 documents `forbidden()` for Server Components and Server Functions when
`experimental.authInterrupts` is enabled, which this workspace already does. The installed action handler maps the
interrupt to HTTP 403, but the API is experimental, so running HTTP evidence remains required. `redirect()` and
`forbidden()` are framework control flow and must not be swallowed by catches. Every Server Action independently
re-resolves tenant and session state through the package adapter; it never trusts page-rendered props. Matching
admission hands the exact `idleDeadlineEpochMilliseconds` and `warningLeadMinutes` values through unchanged for V-010.

**Alternatives considered**:

- Convert every denial into a returned action state: rejected because mismatch must retain actual HTTP 403 semantics.
- Redirect a session-service failure into login: rejected because it would collapse failure into absence and could
  authorize replacement authentication.
- Pass the admitted session into the action as form data or a closure: rejected because the action is an independent
  POST boundary and all browser-supplied/captured authority must be revalidated.

## Decision 5: Use a minimal client island for perceivable action state

**Decision**: Keep the page and identity/policy presentation server-rendered. Add one Bulletproof feature entry at
`packages/frontend/src/features/session-reference.ts` owning private action-state and client-island children under
`src/features/session-reference/`. The client component contains an `@pathableai/react` `Form` and `Button` with React
`useActionState` for the returned success or no-session denial message. The app page passes the top-level Server Action
as a prop, so the feature does not import `src/app`. Announce the result through a polite status region and keep the
native submit semantics.

**Rationale**: React action state is the only browser-owned behavior needed. Installed `@pathableai/react` 0.3.0
forwards native form and button attributes; the control therefore has a real submit button, keyboard activation, and
the library's visible-focus styling. Runtime keyboard/focus evidence is still required because component choice alone
does not prove accessibility.

**Alternatives considered**:

- Move the page into a Client Component: rejected because tenant/session data loading and most presentation do not
  require browser state.
- Use a bare native button instead of the component library: rejected by the constitution and installed UI guidance.
- Return only an HTTP result with no page feedback: rejected because the feature requires a perceivable successful
  result and denial indication.

## Decision 6: Make the synthetic effect a short-lived response cookie

**Decision**: After successful action re-enforcement, set exactly one short-lived, host-only, `HttpOnly`, `SameSite=Lax`
reference-effect receipt cookie and separately return the protected result state. The cookie carries no identity,
tenant, session reference, provider value, or business data. Denied, mismatched, and failed actions set no receipt.

**Rationale**: The `Set-Cookie` mutation is independently observable from the returned action result, is safe synthetic
temporary UI state, and creates no backend workflow, Redis value API, durable business record, cross-instance
coordination rule, or public diagnostic. Tests and manual evidence record only the presence/count of the receipt, never
its value.

**Alternatives considered**:

- A process-local counter: rejected because Next.js route/action chunking and multiple processes make module-global
  state an unreliable observation, and a public inspection route would expand the exposed surface.
- A Redis counter: rejected because arbitrary application values and new persistence operations are outside scope.
- Logs or traces: rejected because observability is not this feature's effect and durable telemetry assertions are
  prohibited.

## Decision 7: Reuse existing session, Redis, OIDC, and BDD fixtures

**Decision**: Extend the existing `@effect/vitest` session service scenarios and real-Redis integration fixture under
`packages/frontend-services/tests`, the Next presentation tests under `packages/frontend/tests`,
`tests/support/oidc/harness.ts`, two-process Cucumber support, and issue-level `node:test` workflow. Add no second
browser runner, provider harness, Redis client, or application runtime. Running evidence must submit the rendered form
so it exercises the actual generated frontend Server Action rather than calling a TypeScript action function directly.

**Rationale**: Existing evidence already establishes cookie/reference decoding, missing/expired records, service
failure, and independent Redis clients. New module evidence should prove only tenant-bound admission. Running
application evidence owns framework status, protected-content/effect absence, public exceptions, and composed browser
behavior.

**Alternatives considered**:

- Fabricate session records in Cucumber support: rejected because requirements BDD must exercise application
  boundaries and must not open Redis/session internals.
- Duplicate missing/expired/store behavior in every guard test: rejected because it would repeat `SessionService.read`
  evidence without adding a new claim.
- Restore a separate Playwright Test suite: rejected because the repository already owns browser control through the
  shared harness and Cucumber.

## Decision 8: Treat successful real-login A-to-B evidence as conditionally incomplete

**Decision**: Design and implement the tenant-bound capability, real-Redis composition, reference page/action, denial
matrix, and reusable two-instance fixture now. Execute the successful real-provider A-to-B journey only when an
approved authentication-time comparison, clock tolerance, and provider-support policy can confirm freshness. Otherwise
record V-002 as incomplete and run the authorized refusal/denial evidence.

**Rationale**: The approved specification explicitly permits construction and non-success evidence while B6/#158
remains open. A redirect, signed `auth_time` presence, direct session fixture, or skipped scenario cannot substitute for
confirmed fresh authentication.

**Alternatives considered**:

- Treat the current trusted callback result as fresh: rejected because it would invent the open B6 policy.
- Block all planning and construction on B6: rejected because the approved contract explicitly allows bounded
  construction and fail-closed evidence to proceed.
- Claim A-to-B from the existing adapter-level independent Redis test: rejected because it does not exercise two
  running application instances or real authentication.

## Resolved unknowns

- **Effect API**: Installed Effect 4.0.5 declarations support the existing `Context.Service`, `Schema.TaggedError`,
  `Effect.fn`, `Layer`, and shared `ManagedRuntime` shapes. No unstable Effect module is needed.
- **Next.js API**: Installed Next.js 16.4.3 supports async `headers()`/`cookies()`, Server Actions, and experimental
  `forbidden()` in Server Components and Server Functions. Actual HTTP 403 evidence is retained because the interface
  is experimental.
- **UI API**: Installed `@pathableai/react` 0.3.0 exposes server-renderable `Page`, `Container`, `Stack`, `Heading`,
  `Text`, `Alert`, `Form`, and `Button`. Only `useActionState` requires the client boundary.
- **Storage**: No new durable storage or schema is introduced. Redis remains the established session store; the
  synthetic effect is an outgoing short-lived response cookie.
- **Request host**: The reference adapter tries unchanged raw selection first and applies the `parseRequestHost` rules
  only as host-mode fallback. Static mode therefore remains Host-independent without changing `getAlias`. No product
  clarification remains.
- **Product decisions**: No unresolved product decision blocks this plan. B6 remains a declared execution limitation,
  not an implementation assumption. No `NEEDS CLARIFICATION` remains.
