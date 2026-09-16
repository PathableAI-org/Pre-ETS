# Feature Specification: Tenant OIDC Login Initiation

**Feature Branch**: `003-tenant-oidc-login`

**Created**: 2026-09-16

**Status**: Draft

**Original input**: Add OIDC details to general tenant configuration. For a request without an existing session, resolve the tenant and then redirect to that tenant's login page. Include a local OIDC provider in Docker Compose. The in-flight session feature will merge before implementation and provides session creation and storage of the tenant id; its implementation details are not dependencies of this specification.

**Current dependency**: The session capability is now merged and present in this checkout. It creates tenant-bound sessions without establishing authenticated user identity. The login-entry decision still distinguishes a presented reusable session from a newly created session for session lifecycle and cookie rules, but neither outcome grants application landing content or suppresses login initiation for unauthenticated document navigations.

## Clarifications

### Session 2026-09-16

- Q: Should a valid tenant-bound session with no authenticated user still initiate login? → A: **Superseded** by the critique product decision below. Earlier same-day answer preserved anonymous matching-session continuation to the existing request flow / landing; that answer no longer applies.
- Q: After initiation (or abandoning the IdP), may an anonymous tenant-bound session reach the application landing page without completed login? (P3) → A: No. A user must NEVER reach the tenant application landing page without logging in. Anonymous tenant-bound sessions (create or reuse) MUST NOT grant application content. Abandoning the IdP and revisiting `/` MUST NOT serve Display Name landing; login initiation (or failure handling) applies until authenticated identity exists. Authenticated identity / callback completion remain out of scope for this slice—so in this slice, successful document navigations to `/` initiate OIDC (or fail); they do not SSR the landing page.
- Q: What accepted evidence trail should reviewers use for this slice's need? (P1) → A: `docs/authentication.md`, `docs/docker-compose.md`, and the merged session module.
- Q: What mid-journey claim does this slice make? (P2) → A: This slice proves provider-page arrival only; callback completion and authenticated access are named follow-ups. Usable-login verification belongs in local quickstart / browser checks, not an end-to-end authenticated claim.
- Q: What is the cost of inaction if this slice is deferred? (P4) → A: Without login initiation plus local Keycloak, tenant-isolated login cannot be demonstrated before callback work.
- Q: What product-level outcomes must login-unavailable failure UX satisfy? (P5) → A: Explain that login cannot start; provide one understandable, keyboard-operable next action (for example retry later or contact support); expose no credentials or other tenant's details. Concrete PathAble composition remains a planning concern.
- Q: How should initiation outage rollback be framed for success measurement? (P6) → A: If initiation errors block all first visits, revert the login-entry path; local Compose services may remain. Detailed operational steps belong in planning / quickstart.
- Q: For missing, invalid, or unreadable required OIDC tenant login configuration, should the existing HTTP 403 forbidden experience use extended copy? (critique Edge Cases & UX P4) → A: Yes. Config refusal still uses existing HTTP 403 forbidden handling (no new route; not `login-unavailable`). The forbidden experience MUST explain that login cannot start, provide an understandable next action (for example contact support or retry after configuration is fixed), remain keyboard- and assistive-technology accessible, and expose no credentials or other tenant's details. Unavailable provider metadata and protected-transaction failures remain distinct service failures on `login-unavailable` and MUST NOT be collapsed into 403.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Reach my tenant's login page (Priority: P1)

An unauthenticated visitor opens a tenant application page and is taken automatically to the login page for that tenant's configured identity connection, without selecting an organization or seeing another tenant's login experience. Application landing content is not served until authenticated identity exists (callback completion is out of scope for this slice).

**Why this priority**: Correct tenant selection must lead to the correct login experience before access continues.

**Independent Test**: Configure two synthetic tenants with distinguishable login destinations. In separate fresh browser contexts, visit each tenant's application address and follow the redirect to its matching provider login page.

**Acceptance Scenarios**:

