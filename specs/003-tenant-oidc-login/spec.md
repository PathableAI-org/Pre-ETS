# Feature Specification: Tenant OIDC Login Initiation

**Feature Branch**: `003-tenant-oidc-login`

**Created**: 2026-09-16

**Status**: Draft

**Input**: Add OIDC details to general tenant configuration. For a request without an existing session, resolve the tenant and then redirect to that tenant's login page. Include a local OIDC provider in Docker Compose. The in-flight session feature will merge before implementation and provides session creation and storage of the tenant id; its implementation details are not dependencies of this specification.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Reach my tenant's login page (Priority: P1)

A visitor without a valid session opens a tenant application page and is taken automatically to the login page for that tenant's configured identity connection, without selecting an organization or seeing another tenant's login experience.

**Why this priority**: Correct tenant selection must lead to the correct login experience before access continues.

**Independent Test**: Configure two synthetic tenants with distinguishable login destinations. In separate fresh browser contexts, visit each tenant's application address and follow the redirect to its matching provider login page.

**Acceptance Scenarios**:

1. **Given** a known tenant with valid OIDC configuration and no session, **When** a visitor opens its application page, **Then** tenant resolution succeeds first and the browser reaches that tenant's configured provider login page without a tenant chooser or application content being served first.
2. **Given** two tenants with different identity connections, **When** sessionless visits overlap, **Then** each visitor reaches only the connection selected by their resolved tenant.
3. **Given** an unknown or invalid tenant host, **When** a visitor opens the app, **Then** the existing HTTP 403 refusal occurs and no login is initiated.
4. **Given** a resolved tenant, **When** query values or other caller-supplied input name another tenant, issuer, connection, or return host, **Then** those inputs cannot override the resolved tenant's login configuration or approved return destination.
5. **Given** an existing valid session bound to the resolved tenant, **When** a visitor opens an application page, **Then** this feature does not initiate another login and the existing request flow continues.
6. **Given** an expired, invalid, or tenant-mismatched session, **When** the session capability evaluates it, **Then** its existing rejection or invalidation rules remain authoritative; only a resulting sessionless request for a valid resolved tenant can initiate login, and the mismatched session grants no access.

---

### User Story 2 - Configure each tenant's login connection (Priority: P1)

A developer or operator supplies OIDC settings through the existing tenant configuration mechanism, alongside Display Name, so each tenant can use its intended login connection without changing tenant resolution.

**Why this priority**: Tenant-specific login must be driven by trustworthy configuration and fail safely when that configuration is unusable.

**Independent Test**: Supply two tenant configurations, change one tenant's OIDC settings using the documented reload procedure, and verify that only its next sessionless visit changes destination. Exercise incomplete and invalid configurations independently.

**Acceptance Scenarios**:

1. **Given** a tenant configuration, **When** its OIDC settings are supplied, **Then** they identify the OIDC issuer, application client identifier, and tenant-specific broker connection when connection selection is required; Display Name and the tenant id retain their existing meanings.
2. **Given** a provider registration requiring a client credential, **When** configuration is loaded, **Then** the credential is available only to server-side authentication work and is absent from browser content, redirect URLs, diagnostics, and committed examples.
3. **Given** missing or invalid required OIDC settings or unavailable provider metadata needed to start login, **When** a sessionless visitor requests that tenant, **Then** login fails visibly without another tenant's configuration, a default provider, or application access.
4. **Given** two configured tenants, **When** one tenant's login settings change and the documented reload or restart is performed, **Then** a new sessionless visit uses the changed settings while the other tenant's login destination remains unchanged.
5. **Given** an app-owned login failure, **When** the visitor reads it using assistive technology or keyboard navigation, **Then** the error explains that login cannot start, provides an understandable next action, and exposes no credentials or other tenant's details.

---

### User Story 3 - Exercise login locally (Priority: P2)

A developer starts local external services and opens a synthetic tenant address to exercise a real browser redirect to the local OIDC provider without a production identity account.

**Why this priority**: The login entry flow needs a repeatable local demonstration before integration with real tenant identity systems.

**Independent Test**: Follow the local setup instructions from a clean local provider state and reach distinct login experiences for two synthetic tenants, with the application running on the host.

**Acceptance Scenarios**:

