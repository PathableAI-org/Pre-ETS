# Reference Application Contract

This is a bounded Next.js reference contract for #219. It demonstrates reusable session enforcement at one protected
page and one Server Action. It is not a comprehensive route policy and does not protect future resources by default.

## Protected page: `GET /`

The root page is dynamically rendered and private/no-store. Before rendering protected content it:

1. reads `headers().get("host")` and the opaque `pathable-session` cookie in the Next app;
2. calls the exported `@pathableai/pre-ets-frontend-services` protected-request adapter with those raw values;
3. lets that adapter call `TenantConfigService.getAlias` first with the raw Host, preserving static-mode selection for
   every Host;
4. after a failed direct selection only, lets the adapter strictly normalize the Host and retry `getAlias` with the
   lowercase hostname (`alias.localhost:3000` calls `getAlias("alias.localhost")` on the fallback);
5. loads the selected alias with `getConfigFromAlias` and calls `SessionService.readForTenant`; and
6. maps the result before rendering starts.

`getAlias`, `getConfigFromHost`, and `GET /_test/tenant-config` keep the raw-host contract. The diagnostic route still
passes the incoming Host header to `getConfigFromHost`. Static mode ignores an empty, malformed, unknown, or otherwise
unresolvable Host and selects its configured alias. Host mode preserves the existing tenant 404 when direct selection
fails and fallback normalization is invalid or cannot select an alias. Adapter examples under
`packages/frontend-services/tests/unit/` establish both the portful host fallback and static Host independence.

| Condition                              | HTTP behavior                                          | Body/content behavior                                                                                                                                      | Cookie/effect behavior                                                                         |
| -------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Matching `UsableSession`               | `200`                                                  | Shows bounded protected identity/tenant, the exact authoritative deadline and warning policy returned by the session, and the protected-operation control. | Does not create/replace an application session.                                                |
| `NoUsableSession` after tenant success | `307` to same-origin `/auth/login`                     | No protected identity, content, action, or result is rendered first.                                                                                       | The page sets no application/correlation/effect cookie. Login owns later correlation behavior. |
| `SessionTenantMismatch`                | `403` through installed `forbidden()` before streaming | Bounded generic forbidden indication; no session tenant, identity, protected content, or effect.                                                           | No replacement login/session/effect.                                                           |
| `SessionServiceUnavailable`            | Server failure distinct from redirect/403/success      | Safe failure presentation; no raw cause, stored value, identity, or protected content.                                                                     | No replacement login/session/effect.                                                           |
| Invalid/unresolvable host in host mode | Existing tenant `404`                                  | No fallback tenant, no protected content, and no login redirect.                                                                                           | Direct selection fails; no session-based conversion or effect.                                 |
| Any Host with usable static selection  | Continues with the configured static alias             | Host syntax does not replace or reject the configured tenant.                                                                                              | Session admission still occurs only after selected-config loading.                             |
| Tenant alias/configuration failure     | Existing `404` or `500` mapping                        | No fallback tenant and no protected content.                                                                                                               | No session-based conversion or effect.                                                         |

The root `forbidden.tsx` copy is revised from login-configuration language to a bounded tenant/session forbidden
indication. It accepts no props and exposes no tenant or identity values.

The admitted page receives the same `UsableSession` object returned by `read`. It does not derive, default, or replace
`idleDeadlineEpochMilliseconds` or `warningLeadMinutes`; the rendered values are the application-boundary observation
for V-010.

## Protected Server Action

The reference page exposes one top-level Server Action through a native rendered form. Every invocation independently
calls the same package request adapter, repeating mode-aware tenant resolution, cookie reading, and `readForTenant`; it
does not trust rendered props, form fields, client state, or an earlier page admission. In host mode, a portful Host
such as `alias.localhost:3000` falls back to `getAlias("alias.localhost")`; in static mode, malformed Host syntax does
not prevent configured alias selection.

The public Bulletproof entry `packages/frontend/src/features/session-reference.ts` owns the private
`packages/frontend/src/features/session-reference/action-state.ts` child. That child has neither `"use server"` nor
`server-only`:

```ts
export type ReferenceActionState =
  | { readonly _tag: "Ready" }
  | { readonly _tag: "Denied"; readonly message: string }
  | { readonly _tag: "Succeeded"; readonly message: string }

export const initialReferenceActionState: ReferenceActionState = {
  _tag: "Ready"
}
```