1. **Given** a known tenant with valid OIDC configuration and no authenticated identity, **When** a visitor opens its application page, **Then** tenant resolution succeeds first and the browser reaches that tenant's configured provider login page without a tenant chooser or application content being served first.
2. **Given** two tenants with different identity connections, **When** unauthenticated visits overlap, **Then** each visitor reaches only the connection selected by their resolved tenant.
3. **Given** an unknown or invalid tenant host, **When** a visitor opens the app, **Then** the existing HTTP 403 refusal occurs and no login is initiated.
4. **Given** a resolved tenant, **When** query values or other caller-supplied input name another tenant, issuer, connection, or return host, **Then** those inputs cannot override the resolved tenant's login configuration or approved return destination.
5. **Given** an existing valid tenant-bound anonymous session (presented reusable session with no authenticated identity), **When** a visitor opens an application page, **Then** this feature initiates login (or fails closed per configuration / provider rules) and MUST NOT continue to application landing content; re-initiation until callback exists is correct and MUST NOT be implemented as an automatic redirect loop.
6. **Given** an expired, invalid, or tenant-mismatched presented session, **When** the session capability evaluates it for a valid resolved tenant, **Then** its existing replacement and failure rules remain authoritative; creating a replacement session does not suppress login initiation for that request, and the rejected session grants no access.
7. **Given** a resolved tenant and no authenticated identity, **When** login begins, **Then** the authorization-code request uses PKCE and fresh unpredictable state and nonce bound to that attempt, its originating browser and tenant, expected issuer, client and connection, and approved return destination; the PKCE verifier remains server-side.
8. **Given** the app cannot establish the protected login transaction, **When** an unauthenticated visitor opens an application page, **Then** login fails visibly without an unprotected provider redirect or application access.

---

### User Story 2 - Configure each tenant's login connection (Priority: P1)

A developer or operator supplies OIDC settings through the existing tenant configuration mechanism, alongside Display Name, so each tenant can use its intended login connection without changing tenant resolution.

**Why this priority**: Tenant-specific login must be driven by trustworthy configuration and fail safely when that configuration is unusable.

**Independent Test**: Supply two tenant configurations, change one tenant's OIDC settings using the documented reload procedure, and verify that only its next unauthenticated visit changes destination. Exercise incomplete and invalid configurations independently.

**Acceptance Scenarios**:

1. **Given** a tenant configuration, **When** its OIDC settings are supplied, **Then** they identify the OIDC issuer, application client identifier, required trusted registration mode (`public` or `confidential`), and tenant-specific broker connection when connection selection is required; Display Name and the tenant id retain their existing meanings.
2. **Given** a provider registration with trusted mode `confidential`, **When** configuration is loaded, **Then** the credential is available only to server-side authentication work and is absent from browser content, redirect URLs, diagnostics, and committed examples. **Given** trusted mode `public`, **When** configuration is loaded, **Then** no client credential is required.
3. **Given** required tenant login configuration cannot be read or is missing or invalid, **When** an unauthenticated visitor requests that tenant, **Then** the existing forbidden handling returns HTTP 403 (no new route; not `login-unavailable`) without another tenant's configuration, a default provider, or application access; the forbidden experience explains that login cannot start, provides an understandable next action, remains accessible, and exposes no credentials or other tenant's details.
4. **Given** two configured tenants, **When** one tenant's login settings change and the documented reload or restart is performed, **Then** a new unauthenticated visit uses the changed settings while the other tenant's login destination remains unchanged.
5. **Given** an app-owned login failure (OIDC-config HTTP 403 forbidden or `login-unavailable` service failure), **When** the visitor reads it using assistive technology or keyboard navigation, **Then** the error explains that login cannot start, provides an understandable next action, and exposes no credentials or other tenant's details.
6. **Given** valid tenant login configuration but unavailable required provider metadata, **When** an unauthenticated visitor requests that tenant, **Then** an accessible `login-unavailable` provider failure prevents login initiation and application access without an automatic redirect loop or collapse into HTTP 403.

---

### User Story 3 - Exercise login locally (Priority: P2)

A developer starts local external services and opens a synthetic tenant address to exercise a real browser redirect to the local OIDC provider without a production identity account.

**Why this priority**: The login entry flow needs a repeatable local demonstration before integration with real tenant identity systems.

**Independent Test**: Follow the local setup instructions from a clean local provider state and reach distinct login experiences for two synthetic tenants, with the application running on the host.

**Acceptance Scenarios**:

1. **Given** the documented local prerequisites and developer-supplied local credentials, **When** the developer starts Docker Compose and configures the documented synthetic tenants, **Then** the local Keycloak OIDC provider is available and both tenant addresses lead to their matching login experience without production accounts or secrets.
2. **Given** the local provider is running, **When** the browser and host-run application use its configured issuer, **Then** both can reach the same issuer address and tenant-specific return destinations correspond to the local application hosts.
3. **Given** the existing explicit development static mode on bare `localhost`, **When** supplied static configuration includes valid OIDC settings and no authenticated identity exists, **Then** the browser reaches that static tenant's local login connection; missing settings use the existing forbidden handling with HTTP 403 rather than bypassing login.
4. **Given** local host-associated mode, **When** an unknown tenant host or bare `localhost` is requested, **Then** the existing refusal rules hold even while the provider is running.
5. **Given** the provider is stopped, **When** a developer exercises login, **Then** the app reports initiation failures it can detect, or the browser reports an unreachable provider after redirection; neither outcome grants access or causes an automatic redirect loop.

