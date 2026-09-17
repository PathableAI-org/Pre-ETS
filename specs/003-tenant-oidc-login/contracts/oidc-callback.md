# Contract: OIDC callback completion

**Route**: `/auth/callback` (Proxy) → success `303` `/`
**Related**: [oidc-login-initiation.md](./oidc-login-initiation.md),
[docs/authentication.md](../../../docs/authentication.md),
[docs/session-state.md](../../../docs/session-state.md)

## Goals

Complete authorization-code return so a successful broker login authenticates the
existing Redis session with `userId` + `userName`, clears the OIDC correlation
cookie, and lets Proxy short-circuit `/` to SSR landing.

## Proxy behavior

| Request                                                             | Outcome                                                                                  |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Document `GET /auth/callback?code&state` (happy path)               | Consume tx; exchange code; update session; clear `pathable-oidc`; `303` `/`              |
| Document callback missing/invalid code, state, cookie, nonce, or tx | Clear `pathable-oidc`; `303` `/login-unavailable` (or extended `403` for config refusal) |
| Non-GET `/auth/callback`                                            | `401`; fail closed (contract is GET-only)                                                |
| Non-document `/auth/callback`                                       | `401`; fail closed                                                                       |
| Document `/` with session `userId` set                              | SSR landing; **no** `initiateLogin`                                                      |
| Document `/` without `userId`                                       | Existing initiation contract                                                             |

**Proxy branch order**: handle `/auth/callback` after config load (tenant resolve

- `completeLogin`); on `/`, after `setupSession` ready, short-circuit when
  `userId` is present before initiation.

Do **not** re-run `initiateLogin` on the callback path.

## Completion steps

1. Require document `GET`; refuse non-GET or non-document with `401`.
2. Resolve tenant from Host; refuse unknown/config errors.
3. Require `code` + `state` query params; IdP `error` → fail closed.
4. Verify `pathable-oidc` (`state` / `tenant` / `exp`); require cookie `state` ===
   query `state` and cookie `tenant` === resolved tenant.
5. One-time Redis transaction consume by `state` (`GETDEL`).
6. Refuse tenant / issuer / client / connection mismatch with tx or session.
7. Require the approved Host-derived callback URI to equal `tx.redirectUri`;
   perform the code grant against that stored URI (not an unbound request URL).
8. Discover issuer; authorization-code grant with PKCE verifier; confidential
   clients use server-only secret resolution.
9. Validate ID token `nonce` against tx; extract `sub` as `userId` and display
   name as `name` → `preferred_username` → `sub`.
10. Update Redis session for `tx.sessionId` with
    `{ tenantId, expiresAt, userId, userName }` preserving existing expiry.
    Do **not** store access/refresh tokens.
11. Clear `pathable-oidc`; redirect `303` to `/` on the bound application origin.

## Session / cookie boundaries

- Cookie claims remain `sid` / `tenant` / `exp` only.
- Authenticated fields live only on the Redis session record and forwarded
  `x-pathable-session-context` for SSR.
- Transaction records are single-use; second callback with the same `state`
  fails closed.

## Non-goals

- Refresh tokens, logout, userinfo as primary identity source
- Backend token verification / domain user persistence
- Storing access tokens in Redis
- IdP `connection` / `kc_idp_hint` UX changes
