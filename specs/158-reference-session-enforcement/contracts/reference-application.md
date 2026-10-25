# Reference Application Contract

This is a bounded Next.js reference contract for #219. It demonstrates reusable session enforcement at one protected
page and one Server Action. It is not a comprehensive route policy and does not protect future resources by default.

## Protected page: `GET /`

The root page is dynamically rendered and private/no-store. Before rendering protected content it:

1. reads the request host;
2. resolves and loads that tenant through `TenantConfigService`;
3. reads the opaque `pathable-session` cookie;
4. calls `SessionService.readForTenant` with the independently resolved alias; and
5. maps the result before rendering starts.

| Condition                              | HTTP behavior                                          | Body/content behavior                                                                                             | Cookie/effect behavior                                                                         |
| -------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Matching `UsableSession`               | `200`                                                  | Shows bounded protected identity/tenant, authoritative deadline, warning policy, and protected-operation control. | Does not create/replace an application session.                                                |
| `NoUsableSession` after tenant success | `307` to same-origin `/auth/login`                     | No protected identity, content, action, or result is rendered first.                                              | The page sets no application/correlation/effect cookie. Login owns later correlation behavior. |
| `SessionTenantMismatch`                | `403` through installed `forbidden()` before streaming | Bounded generic forbidden indication; no session tenant, identity, protected content, or effect.                  | No replacement login/session/effect.                                                           |
| `SessionServiceUnavailable`            | Server failure distinct from redirect/403/success      | Safe failure presentation; no raw cause, stored value, identity, or protected content.                            | No replacement login/session/effect.                                                           |
| Tenant alias/configuration failure     | Existing `404` or `500` mapping                        | No fallback tenant and no protected content.                                                                      | No session-based conversion or effect.                                                         |

The root `forbidden.tsx` copy is revised from login-configuration language to a bounded tenant/session forbidden
indication. It accepts no props and exposes no tenant or identity values.

## Protected Server Action

The reference page exposes one top-level `"use server"` action through a native form. Every invocation independently
repeats host/tenant resolution, cookie reading, and `readForTenant`; it does not trust rendered props, form fields,
client state, or an earlier page admission.

```ts
export type ReferenceActionState =
  | { readonly _tag: "Ready" }
  | { readonly _tag: "Denied"; readonly message: string }
  | { readonly _tag: "Succeeded"; readonly message: string }

export const initialReferenceActionState: ReferenceActionState

export async function runReferenceOperation(
  previousState: ReferenceActionState,
  formData: FormData
): Promise<ReferenceActionState>
```

`previousState` and `formData` convey no authority and are not used to select identity or tenant.

| Condition                   | Action behavior                                    | Protected result                            | Synthetic effect                                                                      |
| --------------------------- | -------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| Matching `UsableSession`    | Returns `Succeeded` with bounded safe result text. | Present and announced by the client island. | Exactly one short-lived reference-effect receipt cookie is emitted after enforcement. |
| `NoUsableSession`           | Returns `Denied`; does not start OIDC.             | Absent; denial is announced.                | None.                                                                                 |
| `SessionTenantMismatch`     | Invokes `forbidden()` before mutation.             | Absent; actual action HTTP response is 403. | None.                                                                                 |
| `SessionServiceUnavailable` | Fails distinctly as a safe server error.           | Absent.                                     | None.                                                                                 |
| Tenant 404/500              | Preserves the existing tenant failure class.       | Absent.                                     | None.                                                                                 |

The action's generated transport endpoint and identifiers are Next.js implementation details, not a public HTTP API.
Evidence invokes the action through its rendered form and records the actual response semantics.

## Reference interaction

- The page remains a Server Component.
- One minimal client component owns `useActionState`, the form action binding, pending state, and polite result
  announcement.
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