### Edge Cases

- A Display Name-only record is no longer sufficient to initiate login; document how to add OIDC settings to existing local examples.
- Two tenants may share an issuer or Display Name while requiring different connections. Neither shared value merges their identities.
- A provider can fail before initiation or after the browser leaves the application. The application cannot promise to render an error on an unavailable provider's behalf.
- Requests for static assets or operational health endpoints do not initiate browser login. Non-navigation requests must not be redirected to an HTML login page merely because they lack a session.
- Login initiation and any existing authentication return routes must not recursively trigger the entry redirect. This feature does not implement callback completion. Re-initiating login on later unauthenticated document visits until callback exists is expected; that MUST NOT become an automatic redirect loop against initiation or failure routes.
- Login destinations must use secure transport outside the explicitly local development environment; local HTTP must not become a production fallback.
- Creating a session to retain the tenant id during initiation must not cancel the current redirect or be represented as successful authentication. Session lifecycle still distinguishes a reusable session presented with the incoming request from a session newly created during that request (for cookie and create/reuse mapping), but neither presented reuse nor create grants application landing content or suppresses login initiation without authenticated identity. A tenant-bound anonymous session is not proof of user identity and does not unlock Display Name landing.
- Every admitted request has an identified tenant. Unknown or invalid tenants receive HTTP 403; a session without an authenticated user does not mean an unidentified tenant.
- Failure to read or validate required tenant login configuration uses the existing forbidden handling with HTTP 403. This does not introduce a new forbidden route or redirect destination and MUST NOT use `login-unavailable`. The forbidden experience MUST explain that login cannot start, provide an understandable next action (for example contact support or retry after configuration is fixed), remain keyboard- and assistive-technology accessible, and expose no credentials or other tenant's details (see also FR-007, FR-008, and SC-005).
- Unavailable provider metadata and protected-transaction failures remain distinct service failures on `login-unavailable` and MUST NOT be collapsed into HTTP 403. App-owned `login-unavailable` experiences MUST explain that login cannot start, provide one understandable keyboard-operable next action, and expose no credentials or cross-tenant details (see also SC-005 and FR-008).
- If initiation errors block all first visits, the product rollback mindset is to revert the login-entry path; local Compose services may remain. Operational detail belongs in planning / quickstart.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Frontend-owned tenant configuration MUST extend the existing Display Name configuration with OIDC issuer identity, application client identifier, a required trusted client registration mode (`public` or `confidential`), and broker connection selection where needed to reach that tenant's login experience. Tenant identity MUST remain the existing tenant id; no new tenant identification mechanism is introduced. Registration mode MUST NOT be inferred from provider discovery.
- **FR-002**: Configuration MUST support server-only access to a client credential when the trusted registration mode is `confidential`. Credentials MUST NOT appear in browser-visible configuration, redirects, logs, committed fixtures, or examples. When mode is `confidential`, a missing or blank server-only credential for that tenant MUST fail closed as invalid login configuration. When mode is `public`, a client credential MUST NOT be required. The plan chooses the concrete field representation (`oidc.clientAuth`) and secret-supply mechanism (`OIDC_CLIENT_SECRETS_JSON`).
- **FR-003**: For application page (document) navigation without authenticated identity, the app MUST resolve the tenant through the existing trusted boundary, load its matching configuration, and initiate an OIDC redirect to its configured provider login page before serving tenant application content—whether or not a tenant-bound anonymous session is presented or created.
- **FR-004**: Login initiation MUST use only the resolved tenant's configured issuer, client, and connection. Unknown or invalid hosts MUST retain the existing HTTP 403 behavior. Failure to read or validate required tenant login configuration MUST use the existing forbidden handling with HTTP 403, without provider or tenant substitution.
- **FR-005**: The entry decision MUST distinguish a reusable session presented on the incoming request from a new session created during that request, using the existing session capability's validity and tenant-binding result, for session lifecycle and cookie rules. A presented reusable session and a newly created anonymous session MUST NOT suppress login initiation or grant application landing content without authenticated identity. For unauthenticated ready outcomes, both `reuse` and `create` MUST initiate login when required login configuration is usable (subject to provider and transaction rules) for document navigations. Missing, expired, invalid, and mismatched sessions MUST retain the session feature's replacement and failure behavior. Terminal session or tenant failures MUST remain terminal. Planning MUST map this distinction to the merged session capability's `reuse`/`create` outcomes without treating either as authenticated access or landing eligibility.
- **FR-006**: Login initiation MUST use authorization code with PKCE and fresh, unpredictable state and nonce for each attempt. Protected transaction context MUST bind those values to the originating browser and tenant, expected issuer, client and connection, and an approved return destination on its application host, with the PKCE verifier retained server-side for later callback verification. If that context cannot be established, initiation MUST fail closed without redirecting to the provider or serving application content. Caller input MUST NOT select another tenant, provider, connection, or return host. Initiating login or storing a tenant id MUST NOT mark authentication complete. Callback processing and verification remain outside this slice; transaction creation and binding are required now.
- **FR-007**: OIDC settings MUST be validated before login is initiated. Missing required fields, invalid destinations, unreadable login configuration, and unusable connection configuration MUST use the existing HTTP 403 forbidden handling when detectable by the app (no new route; not `login-unavailable`). That forbidden experience MUST explain that login cannot start, provide an understandable next action, remain accessible to assistive technology and keyboard use, and expose no credentials or other tenant's details. Unavailable required provider metadata and inability to establish protected transaction context MUST prevent initiation with an accessible service failure on `login-unavailable`; they are distinct from tenant configuration refusal and MUST NOT be collapsed into HTTP 403. No failure MAY grant application access or trigger an automatic redirect loop.
- **FR-008**: App-owned login errors—including the existing HTTP 403 forbidden experience for OIDC login-configuration refusal and `login-unavailable` service failures—MUST be understandable, accessible to assistive technology, and provide a clear next action, such as retrying later, contacting support, or retrying after configuration is fixed. Any interactive action MUST be keyboard-operable with visible focus. Diagnostics MUST distinguish configuration and provider failures without exposing sensitive data. OIDC-config refusal MUST retain existing HTTP 403 handling and MUST NOT introduce a new route or use `login-unavailable`.
- **FR-009**: Concurrent requests and changes to one tenant's configuration MUST NOT select another tenant's login settings. Display Name landing remains a deferred authenticated-access concern; in this slice, unauthenticated document navigation MUST initiate login (or fail) and MUST NOT SSR the Display Name landing page.
- **FR-010**: The local Docker Compose setup MUST include Keycloak as the local OIDC provider, consistent with the existing local-services strategy. It MUST remain local-only, use a pinned image, expose services only on loopback, and keep frontend/backend development processes on the host. Existing services supplied by the session feature MUST be preserved.
- **FR-011**: Local instructions MUST cover provider startup and readiness, synthetic tenant/client/connection setup, local credential supply, registered tenant return destinations, configuration reload or restart, and recovery from configuration or provider failures. Browser and host-run application MUST use the same reachable issuer identity. Manual documented provisioning is sufficient; automated import is optional.
- **FR-012**: Local verification MUST support at least two distinguishable synthetic tenant login experiences and the existing bare-localhost static mode. Local static configuration MUST NOT bypass production host binding. No production account, committed credential, or real client record may be required.
- **FR-013**: Automatic login redirection MUST apply to application page navigation, excluding static assets, operational health endpoints, and authentication flow routes that would otherwise cause recursive redirection. Planning MUST map these categories to concrete routes and specify non-navigation behavior without adding backend authentication work to this slice.