1. **Given** the documented local prerequisites and developer-supplied local credentials, **When** the developer starts Docker Compose and configures the documented synthetic tenants, **Then** the local Keycloak OIDC provider is available and both tenant addresses lead to their matching login experience without production accounts or secrets.
2. **Given** the local provider is running, **When** the browser and host-run application use its configured issuer, **Then** both can reach the same issuer address and tenant-specific return destinations correspond to the local application hosts.
3. **Given** the existing explicit development static mode on bare `localhost`, **When** supplied static configuration includes valid OIDC settings and no session exists, **Then** the browser reaches that static tenant's local login connection; missing settings produce a configuration error rather than bypassing login.
4. **Given** local host-associated mode, **When** an unknown tenant host or bare `localhost` is requested, **Then** the existing refusal rules hold even while the provider is running.
5. **Given** the provider is stopped, **When** a developer exercises login, **Then** the app reports initiation failures it can detect, or the browser reports an unreachable provider after redirection; neither outcome grants access or causes an automatic redirect loop.

### Edge Cases

- A Display Name-only record is no longer sufficient to initiate login; document how to add OIDC settings to existing local examples.
- Two tenants may share an issuer or Display Name while requiring different connections. Neither shared value merges their identities.
- A provider can fail before initiation or after the browser leaves the application. The application cannot promise to render an error on an unavailable provider's behalf.
- Requests for static assets or operational health endpoints do not initiate browser login. Non-navigation requests must not be redirected to an HTML login page merely because they lack a session.
- Login initiation and any existing authentication return routes must not recursively trigger the entry redirect. This feature does not implement callback completion.
- Login destinations must use secure transport outside the explicitly local development environment; local HTTP must not become a production fallback.
- Creating a session to retain the tenant id during initiation must not cancel the current redirect or be represented as successful authentication. Session presence is the requested entry condition, not proof of user identity.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Frontend-owned tenant configuration MUST extend the existing Display Name configuration with OIDC issuer identity, application client identifier, and broker connection selection where needed to reach that tenant's login experience. Tenant identity MUST remain the existing tenant id; no new tenant identification mechanism is introduced.
- **FR-002**: Configuration MUST support server-only access to a client credential when required by the provider registration. Credentials MUST NOT appear in browser-visible configuration, redirects, logs, committed fixtures, or examples. The plan MUST choose the concrete field representation and secret-supply mechanism.
- **FR-003**: For application page navigation without an existing valid session, the app MUST resolve the tenant through the existing trusted boundary, load its matching configuration, and initiate an OIDC redirect to its configured provider login page before serving tenant application content.
- **FR-004**: Login initiation MUST use only the resolved tenant's configured issuer, client, and connection. Unknown or invalid hosts MUST retain the existing HTTP 403 behavior. Configuration failure MUST fail closed without provider or tenant substitution.
- **FR-005**: The entry decision MUST consume the existing session capability's validity and tenant-binding result. A valid matching session MUST continue through the existing flow without this feature initiating login; expired, invalid, and mismatched sessions MUST retain the session feature's rejection or invalidation behavior.
- **FR-006**: Login initiation MUST remain bound to the originating tenant and an approved return destination on its application host. Caller input MUST NOT select another tenant, provider, connection, or return host. Initiating login or storing a tenant id MUST NOT mark authentication complete.
- **FR-007**: OIDC settings MUST be validated before login is initiated. Missing required fields, invalid destinations, unavailable required provider metadata, and unusable connection configuration MUST prevent successful initiation when detectable by the app. No failure MAY grant application access or trigger an automatic redirect loop.
- **FR-008**: App-owned login errors MUST be understandable, accessible to assistive technology, and provide a clear next action, such as retrying later or contacting support. Any interactive action MUST be keyboard-operable with visible focus. Diagnostics MUST distinguish configuration and provider failures without exposing sensitive data.
- **FR-009**: Concurrent requests and changes to one tenant's configuration MUST NOT select another tenant's login settings. Existing Display Name behavior MUST remain available whenever the existing session flow permits the landing page to render; sessionless navigation now redirects first.
- **FR-010**: The local Docker Compose setup MUST include Keycloak as the local OIDC provider, consistent with the existing local-services strategy. It MUST remain local-only, use a pinned image, expose services only on loopback, and keep frontend/backend development processes on the host. Existing services supplied by the session feature MUST be preserved.
- **FR-011**: Local instructions MUST cover provider startup and readiness, synthetic tenant/client/connection setup, local credential supply, registered tenant return destinations, configuration reload or restart, and recovery from configuration or provider failures. Browser and host-run application MUST use the same reachable issuer identity. Manual documented provisioning is sufficient; automated import is optional.
- **FR-012**: Local verification MUST support at least two distinguishable synthetic tenant login experiences and the existing bare-localhost static mode. Local static configuration MUST NOT bypass production host binding. No production account, committed credential, or real client record may be required.
- **FR-013**: Automatic login redirection MUST apply to application page navigation, excluding static assets, operational health endpoints, and authentication flow routes that would otherwise cause recursive redirection. Planning MUST map these categories to concrete routes and specify non-navigation behavior without adding backend authentication work to this slice.

