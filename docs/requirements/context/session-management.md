# Authentication and session management

The session requirements derive from the maintainer-supplied **Session and Authentication Requirements — Discovery
Summary**, provided on 2026-10-05. Each requirement names its relevant source section. Maintainer approval on 2026-10-05 accepts PREETS-SESSION-001 through PREETS-SESSION-013.
Acceptance does not establish implementation or behavioral verification; open policy and design questions remain delivery gates.

## Scope and source limitations

The scope covers protected application access, tenant OIDC authentication, transient sessions, idle timeout,
and browser protection. API/backend data-resource expiration responses, absolute maximum session lifetime,
CI scheduling, and implementation mechanisms remain outside these requirements. Redis, browser messaging APIs,
framework files, component reuse, and local Keycloak are context rather than required technologies.

The handoff mentions **Project Reference Links.txt**, but supplies neither its contents nor an accessible
location; it has not been reviewed. Existing tenant-resolution requirements are retained and linked below; no historical specifications are migrated.

## Related accepted requirements

Request tenant resolution follows [PREETS-TENANT-003](../tenant/PREETS-TENANT-003.md), configuration
retrieval follows [PREETS-TENANT-004](../tenant/PREETS-TENANT-004.md), and invalid host-based tenants
retain [PREETS-TENANT-005](../tenant/PREETS-TENANT-005.md)’s HTTP 404 outcome. The session-binding HTTP 403 applies
to a resolved request tenant differing from the authenticated session tenant, not an invalid tenant host.
OIDC configuration follows [PREETS-SECURITY-001](../security/PREETS-SECURITY-001.md): tenant files contain
non-secret integration settings and lookup keys only; credentials resolve separately on the server.
Diagnostic access remains subject to [PREETS-TENANT-006](../tenant/PREETS-TENANT-006.md) and
[PREETS-INFRA-001](../infrastructure/PREETS-INFRA-001.md); whether that diagnostic resource is explicitly
unauthenticated under the accepted default-authentication policy remains a product decision.

## Relationship to current contracts

The following are accepted obligations, not descriptions of delivered behavior. Existing implementation notes
remain intact pending delivery:

- [Session state — Loading session state](../../session-state.md#loading-session-state) treats a tenant mismatch
  as an empty session; PREETS-SESSION-005 instead forbids authenticated cross-tenant access.
- [Session state — Idle clearance and recovery paths](../../session-state.md#idle-clearance-and-recovery-paths)
  starts generic OIDC on fresh document entry after inactivity; PREETS-SESSION-007 requires an explicit
  session-expired page before reauthentication.
- [Authentication — Login again after inactivity](../../authentication.md#login-again-after-inactivity)
  permits existing IdP SSO without a fresh challenge; PREETS-SESSION-013 requires fresh authentication.
- [Multi-tenancy — Idle timeout policy](../../multi-tenancy.md#idle-timeout-policy) records a default and policy
  snapshot at authentication. This handoff does not decide defaults or live policy-change behavior.
- [Session state](../../session-state.md) describes an existing absolute lifetime. These contracts neither adopt
  that lifetime as a product requirement nor removes existing enforcement.

## Verification context

Application evidence must establish real OIDC redirects, callbacks, session creation, tenant binding, and recovery. Controlled authentication seams may support other outcomes only with independently established authentication behavior and documented assumptions. Fabricated store records do not establish login. Browser observations are needed for user experience; finite application observations do not establish every environment. Detailed former engineering strategies remain in the pre-migration Git history.