### Key Entities _(include if feature involves data)_

- **Tenant configuration**: Existing frontend-owned configuration associated with one tenant id, extended with OIDC login settings while retaining Display Name.
- **OIDC login settings**: Trusted issuer and client identity, required registration mode (`public` or `confidential`), any required broker connection selection, and access to required server-only credentials when confidential. A connection selects the tenant's identity provider through the broker; tenant SAML metadata remains broker-owned.
- **Session context**: The existing capability's session validity and tenant association. Storage, cookie policy, lifecycle, and session creation contracts remain owned by the preceding feature. Anonymous tenant-bound sessions are not authenticated identity and do not authorize application landing content.
- **Login initiation**: A tenant-bound authorization-code attempt to send the browser to the configured provider with an approved application return destination, PKCE, and protected state and nonce context. It is not completed authentication.
- **Local provider setup**: The local external identity service and synthetic configuration needed to demonstrate tenant-specific login entry.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Across both synthetic tenants, all unauthenticated navigation acceptance cases reach the intended login experience with zero manual tenant selection and zero cross-tenant destinations, including overlapping visits.
- **SC-002**: Unauthenticated document visits—including those with a valid tenant-bound anonymous reusable session—MUST NOT receive application landing content; they initiate login or fail closed as specified. All invalid-host and required-login-configuration failure cases receive HTTP 403 without initiating login. Authenticated continuation after callback remains out of scope / deferred and is not a success signal for this slice.
- **SC-003**: All specified configuration and tampering rejection cases prevent unintended login destinations and application access, with zero exposed credentials or substituted tenants.
- **SC-004**: A developer following the documented setup from a clean local provider state can demonstrate both tenant login experiences and static-mode login without a production account. Stopping the provider produces the specified failure outcome without a redirect loop.
- **SC-005**: All app-owned failure experiences—including OIDC-config HTTP 403 forbidden and `login-unavailable`—can be understood with assistive technology, and any recovery action can be completed with the keyboard. Provider-page arrival is verified by the usable login experience, not just the presence of tenant strings in application markup. Next-action clarity is in scope for both extended forbidden copy on config refusal and `login-unavailable` service failures (see Edge Cases / critique P4 and P5).
- **SC-006**: Reviewers can relate acceptance outcomes to the accepted evidence trail (`docs/authentication.md`, `docs/docker-compose.md`, merged session module) and to the mid-journey boundary (provider-page arrival only). If initiation errors block all first visits, the documented rollback mindset is to revert the login-entry path while local Compose services may remain (P6).

