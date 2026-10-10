---
id: PREETS-TENANT-006
classifications:
  - Functional
dependencies:
  - PREETS-TENANT-003
  - PREETS-TENANT-004
  - PREETS-TENANT-005
  - PREETS-SECURITY-001
  - PREETS-INFRA-001
---

# Expose parsed tenant configuration for verification

**Owner / responsible boundary:** Frontend diagnostic HTTP interface

## Description

The test runner must obtain the parsed configuration for the effective request tenant as JSON through
`GET /_test/tenant-config`. The endpoint must use normal application tenant context, including static selection,
and remain available directly at the application boundary in every environment, including production.
Diagnostic responses must include `Cache-Control: no-store`. Full configuration disclosure
requires the non-secret configuration invariant in PREETS-SECURITY-001; independently verified production ingress
protection remains required by PREETS-INFRA-001.

## Rationale

The test runner needs direct configuration evidence from normal request resolution without requiring telemetry.
An independent comparison with the expected file can detect wrong-tenant configuration selection.

## Sources

- Legacy source label: Functional Requirement; obligation attribution is recorded in the maintainer decisions below.
- Decision: Maintainer review approval on 2026-10-03 adds the non-secret delivery dependency and diagnostic
  `Cache-Control: no-store` behavior. Maintainer approval on 2026-10-03 authorizes this replacement, preserving the approved behavior from
  2026-10-02 and 2026-10-03 except for the explicitly revised request scope and static selector clarification.

## Acceptance criteria

1. Successful `GET /_test/tenant-config` responses contain the complete parsed configuration selected by normal
   request resolution, equal to the independently parsed expected `{alias}.json` file in `TENANT_CONFIG_DIR`.
2. When host-based resolution is enabled, requests for two configured tenant hosts return their respective
   configurations rather than a separate lookup
   or fixture echo; interleaved requests do not substitute another tenant's configuration.
3. With a usable static file, the endpoint returns `TENANT_STATIC_ALIAS`'s configuration regardless of Host.
4. Unknown or unresolvable hosts and missing tenant files in host mode receive HTTP 404. Unreadable/malformed
   selected files in either mode receive HTTP 404; a parsed directory that does not exist, is not a directory,
   or is unreadable, and a missing static file, receive HTTP 500, following PREETS-TENANT-004.
5. Direct application access under production configuration retains the endpoint; environment gating does not
   disable it. Production ingress protection is a separate obligation.
6. Diagnostic responses include `Cache-Control: no-store`, including HTTP 404 and HTTP 500 responses from this route.

## Design constraints

- The route is `GET /_test/tenant-config`, and its response is the full parsed tenant configuration as JSON.

## Open questions

None.

## Implementation dependencies

Implement and verify PREETS-SECURITY-001's non-secret configuration contract before shipping full diagnostic
configuration disclosure. Verify production ingress protection independently; it does not replace safe content.
Apply the directory/file failure policies approved in PREETS-TENANT-004; these response decisions are resolved.

## Related requirements

- Replaces the diagnostic obligation in [PREETS-TENANT-002](../deprecated/tenant/PREETS-TENANT-002.md).
- Depends on [PREETS-TENANT-003](PREETS-TENANT-003.md), [PREETS-TENANT-004](PREETS-TENANT-004.md), and
  [PREETS-TENANT-005](PREETS-TENANT-005.md).
- Production access restriction: [PREETS-INFRA-001](../infrastructure/PREETS-INFRA-001.md).
- Required content constraint: [PREETS-SECURITY-001](../security/PREETS-SECURITY-001.md).

## Verification Plan

Application HTTP evidence must establish complete parsed configuration from normal tenant context, independently expected values for distinct and interleaved tenants, host and static modes, and direct application availability under production configuration. It must establish the approved file/directory failure outcomes after configuration parses; configuration parse failure must prevent startup and Cache-Control: no-store on successful and failed responses. This evidence supports diagnostic selection and retrieval, not user-facing configuration application or production ingress protection. The diagnostic interface provides the existing externally meaningful observation; no additional monitoring validation is required by the current sources. No unresolved verification question is identified.

## Delivery references

- [Tenant delivery parent #115](https://github.com/PathableAI-org/Pre-ETS/issues/115): coordinates the selected criteria.
- [S1 — Load and expose the selected non-secret tenant configuration #116](https://github.com/PathableAI-org/Pre-ETS/issues/116): AC 1–3, 5, and success portion of AC 6.
- [S3 — Complete approved tenant HTTP and browser failure outcomes #118](https://github.com/PathableAI-org/Pre-ETS/issues/118): AC 4 and failed-response portion of AC 6.

Published work is tracked in the [tenant delivery plan](../../delivery/tenant-resolution.md). These links do not
establish executed verification evidence.

## Observability

The existing diagnostic interface must expose the complete parsed configuration selected by normal request tenant context, with the availability, failure outcomes, and no-store behavior in Acceptance criteria. No additional operational monitoring obligation is introduced.
