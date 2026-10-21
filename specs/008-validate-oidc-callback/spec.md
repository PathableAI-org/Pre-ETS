# Feature Specification: Validate the OIDC Callback

**Feature Branch**: `155-validate-oidc-callback`

**Created**: 2026-10-20

**Status**: Draft

**Input**: User description: "Specify issue #217, Validate the OIDC callback, including requirement-backed BDD changes."

**Issue and scope**: [#217](https://github.com/PathableAI-org/Pre-ETS/issues/217) is S2-C, a native child of
[#153](https://github.com/PathableAI-org/Pre-ETS/issues/153) under
[#152](https://github.com/PathableAI-org/Pre-ETS/issues/152). Its start prerequisite, #216, is complete on the
inspected `origin/main` baseline `b514237d5ffc49180ad683a5cfe77b808cc19c5c`. This feature connects the
already-delivered tenant OIDC initiation to trustworthy callback validation. It does not create an authenticated
application session, grant protected access, or complete application-wide callback/error integration.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Complete the selected tenant's provider callback (Priority: P1)

As a visitor who began sign-in for an organization, I can return from that organization's identity provider and
have the response validated as belonging to my original login attempt, even when a different running application
instance receives the callback.

**Why this priority**: A provider redirect is not useful until the application can recover the originating attempt,
validate real provider evidence, and produce a trustworthy identity for downstream session establishment.

**Independent Test**: Begin authentication through one independently running application instance, complete the
flow with the repository's real local provider, and deliver the callback to another instance under the same
registered tenant authority. At the HTTP/browser boundary, observe the validated-success 204 response, cleared
correlation cookie, and absence of an authenticated application session or protected content. Separately, at the
public authentication-service boundary, prove that this accepted callback yields exactly the expected tenant,
issuer, subject, and signed `auth_time`. Together these observations establish the trusted identity handoff without
exposing identity through the 204 response.

**Acceptance Scenarios**:

1. **Given** a valid tenant-specific login attempt initiated through application instance A, **When** the configured
   provider returns a valid callback to instance B, **Then** the callback is matched to the original tenant and
   attempt and produces a trusted identity handoff for that tenant.
2. **Given** successful callback validation, **When** the callback response completes, **Then** no authenticated
   application session is created and no protected application content is granted by this feature.
3. **Given** a public or confidential client configuration accepted for the resolved tenant, **When** a valid
   callback is completed, **Then** the same tenant-configured OIDC contract is honored without exposing credentials,
   tokens, the verifier, or raw provider payloads through application-produced output or diagnostics.

---

### User Story 2 - Reject mismatched, invalid, expired, or replayed callbacks (Priority: P1)

As a visitor or tenant, I am protected from a callback being detached from its original login, moved between
tenants, altered, used after its recovery window, or consumed more than once.

**Why this priority**: Callback acceptance without transaction integrity and one-time tenant binding could turn a
public endpoint into a cross-tenant access or replay path.

**Independent Test**: Exercise callbacks with missing, malformed, mismatched, cross-tenant, expired, and previously
consumed transaction evidence. Each request is denied at the callback boundary, yields no trusted identity handoff,
creates no authenticated application session, and reveals no protected or secret material.

**Acceptance Scenarios**:

1. **Given** a callback whose tenant, browser correlation, state, nonce, return authority, or other transaction
   evidence does not match the recovered attempt, **When** validation runs, **Then** the callback fails closed without
   a trusted identity handoff, authenticated application session, or protected content.
2. **Given** no recoverable attempt, an expired attempt, or an invalid browser correlation artifact, **When** the
   callback is requested, **Then** it is denied without substituting a tenant or restarting login automatically.
3. **Given** a callback transaction that has already been consumed, **When** the callback is submitted again, **Then**
   the replay is denied and the first consumption cannot be repeated.
4. **Given** two callbacks race to consume the same valid attempt while the callback dependencies are healthy,
   **When** both are processed, **Then** exactly one produces a trusted identity handoff and all others are denied.
   Under arbitrary operational failure, at most one handoff remains the safety invariant.

---

### User Story 3 - Fail closed on provider denial or untrusted identity evidence (Priority: P1)

As a visitor whose provider sign-in is cancelled, fails, or returns evidence that cannot be trusted, I remain
unauthenticated and do not receive protected content or another tenant's identity.

**Why this priority**: Cancellation and invalid provider responses are normal security-boundary outcomes and must be
as safe as transaction mismatch or replay.

**Independent Test**: Deliver a controlled provider-error callback at the real public HTTP boundary and exercise
responses with missing, invalid, or incorrectly bound signed identity evidence. Observe denial with no trusted
identity handoff, authenticated application session, protected content, application re-emission of the provider
response, or secret disclosure.
Claim real-provider cancellation only if the local provider UI actually emits it; otherwise record that evidence as
unexecuted.

**Acceptance Scenarios**:

1. **Given** the provider returns cancellation or failure, **When** the public callback receives it, **Then** the
   outcome fails closed, consumes or invalidates the matching attempt as appropriate for one-time use, and leaves
   authenticated application access unavailable.
2. **Given** the provider response cannot be validated for the configured tenant, client, issuer, audience,
   signature, nonce, authorization-code exchange, or required identity claims, **When** callback validation runs,
   **Then** no trusted identity handoff is produced.
3. **Given** a signed identity token without the selected `auth_time` evidence, **When** callback validation runs,
   **Then** the callback is rejected. This feature does not define the still-open authentication-time comparison,
   clock tolerance, broker/provider support, or unsupported-provider behavior.

### Edge Cases

- The login is initiated on one application instance and returned to another without client affinity.
- Two tenants use distinguishable provider/client configurations and their callbacks are interleaved.
- A browser sends a valid transaction reference on the wrong tenant host or a callback for one tenant is directed
  to another tenant's callback boundary.
- The transaction exists but is expired, already consumed, concurrently consumed, or no longer recoverable.
- The callback omits required parameters, contains duplicated or malformed parameters, or mixes success and error
  responses.
- The provider refuses the request, the visitor cancels, code exchange fails, or signed identity evidence is
  absent, invalid, or bound to a different transaction or tenant.
- The inbound browser callback URL necessarily carries `code`, `state`, or provider error parameters. The application
  must consume them without re-emitting them in response bodies, response headers or redirect locations, cookies,
  diagnostic JSON, retained application state, or application-controlled telemetry.
- Successful validation is followed by a downstream consumer failure. The validated identity still does not itself
  become an authenticated application session or grant protected access.
- Public callback access must retain normal tenant resolution and configuration validation. It must not use a
  fallback tenant, bypass tenant failure behavior, or trigger an automatic login loop.
- Current local provider evidence may establish Keycloak behavior only. Microsoft and broker-chain compatibility
  remain unexecuted until exercised against those actual integrations.

## Requirements _(mandatory)_

### Functional Requirements

These are feature-local acceptance statements derived from the accepted durable contracts on the recorded
`origin/main` baseline. They do not create new durable requirement IDs or resolve the open B6 policies.

- **FR-001**: Before redirecting the browser to the provider, the system MUST make the tenant-bound authentication
  attempt recoverable across the provider round trip and across independently running application instances.
  Sources: SESSION-002 AC1–2 and the approved S2-C handoff from #216.
- **FR-002**: Browser correlation MUST identify the originating attempt without exposing provider credentials,
  tokens, the proof verifier, raw provider payloads, trusted identity, or other secret material. Sources:
  SECURITY-001 AC1–2 and SESSION-002 AC1.
- **FR-003**: The callback MUST independently resolve and validate its request tenant, recover the attempt, and
  confirm that the request tenant, configured integration, callback authority, browser correlation, singular
  provider state, and recovered attempt all belong to the same login. Host/tenant, exact callback authority, query
  shape, and singular state MUST be validated before one-time consumption is attempted. A wrong tenant, authority,
  missing/duplicate/wrong state, or malformed callback MUST NOT consume an otherwise valid attempt. No fallback
  tenant is permitted. Sources: SESSION-002 AC1–2 and the constitution's tenant-isolation principle.
- **FR-004**: Recovery and consumption of an authentication attempt MUST be atomic and one-time. Missing, invalid,
  expired, consumed, or concurrently replayed attempts MUST NOT produce a trusted identity handoff. Creating a new
  attempt MUST NOT replace an already recoverable attempt at the same qualified address. Source: the approved S2-C
  transaction lifecycle and SESSION-003 AC2 prerequisite.
- **FR-005**: For a successful provider response, validation MUST establish transaction integrity and validate the
  authorization response, authorization-code exchange, signed identity evidence, issuer/client binding, audience,
  signature, nonce, and required identity claims before producing a trusted identity handoff. Sources:
  SESSION-002 AC1–2 and SESSION-003 AC1 prerequisite.
- **FR-006**: A trusted identity handoff MUST identify the validated user and originating tenant and MUST be usable by
  #218's later session-creation consumer without coupling application policy to a provider vendor. It MUST NOT be an
  authenticated application session or authorize protected access by itself. Sources: SESSION-002 AC2 and
  SESSION-003 AC1–2 partial prerequisite.
- **FR-007**: Provider failure, visitor cancellation, malformed or contradictory response parameters, failed code
  exchange, invalid signed identity evidence, missing required identity claims, tenant mismatch, and transaction
  mismatch MUST fail closed without a trusted identity handoff, authenticated application session, or protected
  content. Sources: SESSION-002 callback verification plan and SESSION-003 AC2.
- **FR-008**: The selected freshness baseline for this slice MUST validate that signed identity evidence contains
  `auth_time` and MUST reject missing evidence. The feature MUST NOT define or claim stale-time comparison, allowed
  clock tolerance, broker/provider support, or unsupported-provider handling; those remain open under #158/B6.
  Sources: SESSION-013 selected protocol baseline and open questions.
- **FR-009**: The callback MUST remain publicly reachable without an application session while retaining tenant
  resolution, tenant configuration validation, sign-in-failure, `/_test`, diagnostic, and safe-public-asset
  constraints. Public reachability MUST NOT imply callback acceptance. Sources: SESSION-002 and approved S1/S2
  public-boundary context.
- **FR-010**: Tenant configuration and diagnostics MUST remain non-secret. If a configured client requires a
  credential, it MUST be resolved only through a vendor-neutral server-only boundary and MUST NOT appear in tenant
  configuration, browser-visible artifacts, callback output, or diagnostic responses. Sources: SECURITY-001 AC1–3
  and SESSION-002 AC1.
- **FR-011**: The inbound callback URL necessarily transports the authorization `code`, `state`, or provider error
  parameters. The application MUST consume those values without re-emitting them in response bodies, response
  headers or redirect locations, cookies, diagnostics, retained application state, or application-controlled
  telemetry. Application-produced callback outcomes MUST NOT expose protected content, access or identity tokens,
  credentials, proof verifiers, raw provider payloads, or other secret transaction material. BDD inspects
  application output, not the absence of protocol parameters from its own inbound request. Durable application-
  controlled telemetry claims require separate manual/runtime inspection. Sources: SECURITY-001 and repository
  observability-testing policy.
- **FR-012**: The implementation increment MUST revise the existing requirement-backed initiation BDD so it no
  longer claims the absence of all correlation state after `/auth/login`, while continuing to prove that initiation
  creates no authenticated application session or protected access. Source: #216-to-#217 observable handoff.
- **FR-013**: The implementation increment MUST add bounded requirement-backed callback-validation BDD at the actual
  callback boundary covering real local-provider completion, cross-tenant or transaction mismatch, missing or
  invalid transaction, expiry, replay, provider failure or cancellation, and freshness only to the approved extent.
  The feature MUST remain tagged `@partial` while session creation, protected access, complete freshness, and
  Microsoft compatibility remain downstream. Sources: SESSION-002/003 verification plans, SESSION-013 limitations,
  and the repository requirements-BDD policy.

### External contract expectations

| Boundary | Expected observable contract | Partial limit |
| --- | --- | --- |
| Authentication initiation | Creates a recoverable, tenant-bound attempt before provider delegation and gives the browser only safe correlation state | Does not create an authenticated application session or prove provider completion |
| Cross-instance round trip | An attempt begun through one running instance can be recovered and consumed by another | Does not establish #218's distributed application-session record or cookie contract |
| Public callback request | Independently resolves the request tenant and validates correlation, transaction, provider response, signed identity evidence, and tenant binding | Public reachability is not acceptance; comprehensive callback/error presentation belongs to #154 |
| Attempt consumption | Exactly one valid consumer can obtain a trusted identity handoff; expiry, invalidity, races, and replay fail closed | Representation, storage technology, and cleanup mechanism remain implementation choices |
| Trusted identity handoff | Carries only validated user and tenant identity needed by a downstream session consumer | Is not an application session, cookie, authorization decision, or grant of protected access |
| Provider failure or cancellation | Produces a denied authentication outcome with no usable trusted identity | Exact user-facing presentation and recovery composition remain #154/#157 work |
| Freshness evidence | Validates signed `auth_time` presence and preserves `max_age=0` request-side evidence | Staleness comparison, tolerance, broker/provider support, and unsupported-provider policy remain #158/B6 work |
| Configuration and secrets | Supports the accepted public/confidential tenant contract with any credential resolved server-side and never disclosed | No vendor-specific secret backend, provider policy, or diagnostic redaction contract is introduced |

### Relevant requirements and partial contribution

| Durable requirement | Contribution targeted here | Remaining after this feature |
| --- | --- | --- |
| [PREETS-SESSION-002](../../docs/requirements/session/PREETS-SESSION-002.md) AC1–3 | Complete the tenant-specific provider round trip, including recoverable correlation and callback validation, without a local credential experience | Real Microsoft and relevant broker-chain compatibility remain unexecuted; application-wide composition remains #154 |
| [PREETS-SESSION-003](../../docs/requirements/session/PREETS-SESSION-003.md) AC1–2 | Produce trusted user/tenant identity and prove rejected callbacks cannot create a session; this is a validated-identity prerequisite only | #218 creates the authenticated application session; later protected access completes AC1–3 |
| [PREETS-SECURITY-001](../../docs/requirements/security/PREETS-SECURITY-001.md) AC1–3 | Preserve non-secret tenant/diagnostic configuration and separate any required client credential behind a server-only vendor-neutral boundary | External producer/content-control limits and any concrete secret provider integration remain outside this feature |
| [PREETS-SESSION-013](../../docs/requirements/session/PREETS-SESSION-013.md) selected baseline | Validate signed `auth_time` presence alongside the already-delivered `max_age=0` request | Comparison to the login transaction, clock tolerance, provider/broker support, stale handling policy, recovery, and new-session establishment remain #158/B6 |

### Expected requirements BDD changes

These are planned implementation-PR changes under `tests/bdd/requirements/`; this `$speckit-specify` execution does
not create active Gherkin, step bindings, or runtime evidence. Use the repository's
[requirements BDD author workflow](../../.agents/skills/requirements-bdd-author/SKILL.md), inspect the then-current
`origin/main` requirements again, and keep every scenario executable rather than treating `@partial` as a skip.

1. **Revise `tenant-oidc-initiation.feature`.** Replace the broad post-login assertion that no correlation cookie or
   state is issued with an outcome that distinguishes safe recoverable correlation from an authenticated
   application session. Retain the proof that root denial and initiation return no protected content and do not
   establish authenticated application access. Update the feature description so callback recovery is no longer
   listed as entirely absent, while callback validation and session establishment remain outside that initiation
   feature. Preserve lowercase requirement tags and feature-level `@partial`.
2. **Add `tenant-oidc-callback.feature`.** Use feature-level `@partial` and only lowercase IDs from the accepted
   requirements. Tag tenant/provider completion with `@preets-session-002`; tag the bounded validated-success and
   denied-session outcomes with `@preets-session-003` only as the HTTP/browser portion of composite evidence; add
   `@preets-security-001` only where the scenario directly observes the non-secret/server-only contract. Add
   `@preets-session-013` to BDD only if an actual callback scenario observably rejects missing signed `auth_time`;
   otherwise retain that trace solely in public-service evidence, never on a 204 that cannot expose the field.
   Cover:
   - a complete real Keycloak round trip through the actual callback boundary, initiated on one application
     instance and returned to another;
   - cross-tenant and correlation/transaction mismatch;
   - missing, invalid, and expired transaction recovery;
   - first consumption followed by replay, plus a concurrent-consumption case at the responsible boundary;
   - an application-handled controlled provider-error callback at the public HTTP boundary; add real Keycloak
     cancellation evidence only when the provider UI actually emits that response, otherwise record real-provider
     cancellation as unexecuted;
   - invalid signed identity evidence and missing signed `auth_time` only where the actual callback harness can
     attribute the public rejection; otherwise retain the exact public-service evidence and record the BDD limit,
     without inventing a staleness threshold;
   - successful validation producing the bounded empty 204, clearing correlation, and yielding no application
     session or protected access. Exact trusted tenant/issuer/subject/`auth_time` values remain public-service
     evidence and are not inspected through the 204 response.

Real provider completion must observe application outcomes at the actual callback boundary; prepared identities or
mocked callbacks alone cannot establish that claim. Protocol and atomic-consumption properties may use focused
public-capability evidence where browser BDD would obscure the responsible boundary. Durable tests must assert
application outcomes, not logs, spans, telemetry payloads, exporter behavior, raw secrets, or private storage shape.
Record Microsoft and broker-chain scenarios as unexecuted limitations until actual integrations are exercised.

### Key Entities

- **Authentication attempt**: A short-lived, tenant-bound login transaction created before provider delegation. It
  carries the integrity and return context needed to validate one callback, including proof material that must never
  be browser-visible.
- **Browser correlation artifact**: Opaque, non-secret browser state that lets the callback locate the originating
  attempt. It confers no identity or access by possession alone.
- **Provider response**: The success, cancellation, or failure returned to the public callback and the signed
  identity evidence obtained through the configured tenant integration.
- **Resolved callback tenant**: The independently selected tenant for the callback request; it must agree with the
  recovered attempt and validated provider evidence.
- **Trusted identity handoff**: The validated user-and-tenant result available to #218's future session consumer. It
  is not an application session and cannot authorize protected access by itself.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In every exercised valid local-provider round trip, including initiation and callback on different
  running application instances under one registered tenant authority, the HTTP/browser boundary produces one
  validated-success 204, clears correlation, and produces zero authenticated application sessions or protected
  content; corresponding public `AuthenticationService` evidence produces exactly one handoff with the expected
  tenant, issuer, subject, and signed `auth_time`.
- **SC-002**: One hundred percent of exercised missing, invalid, expired, mismatched, cross-tenant, cancelled,
  provider-failed, and invalid-identity cases produce no trusted identity handoff, no authenticated application
  session, and no protected content.
- **SC-003**: In every healthy exercised race for one valid attempt, exactly one callback produces a trusted
  identity handoff and all other consumers are denied. After that consumption, one hundred percent of exercised
  sequential replays produce no additional handoff; under arbitrary operational failure, at most one handoff is the
  retained safety invariant.
- **SC-004**: Across every exercised success and rejection path, application-produced response bodies, response
  headers and redirect locations, cookies other than opaque correlation clearing, diagnostics, retained application
  state, and application-controlled telemetry contain zero credentials, tokens, proof verifiers, raw provider
  payloads, inbound callback parameters, or protected content. This criterion does not claim `code`, `state`, or
  provider error parameters are absent from the inbound browser callback URL that carries them to the application.
- **SC-005**: Every new or changed requirements-BDD scenario inherits or carries at least one applicable lowercase
  requirement-ID tag, all callback-validation scenarios declare the feature's partial limits, and runtime execution
  records the tested revision, provider, instance arrangement, and unexecuted compatibility limitations.

## Assumptions

- #216's merged initiation behavior remains the starting point: tenant-specific authorization with code flow,
  proof-key protection, state, nonce, and `max_age=0`; it currently creates no recoverable correlation artifact and
  the callback currently denies all requests.
- The accepted tenant OIDC configuration contract supports public clients and confidential clients. Any confidential
  credential use follows PREETS-SECURITY-001 and remains server-only and vendor-neutral.
- The repository's Compose Keycloak service is the available development/runtime evidence provider. Microsoft is a
  first-class compatibility target but is not claimed without actual execution.
- Authentication attempts are short-lived and single-use, but this specification does not prescribe their storage
  technology, identifier shape, browser artifact form, or cleanup mechanism.
- #218 owns creating the authenticated application session from the trusted identity handoff. #154 owns complete
  application callback/error/access composition. #158 owns the unresolved freshness comparison, tolerance,
  provider/broker support, and unsupported-provider policy.
- This specification records intended behavior only. It claims no callback, provider, cross-instance, BDD, security,
  or runtime execution evidence.
