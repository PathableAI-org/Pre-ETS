# Contract: Tenant Idle Timeout Policy

Status: proposed implementation contract for feature `004-idle-session-timeout`.

**Requirements**: FR-001, FR-002, FR-003, FR-011; SC-001, SC-004.

## Configuration surface

Trusted tenant configuration (env JSON today) MAY include `idleTimeoutMinutes`.

| Input                                         | Outcome                                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Key omitted                                   | Effective duration **30** for new authenticated sessions                                                    |
| Integer `n` where `5 <= n <= 30`              | Effective duration `n` for new authenticated sessions                                                       |
| Fractional, `<5`, `>30`, non-integer, disable | Reject; **whole-source fail-fast**—any invalid record makes the tenant source unusable (`CONFIG_UNAVAILABLE`) for all tenants until fixed + process restart (matches current static source parse) |
| Unauthorized / cross-tenant change attempt    | Denied by existing host-bound config ownership (no cross-tenant write API in this slice)                                                                                                          |

No new administration application or roles. Reload semantics match existing tenant JSON
(restart process). There is **no** per-record last-known-good retention across a failed
array parse in this slice.

## Session binding

When OIDC callback (or equivalent auth completion) writes `userId` / `userName`, it MUST also
set:

- `idleDurationMinutes` = effective policy at that moment
- `lastActivityAt` = auth time
- `idleExpiresAt` = auth time + duration

Later tenant config changes MUST NOT mutate those fields on existing sessions.

## Invalid explicit configuration

If a tenant record **explicitly** includes an invalid idle field, establishing authenticated
access for that tenant MUST fail at the configuration boundary (same fail-closed class as other
unusable tenant config)—not authenticate with a silent 30-minute substitute.

## Observables for acceptance

- New sessions for tenants without a choice use 30 minutes.
- Each whole minute 5–30 is representable and applied to new sessions.
- Springfield vs Shelbyville policies do not cross-apply.
- After shortening or lengthening policy, an already-authenticated session retains its old
  `idleDurationMinutes`; a login-again session uses the new value.

## Non-goals

- Durable Postgres writer for tenant policy
- Per-user / per-role / per-device overrides
- Runtime admin HTTP API beyond existing trusted config process
