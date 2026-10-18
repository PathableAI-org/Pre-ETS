# Feature Specification: Initiate tenant OIDC authentication

**Feature Branch**: `154-initiate-tenant-oidc`

**Feature Directory**: `specs/007-initiate-tenant-oidc`

**Created**: 2026-10-18

**Status**: Draft; specification only, no implementation or executed behavioral evidence from this feature.

**Input**: Specify issue #216's tenant OIDC initiation increment, including external contracts, expected
requirements-backed Gherkin additions, relevant requirements, and explicit partial completion boundaries.
Maintainer refinement on 2026-10-18: introduce a session-presence boundary that always reports no usable session;
check it before tenant lookup and resolve the tenant in the login route. Recoverable transaction persistence
and its Redis/cookie integration move to #217.

**Requirement baseline**: Current `origin/main`, `9f83d3bcf623f4fa4d8aa6ee7918033c259387be`, refreshed and
inspected on 2026-10-18. Application sources were inspected at `2b35b9b662f2bd58b90e6af4b74ab1de5e2e0dc2`;
this draft PR has changed only specification/planning documents. The relevant application and requirement sources
match that main baseline. Requirements in main govern the
contract even where older delivery prose still says a merged refinement awaits review.

**Delivery context**: [#216](https://github.com/PathableAI-org/Pre-ETS/issues/216), S2-B in the
[seven-step supplement](../../docs/delivery/session-management-s2-steps.md#s2-b--initiate-tenant-oidc-authentication),
is a native child of [#153](https://github.com/PathableAI-org/Pre-ETS/issues/153).
[#154](https://github.com/PathableAI-org/Pre-ETS/issues/154) consumes these capabilities for comprehensive
application integration. Its broader completion claim is preserved. Branch and feature-directory numbers
are independently generated and do not establish issue identity.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Start authentication with the selected tenant (Priority: P1)

As a visitor without an application session, I open the application and am automatically directed to my
organization's identity provider. I do not have to find a login control or enter credentials into this application.

**Why this priority**: This is the next usable authentication increment after tenant configuration and the
foundation for callback validation and session establishment.

**Independent Test**: Request `/` without an application session, observe the application's redirect, and follow
it in a browser to the configured local provider. This establishes delegation, not successful authentication.

**Acceptance Scenarios**:

1. **Given** two configured tenants in host mode and no application session, **When** their `/` entries are
   requested in interleaved order, **Then** each initiates its own configured OIDC integration without returning
   protected application content or using the other tenant's integration.
2. **Given** usable static tenant configuration and no `BASE_HOSTNAME`, **When** `/` is requested with a known,
   unknown, or otherwise unresolvable host, **Then** initiation uses the configured static tenant each time.
3. **Given** a first-time application visit without an application session, **When** initiation occurs, **Then**
   the provider request includes `max_age=0`, regardless of whether the provider already has an SSO session.
   This request alone does not establish a fresh authentication event.

### User Story 2 - Reach public authentication and diagnostic resources (Priority: P1)

As an unauthenticated visitor or diagnostic consumer, I can reach the resources needed to explain login and
inspect permitted tenant configuration without being redirected into a login loop.

**Why this priority**: Authentication cannot start safely if its public return/error paths or existing
diagnostic observations are intercepted by initiation.

**Independent Test**: Request designated public resources directly without an application session and
confirm no automatic OIDC initiation. Compare diagnostic JSON with the expected tenant file.

**Acceptance Scenarios**:

1. **Given** usable tenant configuration and no application session, **When** the callback fallback, sign-in
   error page, or an existing `/_test` route is requested, **Then** it remains authentication-independent and
   does not start another login. A callback visit does not establish authenticated access in this increment.
2. **Given** no application session, **When** `GET /_test/tenant-config` succeeds, **Then** it returns the full
   permitted selected configuration with `Cache-Control: no-store` and creates no application session.
3. **Given** public login/error content, **When** its necessary safe assets are requested, **Then** they can
   load without authentication and contain no protected information.

### User Story 3 - Fail without another tenant's access (Priority: P1)

As a visitor whose tenant or provider cannot support initiation, I receive the applicable failure outcome
without another organization's login or protected content being substituted.

**Why this priority**: Isolation and denied access are prerequisites for a useful authentication entry.

**Independent Test**: Request `/` and explicitly follow its automatic same-origin `/auth/login` redirect.
Exercise tenant failures at that tenant-dependent login boundary and inspect the actual status and browser
missing-page/error experience. A raw first-hop 307 is not evidence of tenant success or failure.

**Acceptance Scenarios**:

1. **Given** an invalid host-mode selection or an unreadable/malformed selected file in either mode, **When**
   `/` redirects to `/auth/login`, **Then** that tenant-dependent login request returns ordinary HTTP 404
   without a provider redirect or fallback tenant; browser navigation presents the ordinary missing page.
2. **Given** a parsed directory setting pointing to an unavailable directory, or a missing static tenant file,
   **When** `/` redirects to `/auth/login`, **Then** the login request returns HTTP 500 without fallback
   authentication. The tenant-independent first hop still returns its session-missing redirect.
3. **Given** usable tenant configuration but initiation cannot be prepared, **When** the visitor enters `/`,
   **Then** protected access remains unavailable, no authenticated application session is established, and
   unauthenticated sign-in failure content remains reachable. This specification does not invent a provider
   failure status code, exact message, or automatic retry policy.

### Edge Cases

- Interleaving two tenants must not reuse the previous tenant's provider settings or transient attempt values.
- Static-mode host variation must not become a host-mode rejection or select a different integration.
- A public callback visit, including unsolicited return parameters, must not grant authenticated access;
  actual callback validation and rejection evidence belong to #217.
- Existing provider SSO must not suppress the fresh-authentication request. Callback freshness confirmation
  and stale/missing evidence rejection remain downstream.
- Provider unavailability must not select another tenant's login or bypass the denied-access boundary.
- Diagnostic requests must not begin login, create an application session, or resolve credentials unnecessarily.
- Tenant startup failures remain startup failures. Root request routing performs no request-tenant lookup;
  `/auth/login` and diagnostics retain their applicable tenant/configuration checks.
- The session predicate is an intentional always-empty implementation in this feature, including with supplied
  cookies. No positive-session rendering, cookie trust, or protected access is implemented.
- A later positive session result must still be followed by independent request-tenant resolution and binding
  before protected access. A presence predicate alone is not authorization.
- Removing the root page lookup is insufficient while `(app)/layout.tsx` eagerly reads tenant configuration;
  the layout must cease that read too. Existing public previews retain their explicit tenant checks.

## Requirements _(mandatory)_

### Functional Requirements

These are feature-local acceptance statements derived from the linked durable contracts, not new durable
requirement IDs or changes to those contracts.

- **FR-001**: For the reference protected-page entry `/`, a visitor without an application session MUST
  automatically enter the selected tenant's OIDC flow without receiving protected application content.
  Sources: SESSION-001 AC1, SESSION-002 AC2–3, SESSION-004 AC1.
- **FR-002**: Initiation MUST use normal request tenant selection and that tenant's validated non-secret OIDC
  configuration in host and static modes, including interleaved host-mode requests. No fallback tenant or
  vendor-specific application policy is introduced. Sources: SESSION-002 AC1–2, TENANT-003 AC1–4.
- **FR-003**: Every initiation in this increment MUST request fresh provider authentication with `max_age=0`
  and prepare tenant-bound authentication-attempt context for #217's later round-trip integration. No
  recoverable transaction, correlation cookie, Redis dependency, or authenticated application session is
  established here. Callback processing remains unavailable.
  Sources: SESSION-013's selected protocol baseline and AC1/3; SESSION-001 AC1; constitution tenant isolation.
- **FR-004**: Initiation MUST preserve callback, sign-in error, all `/_test` routes, dedicated recovery content
  when present, and necessary safe public assets as authentication-independent exceptions. Diagnostics MUST
  create no application session. Sources: SESSION-001 AC2, TENANT-006.
- **FR-005**: Existing tenant 404/500 and startup failure semantics MUST apply before tenant-dependent login;
  failures MUST NOT substitute a provider or protected content. Sources: TENANT-003/004/005.
- **FR-006**: Tenant configuration and diagnostic JSON MUST remain non-secret and complete within the permitted
  configuration contract. Actual credentials, if needed, MUST be obtained separately on the server only when a
  real consumer requires them. Initiation MUST NOT introduce local credential collection.
  Sources: SECURITY-001 AC1–3, SESSION-002 AC3.
- **FR-007**: Initiation failures MUST leave authenticated access unavailable. Public sign-in failure content
  MUST remain understandable and usable with keyboard and assistive technology if changed by this increment.
  Sources: SESSION-001 AC1–2; constitution accessible UI principles. Exact failure copy is not prescribed.
- **FR-008**: The increment MUST retain its provider/request fixtures and describe the handoff to #217.
  #217 owns both saving attempt context before provider redirect and recovering/consuming it at the callback.
  This feature MUST NOT substitute an in-memory store or add an unused persistence-provider interface.
  Source: maintainer-refined S2-B/C evidence boundary.
- **FR-009**: The root entry MUST first consult the session-presence capability. Its implementation always
  reports no usable session in this feature, so `/` redirects to `/auth/login` before resolving the request
  tenant. The login route MUST resolve the tenant before provider-specific work. No positive-session access
  path is claimed. Source: maintainer direction on 2026-10-18; the observable denial/delegation remains within
  SESSION-001/004 and tenant-dependent login still follows TENANT-003/004/005.

### External contract expectations

`/` first consults a session-presence capability whose real implementation always reports no usable session.
It redirects to `/auth/login` without request-tenant resolution. The public login server page resolves the tenant,
prepares OIDC, and redirects to the provider; no additional user action is needed. Root/layout code must not perform
an earlier tenant read. Once positive sessions exist, protected access still requires independent tenant binding.

| Boundary                                                      | Expected observable contract                                                                                      | Partial limit                                                                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Session presence                                              | Always no usable session; no cookie or store lookup grants access                                                 | No actual session lookup, identity, persistence, positive-session access, or Option payload is implemented |
| Raw `GET /`                                                   | Automatic same-origin redirect to `/auth/login`, with no protected content or request-tenant lookup               | This response does not establish tenant validity; final tenant outcomes are observed after the login hop   |
| `GET /auth/login`                                             | Resolve the request tenant before provider work; prepare the selected integration and automatic provider redirect | No correlation cookie or recoverable attempt is created                                                    |
| Application to provider                                       | Selected client, callback authority, PKCE/correlation request data, and `max_age=0`                               | No token exchange, callback acceptance, application session, or verified fresh event                       |
| Attempt handoff                                               | Retained preparation capability and fixtures; context remains server-local in this feature                        | #217 must connect save-before-redirect and callback recovery together; no temporary store                  |
| Public callback/error/test/recovery resources and safe assets | Authentication-independent access with existing applicable tenant/configuration obligations                       | No new recovery screen, successful callback, ingress or comprehensive protection claim                     |
| `GET /_test/tenant-config`                                    | Full permitted selected JSON, no-store and actual 404/500; no session or login cookie                             | Does not depend on provider or Redis availability                                                          |
| Tenant/configuration failure                                  | Actual ordinary 404/500 at the login/diagnostic tenant-dependent request; no fallback/provider redirect           | Root's first-hop redirect is not reclassified as the tenant failure response                               |

### Relevant requirements and partial contribution

Links refer to files inspected at the recorded main baseline. This table describes intended feature scope,
not authoritative verification status or a separate tracking system.

| Durable requirement                                                                                                                                         | Contribution targeted here                                                                                       | Remaining after this feature                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [PREETS-SESSION-001](../../docs/requirements/session/PREETS-SESSION-001.md) AC1–3                                                                           | AC1 denial at `/`; AC2 public-exception preservation and diagnostic no-session behavior                          | Protection across pages, handlers, actions, and new resources; callback validation; comprehensive safe-asset assessment under #154                                 |
| [PREETS-SESSION-002](../../docs/requirements/session/PREETS-SESSION-002.md) AC1–3                                                                           | Consume #215 configuration and delegate initiation to the selected provider                                      | Real callback exchange, authenticated identity/session establishment, actual credential consumption where needed, and provider compatibility                       |
| [PREETS-SESSION-004](../../docs/requirements/session/PREETS-SESSION-004.md) AC1                                                                             | Automatic missing-session entry at `/`                                                                           | Expired/new-tab/refresh/history behavior, valid-session joining, recovery composition, and verified freshness                                                      |
| [PREETS-SESSION-013](../../docs/requirements/session/PREETS-SESSION-013.md) AC1/3 and protocol baseline                                                     | Request-side freshness with `max_age=0`, including first-time entry without old records                          | Signed-ID-token `auth_time` validation, existing-SSO fresh-event evidence, stale/missing evidence rejection, cancellation, recovery, and new-session establishment |
| [PREETS-TENANT-003](../../docs/requirements/tenant/PREETS-TENANT-003.md) AC1–4                                                                              | Extend host/static selection and isolation evidence into authentication initiation                               | Authenticated requests and remaining tenant-dependent consumers                                                                                                    |
| [PREETS-TENANT-004](../../docs/requirements/tenant/PREETS-TENANT-004.md) and [005](../../docs/requirements/tenant/PREETS-TENANT-005.md)                     | Preserve selected configuration and actual failure statuses at the tenant-dependent `/auth/login` request        | Broader downstream consumer integration; existing evidence remains scoped to its own boundary                                                                      |
| [PREETS-TENANT-006](../../docs/requirements/tenant/PREETS-TENANT-006.md) and [PREETS-SECURITY-001](../../docs/requirements/security/PREETS-SECURITY-001.md) | Preserve full safe diagnostic disclosure and no-store; ensure initiation adds no secret configuration dependency | Actual credential lookup/exchange if required, external producer controls, and independent production ingress evidence                                             |

SESSION-003/005/006/008–012 describe downstream identity, request/session isolation, distributed state, idle,
activity, warning, and expiration behavior; they are context rather than completion claims of this increment.
SESSION-007's Server Action recovery remains downstream and MUST NOT be replaced with automatic OIDC by
generalizing this protected-page entry behavior.

### Expected requirements BDD additions

These are planned additions for the implementation PR under `tests/bdd/requirements/`, not active feature
files or executed evidence in this specification change. Use the repository
[requirements BDD author workflow](../../.agents/skills/requirements-bdd-author/SKILL.md) when adding them.
Every scenario must carry or inherit only the requirement IDs it supports. Both proposed features remain
feature-level `@partial`; all active scenarios must have executable passing bindings. The tag never skips work.

1. **`tenant-oidc-initiation.feature` — Tenant authentication initiation.** State the initiation-only limit in
   its feature description. Plan scenarios for interleaved host-mode provider/client selection, static-mode
   selection across differing hosts without `BASE_HOSTNAME`, automatic browser delegation without a local
   credential form, and the `max_age=0` request. Tag selection scenarios with `@preets-session-002`,
   `@preets-session-004`, and `@preets-tenant-003`; tag protected-response denial with `@preets-session-001`.
   Use `@preets-session-013` for the scenario observing the fresh-authentication request. Extend existing
   tenant failure scenarios rather than copying their matrix into this file.
2. **`authentication-public-resources.feature` — Authentication-independent resources.** Plan scenarios for
   callback fallback/error reachability without an initiation loop, existing `/_test` routes, and diagnostic
   full JSON/no-store/no-session behavior. Use `@preets-session-001` and add `@preets-tenant-006` only to
   diagnostic observations. Assess content safety separately where HTTP cannot establish it. Recovery UI
   not yet built is a downstream gap, not a skipped or undefined active scenario.

Illustrative acceptance prose for the first file; step wording/bindings are proposed and do not yet exist:

```gherkin
@partial
Feature: Tenant authentication initiation
  This slice establishes automatic tenant-specific login initiation at the reference entry.
  Recoverable attempts, callback validation, application sessions, valid-session reuse, and verified freshness remain incomplete.

  @preets-session-002 @preets-session-004 @preets-tenant-003
  Scenario: Interleaved entries use each selected tenant's authentication integration
    Given two configured tenants with distinguishable OIDC integrations
    And host-based tenant resolution
    And the visitor has no application session
    When the visitor requests each tenant's application entry in interleaved order
    Then each response initiates the integration configured for its request tenant

  @preets-session-004 @preets-session-013
  Scenario: First-time entry requests fresh provider authentication
    Given a configured tenant and no application session or previous application record
    When the visitor requests the tenant's application entry
    Then the provider authorization request contains max_age equal to zero
```

Observe real application responses over HTTP; use a browser for actual delegation or failure presentation.
Compare destinations/client identity against independently supplied tenant expectations. A redirect does not
show provider acceptance; retained real-Keycloak integration must show it reaches the configured provider.
BDD steps must not connect directly to Redis, session stores, or mock providers. Protocol preparation properties
belong at the public capability boundary; recoverable transaction lifecycle/security evidence moves to #217. Do not
hide product assertions in setup or replace them with incidental UI checks.

The existing [tenant-context feature](../../tests/bdd/requirements/tenant-context.feature) and
[tenant-failures](../../tests/bdd/requirements/tenant-failures.feature) observe `/` as a tenant consumer.
Move tenant-specific success/failure assertions to `/auth/login` or explicitly follow the one same-origin hop,
keeping its actual 404/500 and ordinary missing-page browser assertions. Add root missing-session delegation
under SESSION-001/004 without treating that 307 as tenant evidence. Do not globally change status-step semantics,
delete failures, alter unrelated missing-path outcomes, or bypass authentication for tests. Browser interception
must let the browser follow the application redirect while preserving logical Host; it must not swallow provider
navigation. Reuse independent diagnostic JSON comparisons in
[tenant-resolution](../../tests/bdd/requirements/tenant-resolution.feature). Redis and stored-transaction
assertions are outside this feature. No active Gherkin claims a current positive-session path.

Before implementation completion, run applicable Gherkin lint/format checks, discovery, and actual application
scenarios. Discovery alone does not demonstrate behavior. Record real-provider execution separately, including
conditions and limitations. Microsoft and relevant broker-chain scenarios remain outstanding until executed
against actual integrations; Keycloak results do not establish their compatibility. Verify observability changes
with temporary/manual log and exported OTel inspection, not retained telemetry tests.

### Key Entities

- **Resolved tenant**: The independently selected organization context and permitted OIDC integration data.
- **Session presence**: Whether a usable session is available. This feature always reports absence and defines
  no authenticated identity shape or stored session representation.
- **Authentication attempt**: Transient tenant-bound preparation data used to build a provider request. It is
  not persisted or recoverable across the redirect in this feature; #217 adds that lifecycle.
- **Provider authorization request**: Delegates authentication to the configured provider, including selected
  client, return context, and fresh-authentication request.
- **Public resource designation**: A resource allowed before authentication while retaining applicable tenant
  and configuration constraints.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: For two distinguishable tenants, every exercised interleaved entry selects the intended
  organization's authentication integration; none selects the other organization's integration.
- **SC-002**: In both tenant-selection modes, a sessionless visitor reaches the selected provider from `/`
  without an intermediate application login action or local credential collection.
- **SC-003**: Every exercised sessionless initiation requests fresh authentication, including first-time
  entry with no old application record. No initiation result is reported as authenticated access.
- **SC-004**: All exercised designated public resources remain reachable without a login loop; diagnostic
  responses preserve complete permitted configuration, no-store, and zero application-session creation.
- **SC-005**: Every retained tenant failure case preserves its specified outcome without fallback login or
  protected content. Initiation failures grant no authenticated access.

These are acceptance targets, not execution results or complete requirement verification. They introduce
no unsupported performance, concurrency, or provider-availability commitment.

## Assumptions

- #215 is delivered by [PR #223](https://github.com/PathableAI-org/Pre-ETS/pull/223). The public tenant service,
  strict configuration, effective policy, and tenant failure mappings are available. OIDC initiation/callbacks,
  actual secret reading, and authenticated sessions are absent from that delivery.
- `/` is this feature's reference session-routing entry. It reads no request tenant while the session
  capability reports absence; `/auth/login` owns tenant-dependent preparation. Other application resources
  are not redesignated public. Reusable capability/reference evidence belongs to #153; #154 retains
  comprehensive protection, usable-session integration and multi-instance HTTP evidence.
- #216 is open with sole prerequisite #215 closed; no open PR covered it at the 2026-10-18 inspection.
  #217 follows initiation; #218 follows callback/configuration; #219 and #220 follow #218; #221 follows #220.
  This feature does not change issue relationships or duplicate these increments.
- Existing Compose Keycloak supplies current provider fixtures. Provider-specific setup stays in configuration
  and fixtures. Tenant-configured endpoints may represent an approved broker integration; this feature selects
  no new direct-versus-broker topology or Microsoft product/tenant.
- Remaining B6 authentication-time comparison, clock tolerance, provider/broker support, and unsupported-provider
  handling must be resolved before dependent callback/freshness acceptance. They do not prevent this request-side
  increment. No timeout, retention duration, or freshness tolerance is chosen here.
- Full callback validation (#217), authenticated session creation (#218), enforcement (#219/#154), idle and
  invalidation lifecycle (#220/#221), browser coordination/warnings (#155/#156), recovery (#157), and completed
  fresh-authentication behavior (#158) remain outside this feature's completion claim. Integrate valid-session
  reuse before claiming complete automatic-entry behavior.
- Backend/domain persistence, API expiration-response policy, new absolute lifetime rules, cloud/ingress,
  heartbeat/connection-loss behavior, and CI cadence are out of scope. Historical Spec Kit authentication/session
  specifications do not override current requirements or establish working implementation.
