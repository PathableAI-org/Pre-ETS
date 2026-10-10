---
id: PREETS-TENANT-003
classifications:
  - Functional
dependencies:
  - PREETS-TENANT-004
  - PREETS-TENANT-005
---

# Select the tenant for tenant-dependent frontend requests

**Owner / responsible boundary:** Frontend request tenant context

## Description

Every tenant-dependent frontend request must select exactly one configured tenant before tenant-dependent behavior
executes. This includes all authenticated requests, authentication flows that consume tenant configuration, and
`GET /_test/tenant-config`. Assets, framework requests, and health checks require tenant resolution only when their
behavior depends on tenant context.

In host mode, selection follows the request Host. In static mode, selection always uses the configured static alias
regardless of Host. Successful selection must not substitute another tenant.

## Rationale

Tenant-dependent consumers must receive the intended organization context. Host or static selection must not
accidentally select another tenant.

## Sources

- Legacy source label: Functional Requirement; obligation attribution is recorded in the maintainer decisions below.
- Decision: Maintainer approval on 2026-10-03 authorizes this replacement, preserving the approved behavior from
  2026-10-02 and 2026-10-03 except for the explicitly revised request scope and static selector clarification.

## Acceptance criteria

1. When host-based resolution is enabled, requests for two configured tenant hosts select their respective tenants,
   including interleaved requests.
2. Every authenticated request, tenant-configuration-consuming authentication flow, and diagnostic request uses the
   selected tenant context before executing tenant-dependent behavior.
3. In static mode with usable configuration, requests with known, unknown, or unresolvable hosts select the same
   configured static alias; `BASE_HOSTNAME` is not required in this mode.
4. Successful tenant-dependent behavior uses the selected tenant's configuration and never exhibits another tenant's
   configuration. Tenant-independent assets, framework requests, and health checks do not require tenant resolution.

## Design constraints

- `TENANT_RESOLUTION=host` selects host mode; `BASE_HOSTNAME` is required only in this mode.
- Host selection directly parses the literal `${alias}.${BASE_HOSTNAME}` pattern. No separate port or additional
  hostname validation is required beyond this pattern and configured-tenant selection.
- `TENANT_RESOLUTION=static` selects static mode. `TENANT_STATIC_ALIAS` is required in static mode and names the
  selected tenant; the host does not change that alias.

## Open questions

None.

## Related requirements

- Replaces [PREETS-TENANT-001](../deprecated/tenant/PREETS-TENANT-001.md).
- Depends on [PREETS-TENANT-004](PREETS-TENANT-004.md) and [PREETS-TENANT-005](PREETS-TENANT-005.md).

## Verification Plan

Application HTTP and browser/BDD evidence must establish tenant selection and configuration application across two distinguishable tenants, interleaved requests, host and static modes, and the specified request classes. Configuration assessment must establish mode-specific prerequisites, including static selection without BASE_HOSTNAME. Diagnostic configuration evidence supports selection, but does not establish user-facing behavior; tenant-independent requests must remain outside the resolution obligation. No unresolved verification question is identified beyond the contract's stated scope.

## Delivery references

- [Tenant delivery parent #115](https://github.com/PathableAI-org/Pre-ETS/issues/115): coordinates the selected criteria.
- [S1 — Load and expose the selected non-secret tenant configuration #116](https://github.com/PathableAI-org/Pre-ETS/issues/116): AC 1, 3.
- [S2 — Establish tenant context before remaining tenant-dependent frontend behavior #117](https://github.com/PathableAI-org/Pre-ETS/issues/117): AC 2, 4.

Published work is tracked in the [tenant delivery plan](../../delivery/tenant-resolution.md). These links do not
establish executed verification evidence.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.
