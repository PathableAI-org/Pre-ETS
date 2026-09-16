# Contract: OIDC Login Initiation

Status: proposed implementation contract. Bounded to provider login-page arrival. Callback code
exchange and authenticated identity are out of scope.

**Requirements**: FR-003–FR-009, FR-013; SC-001–SC-003, SC-005–SC-006.

## Compatibility / Supersedes (001 landing-page)

**Supersedes** `specs/001-tenant-resolution/contracts/landing-page.md` Successful visit / modes table
for Proxy-matched document navigations to `/` **without authenticated identity**—including both
setup `outcome: "reuse"` and `outcome: "create"`: those requests MUST initiate OIDC (or fail per
FR-007) and MUST NOT serve tenant application Display Name content first. Display Name landing
remains only after authenticated identity exists (future slice). Critique wording that kept Display
Name obligations for `reuse` only is **wrong** under the product rule and is superseded here.

Implementation MUST update `specs/001-tenant-resolution/contracts/landing-page.md` in the **same
delivery slice** as Proxy initiation (same pattern as 002 Refusal). Do not edit the 001 file in this
planning pass. Optional later dual-layer regression: unauthenticated `/` initiates or fails;
authenticated `/` may SSR Display Name.

## Participating requests

| Path                                             | Proxy behavior                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| `/` document navigation, unauthenticated         | `setupSession` then initiate (`reuse` or `create`); never SSR landing  |
| `/` non-document (RSC/prefetch), unauthenticated | `setupSession`; on need-login, `401` without IdP `Location`            |
| `/login-unavailable`                             | Outside `(app)`; unmatched by initiation; works without session cookie |
| `/auth/callback`                                 | Strip reserved headers; pass through stub; **no** initiation           |
| Assets / unmatched paths                         | No session setup or initiation                                         |

Trusted inputs: session cookie, OIDC correlation cookie (when present on later slices), Host (host
mode). Ignore query-string tenant/issuer/client/connection/return-host overrides.

Connection hint: config `oidc.connection` maps to Keycloak `kc_idp_hint` locally; other brokers are
a follow-up mapping.

## Ordered internal interface

`initiateLogin({ tenantId, origin, sessionId, request, setupOutcome })` runs after ready
unauthenticated `"reuse"` or `"create"`:

1. Load tenant record/`oidc` for `tenantId`. Unusable → typed config refusal (`403` extended
   forbidden UX—not `login-unavailable`).
2. Resolve optional client secret for the slug (may be absent).
3. Discover issuer metadata (`openid-client`); cache by issuer; failure → provider failure.
4. Generate `state`, `nonce`, PKCE verifier/challenge.
5. Compute `redirectUri` = approved `{scheme}://{tenant-host}/auth/callback`.
6. Persist Redis transaction; mint correlation cookie; failure → transaction failure (no redirect).
7. Build authorization URL: `response_type=code`, S256 PKCE, `state`, `nonce`, `client_id`,
   `redirect_uri`, `scope=openid`, plus `kc_idp_hint` when `connection` is set (Keycloak-local).
8. Return redirect result. Adapter sets correlation cookie + `302`; sets `pathable-session` **only**
   when `setupOutcome === "create"` and this is a successful document IdP redirect.

PKCE verifier must not appear in the authorization URL, HTML, or client bundles.

## HTTP outcomes

| Condition                                            | HTTP outcome                      | Session cookie issued?                             | Side effects                                                                                                                            |
| ---------------------------------------------------- | --------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Unauthenticated `reuse` + valid oidc + document nav  | `302` to broker authorization URL | No (retain existing; re-set only if attrs require) | oidc cookie + Redis tx; **no** SSR landing                                                                                              |
| Unauthenticated `create` + valid oidc + document nav | `302` to broker authorization URL | **Yes** (setup `cookieValue` on this 302)          | oidc cookie + Redis tx                                                                                                                  |
| Unauthenticated ready + valid oidc + non-document    | `401`                             | **No**                                             | No IdP redirect; no application content                                                                                                 |
| Unknown tenant / invalid host                        | `403` `Access denied.`            | **No**                                             | No tx; no OIDC cookies                                                                                                                  |
| Missing/invalid tenant oidc config                   | `403` **extended forbidden** UX   | **No**                                             | “Login cannot start” + next action + a11y; no secrets; **not** `login-unavailable`; no tx; no IdP redirect; Redis create orphan may TTL |
| Discovery / tx establishment failure                 | Accessible `login-unavailable`    | **No**                                             | No IdP redirect; no application content; distinct from config 403                                                                       |
| `/login-unavailable`                                 | Accessible failure page (P5)      | **No** (must work without cookie)                  | Outside `(app)`; no initiation                                                                                                          |
| `/auth/callback`                                     | Stub page (non-initiating)        | N/A                                                | No login redirect loop                                                                                                                  |
| Terminal session store failure                       | Existing `503` / `500`            | Session rules unchanged                            | No initiation                                                                                                                           |
| Session with authenticated user id (later; E7)       | SSR landing                       | Per later auth design                              | Sole short-circuit; out of scope                                                                                                        |

All participating responses remain `Cache-Control: private, no-store`.

**P4**: OIDC config refusal is HTTP 403 with extended forbidden copy—not the `login-unavailable`
page. Unknown-tenant host refusal may remain plain `Access denied.`; login-config refusal must
still convey that login cannot start plus a clear next action without leaking secrets.

**HTTP cookie-absence acceptance (E2)**: `@http` / `@contract` (or equivalent BDD step) MUST assert
that create-path **config 403**, **`login-unavailable`**, **tx failure**, and **non-document `401`**
responses do **not** include `Set-Cookie: pathable-session` (BDD agent adds Gherkin). Unit contracts
remain required in addition.

**Verification case**: unit/HTTP proof that config 403, `login-unavailable`, tx failure, and
non-document `401` responses do **not** include `Set-Cookie: pathable-session=…` for a new create.

**Diagnostics (E9)**: outcome class only (`reuse` / `redirect` / `403-config` / `login-unavailable` /
`401-nondoc`)—never verifiers, secrets, or raw tokens.

**Early RSC proof (E4)**: before broad BDD, record the chosen Next 16.3.5 non-document signal for `/`
and the client-visible `401` outcome.

## Authorization request observables (tests)

Tests may inspect the `Location` on initiation responses for:

- Correct issuer authorization endpoint host/path from discovery
- `client_id` matching resolved tenant only
- `redirect_uri` matching approved tenant callback
- `code_challenge_method=S256` and presence of `code_challenge`
- Presence of fresh `state` and `nonce`
- `kc_idp_hint` equal to configured `connection` when set (Keycloak-local)
- Absence of `code_verifier` and client secrets

Browser acceptance asserts a **usable** provider login experience (operable controls), not merely
tenant strings in application markup. Local/`test:bdd:oidc` with Compose Keycloak; CI `@contract` /
`@http` without live Keycloak until CI gains Keycloak (E8).

## Non-goals

- Token exchange, userinfo, refresh, logout
- Writing authenticated user id into the session record (E7 short-circuit field; later slice)
- Backend JWT verification
- Automatic redirect loops or meta-refresh retries on failure
- Serving Display Name landing for anonymous `reuse` or `create`
- Collapsing OIDC config 403 into the `login-unavailable` page
