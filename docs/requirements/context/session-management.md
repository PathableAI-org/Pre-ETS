# Authentication and session management

The session requirements derive from the maintainer-supplied **Session and Authentication Requirements — Discovery
Summary**, provided on 2026-10-05. Each requirement names its relevant source section. Maintainer approval on 2026-10-05 accepts PREETS-SESSION-001 through PREETS-SESSION-013.
Acceptance does not establish implementation or behavioral verification; open policy and design questions remain delivery gates.

## Scope and source limitations

The scope covers protected application access, tenant OIDC authentication, transient sessions, idle timeout,
and browser protection. API/backend data-resource expiration responses, absolute maximum session lifetime,
CI scheduling, and implementation mechanisms remain outside these requirements. Redis, browser messaging APIs,
framework files, component reuse, and local Keycloak are context rather than required technologies.
Maintainer direction on 2026-10-12 assigns heartbeat endpoint behavior and disabling input on connection loss
to a separate pending requirement; no ID or reviewed text was supplied here. These contracts retain
server-authoritative expiration without defining that pending connection-loss workflow.

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
[PREETS-INFRA-001](../infrastructure/PREETS-INFRA-001.md). Maintainer direction on 2026-10-12 exempts all
`/_test` routes from authentication and confirms that the diagnostic endpoint does not create an application
session, as recorded in [PREETS-SESSION-001](../session/PREETS-SESSION-001.md). This refinement awaits Git/PR approval;
the separate tenant, configuration-safety, and production-ingress obligations remain intact.

## Fresh authentication decision (2026-10-17)

Maintainer direction requires a fresh provider authentication event whenever login is needed without a
valid application session, including first-time visits, automatic entry, and explicit recovery. A valid
session is still reused. Freshness does not depend on recognizing an expired session after its record is
removed; no retention mechanism is required solely to select that policy. Server Action HTTP 401/recovery
and running-tab modal behavior remain unchanged. Protocol semantics, clock tolerance, provider/broker
support, and failure handling remain B6 work. This working refinement awaits Git/PR approval and supersedes
historical recognition-gate prose below for freshness selection only.

### B6 protocol baseline (2026-10-17)

The maintainer selected the OIDC protocol baseline on 2026-10-17: every login without a valid
application session requests `max_age=0`; the callback validates the signed ID token and its `auth_time`
as evidence of a fresh authentication event before creating an authenticated application session. Missing
or stale freshness evidence is rejected. A redirect, a new session ID, or `prompt=login` alone is not proof.
The comparison with the authentication transaction and allowed clock tolerance remain to be specified;
provider/broker support and unsupported-provider handling remain open. No tolerance value or provider
compatibility is approved or verified by this selection. Protocol source:
[OIDC Core authorization request](https://openid.net/specs/openid-connect-core-1_0.html#AuthRequest) and
[ID token validation](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation).

### Provider-neutral compatibility evidence (2026-10-17)

The maintainer requires provider-neutral, standards-based OIDC integration driven by tenant configuration,
without designing application behavior around a particular vendor. Microsoft identity integration is a
first-class compatibility test scenario. The existing repository Docker Compose Keycloak service and tracked
realm are the current development/test environment; no additional identity stack is introduced.

Run the same initiation, callback validation, `max_age=0` / signed-ID-token `auth_time` freshness, existing-SSO,
missing/stale evidence, failure/cancellation, tenant-isolation, and session-establishment expectations against
each supported integration. Provider-specific setup belongs in configuration and test fixtures rather than
provider-specific application policy. Passing local Keycloak scenarios does not establish Microsoft behavior
or universal OIDC-provider compatibility. Microsoft scenarios remain explicitly outstanding until executed
against a real Microsoft integration; no Microsoft environment access or successful execution is claimed.
The exact Microsoft product/tenant and any direct-versus-broker topology are not yet established. Relevant
broker chains require their own freshness evidence before compatibility is claimed. Clock tolerance and
unsupported-provider handling remain open B6 decisions.

Source: maintainer direction on 2026-10-17. Repository inspection confirmed the Keycloak service in
[compose.yaml](../../../compose.yaml) and its tracked realm in
[docker/keycloak/pre-ets-realm.json](../../../docker/keycloak/pre-ets-realm.json); containers were not started or assessed.

## Historical implementation context

The following comparisons use implementation notes at the accepted session requirements revision
`6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e` (PR #114). They explain the historical differences that motivated delivery;
they do not describe current implementation or establish executed evidence. The accepted contracts remain authoritative:

- [Session state — Loading session state](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/session-state.md#loading-session-state) treats a tenant mismatch
  as an empty session; PREETS-SESSION-005 instead forbids authenticated cross-tenant access.
- [Session state — Idle clearance and recovery paths](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/session-state.md#idle-clearance-and-recovery-paths)
  starts generic OIDC on fresh document entry after inactivity; PREETS-SESSION-007 requires an explicit
  session-expired page before reauthentication in its originally accepted form. The later 2026-10-12
  working refinement replaces this with HTTP 401 and dedicated recovery content for expired or missing-record
  Server Actions, and direct tenant OIDC on fresh entry without a valid session. That refinement awaits Git/PR approval.
- [Authentication — Login again after inactivity](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/authentication.md#login-again-after-inactivity)
  permits existing IdP SSO without a fresh challenge; PREETS-SESSION-013 requires fresh authentication.
  Maintainer clarification on 2026-10-12 explicitly applies that obligation to automatic fresh entry after
  expiration as well as explicit recovery. Recognition after old-record removal and protocol/provider
  semantics remain B6 decisions; automatic entry is not a freshness exemption.
- [Multi-tenancy — Idle timeout policy](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/multi-tenancy.md#idle-timeout-policy) records a default and policy
  snapshot at authentication. The 2026-10-12 working refinements select a 30-minute omitted timeout,
  a default warning five minutes before expiration (disabled by default at a five-minute timeout), and
  gradual adoption of current timeout/warning configuration on server timer refresh. These refinements
  supersede the snapshot policy after Git/PR approval; temporary differences between sessions are accepted.
- [Session state](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/session-state.md) describes an existing absolute lifetime. These contracts do not adopt
  that lifetime as a product requirement or require removal of absolute-lifetime enforcement.

## Verification context

Application evidence must establish real OIDC redirects, callbacks, session creation, tenant binding, and recovery. Controlled authentication seams may support other outcomes only with independently established authentication behavior and documented assumptions. Fabricated store records do not establish login. Browser observations are needed for user experience; finite application observations do not establish every environment. Detailed former engineering strategies remain in the pre-migration Git history.