### Key Entities _(include if feature involves data)_

- **Tenant configuration**: Existing frontend-owned configuration associated with one tenant id, extended with OIDC login settings while retaining Display Name.
- **OIDC login settings**: Trusted issuer and client identity, any required broker connection selection, and access to required server-only credentials. A connection selects the tenant's identity provider through the broker; tenant SAML metadata remains broker-owned.
- **Session context**: The existing capability's session validity and tenant association. Storage, cookie policy, lifecycle, and session creation contracts remain owned by the preceding feature.
- **Login initiation**: A tenant-bound attempt to send the browser to the configured provider with an approved application return destination. It is not completed authentication.
- **Local provider setup**: The local external identity service and synthetic configuration needed to demonstrate tenant-specific login entry.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Across both synthetic tenants, all sessionless navigation acceptance cases reach the intended login experience with zero manual tenant selection and zero cross-tenant destinations, including overlapping visits.
- **SC-002**: All valid matching-session acceptance cases continue without a new login redirect; all invalid-host cases are refused without initiating login.
- **SC-003**: All specified configuration and tampering rejection cases prevent unintended login destinations and application access, with zero exposed credentials or substituted tenants.
- **SC-004**: A developer following the documented setup from a clean local provider state can demonstrate both tenant login experiences and static-mode login without a production account. Stopping the provider produces the specified failure outcome without a redirect loop.
- **SC-005**: All app-owned failure experiences can be understood with assistive technology, and any recovery action can be completed with the keyboard. Provider-page arrival is verified by the usable login experience, not just the presence of tenant strings in application markup.

## Assumptions

### Evidence and approved decisions

- The user's 2026-09-16 request establishes prefix `003`, tenant OIDC configuration, tenant resolution before sessionless login redirection, and a local Compose OIDC provider.
- The user states the in-flight session feature will merge before implementation and can create a session storing the tenant id. This specification relies on that capability, not its unmerged implementation or internal schema.
- The current [tenant specification](../001-tenant-resolution/spec.md) and frontend tenant contract establish Display Name, tenant slug identity, host-associated resolution, and explicit bare-localhost static development mode. This feature extends the earlier slice's Display Name-only scope and changes the sessionless landing-page outcome to login redirection.
- The [authentication strategy](../../docs/authentication.md), [local-services strategy](../../docs/docker-compose.md), and [constitution](../../.specify/memory/constitution.md) establish frontend authentication ownership, broker-mediated OIDC, tenant isolation, and local Keycloak. These describe architectural intent; they are not evidence that the complete login flow is already implemented.

### Inferred defaults and dependencies

- “Tenant login page” means the configured provider-hosted login experience reached by OIDC initiation. A new app-hosted login screen or tenant picker is not required.
- This bounded slice ends at provider login-page arrival. Completing the callback, establishing authenticated user identity, token handling after login, logout, account provisioning, and backend authorization are outside scope. Return-destination and tenant-binding requirements prepare initiation for later completion without claiming that login works end to end.
- “Request” means browser navigation to an application page for the automatic redirect. Supporting resources and operational requests must remain usable without login loops.
- OIDC settings are required to initiate login; an existing valid matching session is not forced through a new login just because configuration changes. Broader revocation policy remains outside scope.
- Provider choice is already recorded as Keycloak for local development. Exact versions, client library choices, route names, OIDC transaction protection, field schema, and provisioning commands belong to planning.
- Planning and implementation must reconcile the merged session feature's entry flow and Compose services before integration. If its session-presence semantics conflict with this entry condition, resolve that contract explicitly rather than silently treating a tenant-only session as authenticated.
- This feature introduces no durable configuration store, configuration editor, tenant onboarding workflow, session redesign, SAML handling in the app, or production broker deployment.
