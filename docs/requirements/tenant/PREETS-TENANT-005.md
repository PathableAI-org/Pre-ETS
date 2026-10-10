---
id: PREETS-TENANT-005
classifications:
  - Functional
---

# Treat invalid host-based tenants as not found

**Owner / responsible boundary:** Frontend HTTP and browser boundaries

## Description

In host mode, a tenant-dependent request whose host cannot yield an alias or whose alias is unknown must receive
HTTP 404 Not Found without fallback tenant context or configuration. Invalid-tenant navigation must appear like
ordinary navigation to a page that does not exist. These host-based rejection rules do not apply in static mode.

## Rationale

Invalid tenant navigation must look like an ordinary missing page and must not expose another tenant through fallback.

## Sources

- Legacy source label: Functional Requirement; obligation attribution is recorded in the maintainer decisions below.
- Decision: Maintainer approval on 2026-10-03 authorizes this replacement, preserving the approved behavior from
  2026-10-02 and 2026-10-03 except for the explicitly revised request scope and static selector clarification.

## Acceptance criteria

1. A host outside the configured `${alias}.${BASE_HOSTNAME}` pattern receives HTTP 404 for tenant-dependent requests.
2. A matching host whose alias is unknown receives HTTP 404 without substituting a configured tenant.
3. Both failures provide no successful tenant context or fallback configuration.
4. Browser navigation for either failure presents the application's ordinary missing-page experience rather than
   an access-denied or tenant-resolution diagnostic page.
5. Static mode does not reject a request because of its host. Directory failures and a missing static file follow
   PREETS-TENANT-004's HTTP 500 rules; unreadable/malformed selected files follow its ordinary HTTP 404 rule.

## Open questions

None.

## Related requirements

- Replaces [PREETS-TENANT-001](../deprecated/tenant/PREETS-TENANT-001.md).
- Host selection: [PREETS-TENANT-003](PREETS-TENANT-003.md).
- Configuration failures: [PREETS-TENANT-004](PREETS-TENANT-004.md).

## Verification Plan

HTTP and browser/BDD evidence must establish both invalid-host failure categories as actual HTTP 404 with no fallback and the ordinary missing-page experience. Evidence must distinguish static-mode host exemption from the configuration failures governed by PREETS-TENANT-004. Multiple distinguishable tenants are needed to detect fallback; rendered wording alone does not establish status. No unresolved verification question is identified.

## Delivery references

- [Tenant delivery parent #115](https://github.com/PathableAI-org/Pre-ETS/issues/115): coordinates the selected criteria.
- [S3 — Complete approved tenant HTTP and browser failure outcomes #118](https://github.com/PathableAI-org/Pre-ETS/issues/118): AC 1–5.

Published work is tracked in the [tenant delivery plan](../../delivery/tenant-resolution.md). These links do not
establish executed verification evidence.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.