## Assumptions

### Evidence and approved decisions

- The user's 2026-09-16 request establishes prefix `003`, tenant OIDC configuration, tenant resolution before sessionless login redirection, and a local Compose OIDC provider.
- The user stated the session feature would merge before implementation and could create a session storing the tenant id. It is now present in the checkout: `packages/frontend/src/lib/session/setup.ts` creates or reuses tenant-bound sessions, and `types.ts` defines records containing tenant id and expiry without an authenticated-user marker. These sessions are not evidence of completed authentication and do not authorize application landing content.
- The current [tenant specification](../001-tenant-resolution/spec.md) and frontend tenant contract establish Display Name, tenant slug identity, host-associated resolution, and explicit bare-localhost static development mode. This feature extends the earlier slice's Display Name-only scope and changes unauthenticated `/` document navigation from Display Name landing to login initiation (or failure).
- Accepted need evidence for this slice includes the [authentication strategy](../../docs/authentication.md), [local-services strategy](../../docs/docker-compose.md), the merged session module, and the [constitution](../../.specify/memory/constitution.md). These establish frontend authentication ownership, broker-mediated OIDC, tenant isolation, and local Keycloak as architectural intent; they are not evidence that the complete login flow is already implemented (P1).
- The authentication strategy already requires authorization code with PKCE and tenant-bound state/nonce. FR-006 makes those initiation obligations explicit; it does not add callback completion to this slice.
- Stakeholder critique decision (2026-09-16, P3): anonymous session after initiation or abandon-IdP does not unlock landing; landing requires completed login (later slice). This supersedes the earlier same-day clarification that preserved matching-session continuation to landing.
- Stakeholder critique decision (2026-09-16, Edge Cases & UX P4): extend forbidden copy for OIDC login-configuration refusal while retaining existing HTTP 403 handling (no new route; not `login-unavailable`). Provider-metadata unavailability and protected-transaction failures remain distinct `login-unavailable` service failures.

### Inferred defaults and dependencies

- “Tenant login page” means the configured provider-hosted login experience reached by OIDC initiation. A new app-hosted login screen or tenant picker is not required.
- This bounded slice ends at provider login-page arrival. Completing the callback, establishing authenticated user identity, token handling after login, logout, account provisioning, and backend authorization are outside scope. This slice proves provider-page arrival only; authenticated access is a named follow-up (P2). Return-destination and tenant-binding requirements prepare initiation for later completion without claiming that login works end to end.
- Cost of inaction (P4): without initiation plus local Keycloak, tenant-isolated login cannot be demonstrated before callback work.
- “Request” means browser navigation to an application page for the automatic redirect. Supporting resources and operational requests must remain usable without login loops.
- OIDC settings are required to initiate login for unauthenticated document navigations, including when a valid anonymous matching session is presented. Broader authenticated-session revocation policy remains outside scope.
- Provider choice is already recorded as Keycloak for local development. Exact versions, client library choices, route names, transaction storage and encoding, field schema, and provisioning commands belong to planning. Planning must preserve the transaction protection required by FR-006.
- The clarified entry rule distinguishes presented reusable vs newly created sessions for lifecycle/cookie mapping to setup `reuse`/`create`, but both unauthenticated ready outcomes initiate login (subject to config) for document navigations. This feature does not turn session presence into authenticated identity. Planning must preserve create/reuse/terminal mapping and existing Compose services, and must not treat anonymous `reuse` as landing eligibility.
- This feature introduces no durable configuration store, configuration editor, tenant onboarding workflow, session redesign, SAML handling in the app, or production broker deployment.
