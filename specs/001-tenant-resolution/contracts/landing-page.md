# Contract: Landing-page Tenant Display Name

**Route**: `/`
**Requirements**: FR-005, FR-009–FR-012, FR-015–FR-016; SC-001–SC-007.

## Successful visit

The existing landing page displays `Tenant: {Display Name}` directly after its current top-level heading. Display Name
comes from `getCurrentTenantConfig(tenant)` and is rendered through the existing PathAble `Text` component as ordinary text.
The page remains server-rendered. The name is visible in the document and available to assistive technology without
waiting for a browser-side fetch or user action.

The existing heading, informational content, and `Continue to Pre-ETS` button retain their semantics and keyboard path.
The button acquires no new action. No tenant switcher, mode label, configuration debug dump, branding controls, custom
HTML injection, or additional tenant-config fields are added. Layout should allow long names to wrap without obscuring
content. The name itself need not be unique; slug identity remains authoritative.

## Modes and outcomes

| Visit                                                        | Expected visible outcome                                                                                                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Known host `springfield.pathable.com`, production            | `Tenant: Springfield Demo` from that record.                                                                                                                                                           |
| Known host `shelbyville.pathable.com`, production            | `Tenant: Shelbyville Demo`; not Springfield's name.                                                                                                                                                    |
| Known host `springfield.localhost`, local host mode          | Same Display Name contract using local known records.                                                                                                                                                  |
| Bare `localhost`, explicit local static mode                 | The supplied static Display Name; no claim that Host established tenancy.                                                                                                                              |
| Static Display Name changed, server restarted, page reopened | Updated supplied name.                                                                                                                                                                                 |
| Unknown/invalid host in host mode                            | `forbidden()` UI (`Access denied.`), no successful landing page or tenant name. HTTP 403 when the interrupt is applied before streaming; 200 HTML is acceptable if Next.js streams the forbidden page. |
| Missing/invalid selected configuration                       | Visible configuration failure, no slug/name fallback.                                                                                                                                                  |

## Acceptance journeys

1. Open the two known local tenant addresses in separate browser contexts against the same running process. Assert
   each configured name, reload each, then make overlapping visits. Names must not cross between requests.
2. Start static mode and visit bare localhost. Verify the supplied name. Restart with the same slug and a changed
   Display Name, revisit, and verify the new value.
3. Visit unknown hosts and bare localhost in host mode. Assert Access denied with no redirect and absence of either known
   name; do not accept a default tenant. Prefer HTTP 403; a 200 document that is the `forbidden.tsx` page is acceptable.
4. Supply a name containing literal angle brackets and punctuation. Verify it is readable text and creates no injected
   executable content. Check missing/non-string/whitespace names through source validation and running-server failure
   steps in the quickstart.
5. Verify the name is ordinary accessible text, the top-level heading remains meaningful, and keyboard navigation can
   still reach the existing button with visible focus. No screenshot layout snapshot is required.

Browser assertions use user-facing text/roles and actual navigation outcomes. Source mismatch/unavailability and exact
binding counts are lower-layer contracts; do not add diagnostic controls or test-only public routes to expose them.
