# Contract: Landing-page Tenant Display Name

**Route**: `/`
**Requirements**: FR-005, FR-009–FR-012, FR-015–FR-016; SC-001–SC-007 (001).
**Superseded for unauthenticated visits by**:
`specs/003-tenant-oidc-login/contracts/oidc-login-initiation.md` (FR-003, SC-002).

## Compatibility / Supersedes (003 OIDC initiation)

For Proxy-matched **document** navigations to `/` **without authenticated identity** (session setup
`outcome: "reuse"` or `"create"`), this contract’s Successful visit / modes table **does not apply**.
Those requests MUST initiate OIDC (or fail per 003 FR-007) and MUST NOT serve
`Tenant: {Display Name}` or other tenant application content first.

Display Name landing obligations in this file apply when an **authenticated user id**
(`userId`) exists on the session after OIDC callback completion. See
`specs/003-tenant-oidc-login/contracts/oidc-callback.md`. Unauthenticated `/`
remains initiate-or-fail per the 003 initiation contract.

Dual-layer regression intent:

1. Unauthenticated `/` → initiate OIDC or fail (003)
2. Authenticated `/` → SSR Display Name + signed-in user name (001 + callback)

## Successful visit (authenticated identity only)

When the session carries an authenticated user id, the landing page displays
`Tenant: {Display Name}` directly after its current top-level heading, and
`Signed in as: {userName}` when `userName` is present on the forwarded session
context. Display Name comes from `getCurrentTenantConfig(tenant)` / the session
snapshot and is rendered through the existing PathAble `Text` component as
ordinary text. The page remains server-rendered. The name is visible in the
document and available to assistive technology without waiting for a browser-side
fetch or user action.

The existing heading, informational content, and `Continue to Pre-ETS` button retain their semantics
and keyboard path. The button acquires no new action. No tenant switcher, mode label, configuration
debug dump, branding controls, custom HTML injection, or additional tenant-config fields are added.
Layout should allow long names to wrap without obscuring content. The name itself need not be unique;
slug identity remains authoritative.

## Modes and outcomes

| Visit                                                        | Expected visible outcome                                                                                                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unauthenticated document `/` (reuse or create)               | **Superseded**: OIDC initiation `302` (or 003 failure UX)—never Display Name landing.                                                                                                                  |
| Known host with authenticated identity, production           | `Tenant: Springfield Demo` / Shelbyville Demo from that record; `Signed in as: {userName}`.                                                                                                            |
| Known host `springfield.localhost`, authenticated, host mode | Same Display Name + signed-in name contract using local known records.                                                                                                                                 |
| Bare `localhost`, static mode, authenticated                 | The supplied static Display Name and signed-in user name; no claim that Host established tenancy.                                                                                                      |
| Unknown/invalid host in host mode                            | `forbidden()` UI (`Access denied.`), no successful landing page or tenant name. HTTP 403 when the interrupt is applied before streaming; 200 HTML is acceptable if Next.js streams the forbidden page. |
| Missing/invalid selected configuration                       | Visible configuration failure, no slug/name fallback. For login-config defects on unauthenticated `/`, see 003 extended forbidden (not Display Name landing).                                          |

## Acceptance journeys

1. **Unauthenticated (003 gate)**: Open the two known local tenant addresses in separate browser
   contexts without authenticated identity. Assert each reaches only its tenant login connection /
   initiation failure—not Display Name content—and names/issuers do not cross between requests.
2. **Authenticated Display Name**: After callback completion authenticates the session, assert
   configured Display Names, signed-in user name, reload isolation, and overlapping visits.
3. Visit unknown hosts and bare localhost in host mode. Assert Access denied with no redirect and
   absence of either known name; do not accept a default tenant. Prefer HTTP 403; a 200 document that
   is the `forbidden.tsx` page is acceptable.
4. Supply a name containing literal angle brackets and punctuation. Verify it is readable text and
   creates no injected executable content once authenticated landing is in scope. Check
   missing/non-string/whitespace names through source validation (shared parser now also requires
   `oidc`) and running-server failure steps in the quickstart.
5. Verify the name is ordinary accessible text, the top-level heading remains meaningful, and
   keyboard navigation can still reach the existing button with visible focus once authenticated
   landing is served. No screenshot layout snapshot is required.

Browser assertions use user-facing text/roles and actual navigation outcomes. Source mismatch /
unavailability and exact binding counts are lower-layer contracts; do not add diagnostic controls or
test-only public routes to expose them.