`packages/frontend/src/app/(app)/actions.ts` has a file-level `"use server"` directive. `runReferenceOperation` is its
only runtime export:

```ts
export async function runReferenceOperation(
  previousState: ReferenceActionState,
  formData: FormData
): Promise<ReferenceActionState>
```

The private `features/session-reference/reference-operation.tsx` client island imports the state type and
`initialReferenceActionState` from its sibling module. The app page imports the feature's public entry and passes
`runReferenceOperation` to the island as an action prop. The feature never imports `src/app` and receives no tenant
config, cookie, session reference, or identity props.

`previousState` and `formData` convey no authority and are not used to select identity or tenant.

| Condition                              | Action behavior                                                | Protected result                                  | Synthetic effect                                                                      |
| -------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Matching `UsableSession`               | Returns `Succeeded` with bounded safe result text.             | Present and announced by the client island.       | Exactly one short-lived reference-effect receipt cookie is emitted after enforcement. |
| `NoUsableSession`                      | Returns `Denied`; does not start OIDC.                         | Absent; denial is announced.                      | None.                                                                                 |
| `SessionTenantMismatch`                | Invokes `forbidden()` before mutation.                         | Absent; actual action HTTP response is 403.       | None.                                                                                 |
| `SessionServiceUnavailable`            | Fails distinctly as a safe server error.                       | Absent.                                           | None.                                                                                 |
| Invalid/unresolvable host in host mode | Existing tenant `404` after direct selection/fallback failure. | Absent. No login redirect.                        | None.                                                                                 |
| Any Host with usable static selection  | Continues with the configured static alias and session check.  | Depends only on the tenant-bound session outcome. | Only a matching session may emit one receipt.                                         |
| Tenant 404/500                         | Preserves the existing tenant failure class.                   | Absent.                                           | None.                                                                                 |

The action's generated transport endpoint and identifiers are Next.js implementation details, not a public HTTP API.
Automated and manual application evidence must load the rendered page and submit its actual form through the browser,
thereby invoking the generated frontend Server Action. Directly importing/calling `runReferenceOperation` or inventing
a stable POST endpoint is framework-unit evidence only and cannot satisfy the application-boundary claim.

## Reference interaction

- The page remains a Server Component.
- One minimal client component under the Bulletproof feature owns `useActionState`, the form action binding, pending
  state, and polite result announcement. Its action arrives from the app page as a prop.
- The form uses installed `@pathableai/react` `Form` and a `Button type="submit"` with a meaningful visible label.
- The button remains reachable and operable by keyboard with visible focus.
- Pending state prevents accidental concurrent submission from the reference control; this does not define domain
  idempotency or retry semantics.
- Success and denial are perceivable without relying on color alone. Mismatch uses the bounded forbidden page.

## Synthetic receipt cookie

The reference effect receipt is temporary frontend UI state:

- host-only: no `Domain`;
- `HttpOnly`, `SameSite=Lax`, `Path=/`;
- `Secure` except for explicitly allowed loopback development;
- short-lived;
- contains no identity, tenant, session reference, provider value, protected result, or business data.

Only the emitted receipt count/presence is evidence. Its name/value are not an application integration contract and
must not be retained in screenshots, logs, or reports.

## Preserved public reference set

These existing categories remain outside session enforcement in this slice:

- `/auth/callback`;
- `/login-unavailable` and existing authentication failure/recovery presentation;
- `/auth/login` as the public tenant-dependent initiation boundary;
- existing `/_test/*` resources, including `GET /_test/tenant-config`.

Public status does not bypass tenant resolution, approved tenant 404/500 behavior, non-secret diagnostic content,
private/no-store response requirements, or separately owned production-ingress protection. An unauthenticated
`GET /_test/tenant-config` creates no application session or synthetic receipt.

## Explicitly unexercised entry points

- all other current and future pages;
- comprehensive Route Handler protection;
- all other Server Actions;
- direct and newly added resource paths;
- default protection for new resources;
- final forbidden/recovery UI and expired/missing-session action HTTP 401 behavior;
- refresh, back/forward, running-tab modal, warning, renewal, invalidation, and complete outage behavior.

#154 owns the comprehensive inventory and integration. #157/#158 and #220/#221 retain their accepted lifecycle,
recovery, freshness, and race responsibilities.
