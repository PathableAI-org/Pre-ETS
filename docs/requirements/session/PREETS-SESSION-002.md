---
id: PREETS-SESSION-002
classifications:
  - Functional
---

# Tenant-configured OIDC authentication

## Description

Users must authenticate through the OIDC identity provider configured for the resolved tenant; the application must not provide its own username/password login experience.

## Rationale

The tenant identity provider owns authentication mechanisms.

## Sources

- Source: Maintainer-supplied discovery summary (2026-10-05), “Authentication and protected resources.”
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates.

- Decision: Maintainer direction on 2026-10-17 requires generic, tenant-configured OIDC integration without
  vendor-specific application policy. Microsoft is a first-class compatibility test scenario. The repository
  Compose Keycloak service is the current testing environment; local results do not establish Microsoft
  compatibility. This refinement awaits Git/PR approval and does not claim executed provider evidence.

## Acceptance criteria

1. Tenant configuration contains enough non-secret OIDC integration settings and, when needed, server-only secret lookup keys to initiate and complete authentication under PREETS-SECURITY-001.
2. Authentication uses the resolved tenant’s integration rather than another tenant’s configuration.
   Integration follows the OIDC contract and tenant configuration without coupling application policy
   to a particular identity-provider vendor.
3. Users are directed to the identity provider for authentication; the application does not collect local username/password credentials.

## Open questions

None.

## Verification Plan

OIDC contract/integration checks establish tenant-specific initiation, callback validation, and failed authentication outcomes. Browser Gherkin establishes delegation and the user journey; configuration-boundary checks establish required integration information.

Microsoft integration is a first-class scenario alongside the current local Compose Keycloak environment.
Apply the same behavioral expectations to each integration, including fresh-authentication evidence under
PREETS-SESSION-013. Local Keycloak execution alone does not establish Microsoft compatibility; a real
Microsoft execution and any relevant broker-chain behavior must be assessed before claiming support.
Provider-specific configuration/fixtures do not change the common application contract.

Evidence assumptions follow the shared session context. Unresolved verification conditions follow the Open questions above; no additional operational monitoring claim is introduced.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
