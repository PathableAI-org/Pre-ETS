# Callback HTTP Contract: Distributed Session Establishment

## Boundary

This contract extends the existing Node Route Handler at `GET /auth/callback` only after
`AuthenticationService.complete` has produced a trusted identity. It is the bounded reference consumer required by
issue #218; it does not grant protected access or define comprehensive callback/entry-point integration.

## Successful trusted callback

Given a qualified and successfully validated provider return:

1. Load the current validated configuration for `TrustedIdentity.tenantAlias` and derive its effective session policy.
2. Call `SessionService.establish` with issuer/subject identity, the same tenant alias, and that policy.
3. Only after establishment succeeds, return the existing empty `204` response with `Cache-Control: private, no-store`.
4. Clear the consumed `oidc-correlation` cookie using its existing callback-path contract.
5. Set exactly one authenticated-session cookie:

| Attribute  | Value/constraint                                                                            |
| ---------- | ------------------------------------------------------------------------------------------- |
| Name       | `pathable-session`                                                                          |
| Value      | Opaque `SessionReference`; no identity, policy, token, credential, or telemetry identifier  |
| `HttpOnly` | `true`                                                                                      |
| `SameSite` | `Lax`                                                                                       |
| `Path`     | `/`                                                                                         |
| `Domain`   | Omitted (host-only)                                                                         |
| `Secure`   | `true` except the existing explicit local-loopback allowance                                |
| Lifetime   | Bounded by the established authoritative idle deadline; it does not extend server authority |

Multiple `Set-Cookie` values must preserve both correlation clearing and session issuance. Query/callback values must
not appear in the body, location, cookie, or telemetry.

## Rejected or failed authentication

Existing callback failure mapping remains authoritative:

- Do not call `SessionService.establish`.
- Issue no `pathable-session` cookie.
- Preserve or clear `oidc-correlation` according to the existing pre-/post-consumption disposition.
- Return the existing safe private/no-store presentation or tenant failure response without provider/storage details.

## Session establishment or post-validation tenant failure

If tenant policy cannot be loaded after trusted completion, or session persistence returns
`SessionServiceUnavailable`:

- Fail closed and issue no `pathable-session` cookie.
- Clear `oidc-correlation`, because the authentication transaction has already been consumed.
- Reuse the existing generic private/no-store authentication-return presentation; do not expose whether configuration,
  Redis transport, encoding, or an ambiguous write caused the failure.
- Do not retry the full callback, silently create a replacement, or treat the outcome as anonymous success.
- A failed/ambiguous session write must not annotate a span with a successful-session `session.id`.

## Compatibility and limitations

- The successful status/body stay `204`/empty; clients observe the additional host-only session cookie.
- The contract does not read `pathable-session`, compare it with request tenant, render protected content, renew it,
  invalidate it, or present warnings/recovery. Those remain #219/#154/#220/#221/#155–#158.
- Cookie presence alone does not establish user/tenant binding for requirements BDD. The public-service/real-adapter
  evidence and manual second-client read establish this construction increment; later protected consumption supplies
  running-product binding evidence.
