# Feature Specification: Tenant-Configurable Idle Session Timeout

**Feature Branch**: `004-idle-session-timeout`

**Created**: 2026-09-17

**Status**: Draft — behavior clarified for planning and implementation; release claims still gated by D-001, D-005, and D-006

**Input**: Specify the next feature from `.specify/assessments/hipaa-idle-session-timeout/`, following its decision handoff: a maximum inactivity timeout of 30 minutes, shorter tenant choices, authoritative expiration, and an accessible inactivity-ended modal with a login-again action.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - End unattended authenticated access (Priority: P1)

As a user working with protected information for my tenant, I need my authenticated access to end after the applicable period of inactivity, including when my browser is suspended, so an unattended session cannot continue protected work.

**Why this priority**: Ending access is the core protection; showing an explanation alone does not establish it.

**Independent Test**: With an authenticated session and an approved tenant duration, attempt protected work before and at the inactivity deadline, including from a suspended browser. Demonstrate rejection through expired access independently of the modal. The authentication prerequisite must be available for runtime verification.

**Acceptance Scenarios**:

1. **Given** authenticated access and an applicable tenant inactivity duration, **When** no qualifying activity occurs for that duration, **Then** the access expires and protected operations using it are denied from the deadline onward.
2. **Given** inactivity-expired access, **When** the browser is suspended, closed, offline, or its expiration display is disabled, **Then** that access still cannot authorize protected operations.
3. **Given** expired authenticated access, **When** the application establishes a replacement anonymous tenant session, **Then** protected access remains unavailable until authentication succeeds.
4. **Given** access that has already expired, **When** delayed activity arrives, **Then** it cannot revive that access.
5. **Given** tenant-specific access, **When** activity or configuration belonging to another tenant is presented, **Then** it cannot renew or change that access's inactivity policy.
6. **Given** unexpired access, **When** deliberate keyboard, pointer, touch, or scroll interaction is accepted before its deadline, **Then** the inactivity period restarts without extending absolute lifetime; passive reading and automated traffic do not restart it.
7. **Given** two tabs sharing one authenticated session and another independent session, **When** qualifying activity occurs in one shared tab, **Then** it extends the shared session's inactivity period but not the independent session's period.
8. **Given** no usable evidence authorizing access because session state is missing or unavailable, **When** protected work is attempted, **Then** it is denied without asserting an unsupported inactivity cause.

---

### User Story 2 - Understand expiration and log in again (Priority: P1)

As a user whose session ended for inactivity, I need an understandable, accessible explanation and an operable login-again action so I can regain authorized access to the same tenant.

**Why this priority**: Users must understand why work stopped and be able to recover using keyboard or assistive technology.

**Independent Test**: While authenticated UI remains open, confirm that client-driven revalidation discovers server-confirmed inactivity without relying on a later full navigation, then use the modal by keyboard and assistive technology and complete the selected reauthentication journey. Verify that temporary session data is cleared and protected content is no longer exposed by the active application. Client timing alone must never grant continued access.

**Acceptance Scenarios**:

1. **Given** authenticated UI is running when inactivity expires, **When** the application discovers that expiration through client-driven revalidation that confirms the cause with the authoritative server (without relying solely on a later full navigation), **Then** it removes protected content and presents a modal explaining that inactivity ended the session with a button named “Log in again”. Client timing MUST NOT be treated as authority to grant access.
2. **Given** the modal opens, **When** a keyboard or assistive-technology user interacts with it, **Then** its purpose and explanation are announced, focus moves into it and remains visibly usable, all offered actions work by keyboard, and interaction cannot return the user to protected work through expired access.
3. **Given** the inactivity modal, **When** the user activates “Log in again”, **Then** the application's existing tenant-bound authentication journey begins and protected access resumes only after the required authentication succeeds.
4. **Given** that authentication is cancelled or fails, **When** the user returns to the application, **Then** expired access remains unusable and an understandable retry path remains available.
5. **Given** missing session state or an unavailable service without evidence of inactivity expiry, **When** access cannot continue, **Then** the application does not state that inactivity caused the interruption.
6. **Given** a browser returning from sleep or offline operation after expiration, **When** the application resumes handling access, **Then** expired access remains unusable and the recovery experience reflects the established cause; the application removes protected content before enabling further interaction and offers the appropriate recovery path.
7. **Given** temporary unsaved work and separately saved business records, **When** access expires for inactivity, **Then** temporary session data is cleared and protected content is removed from the active application experience, while saved business records remain intact. The recovery explanation MAY acknowledge that unsaved temporary work was cleared; it MUST NOT offer advance warning, countdown, or session extension.
8. **Given** an existing identity-provider sign-in, **When** the user activates login again and the provider accepts that sign-in, **Then** a new authenticated application session may be established without a fresh credentials challenge, using current tenant policy and without restoring the expired session or its cleared temporary data.

---

### User Story 3 - Apply an approved tenant timeout (Priority: P2)

As an authorized tenant representative, I need my tenant's selected inactivity duration to be applied within the provider-approved choices so the policy accommodates our work without exceeding the platform ceiling.

**Why this priority**: Tenant flexibility is part of the selected concept, but depends on a functioning expiration and recovery capability.

**Independent Test**: Establish a permitted tenant choice through the approved administrative process and prove it governs access after a new session begins. Attempt invalid and cross-tenant changes. No new administration application is required.

**Acceptance Scenarios**:

1. **Given** an authorized representative and a provider-approved shorter duration, **When** that choice is established for the tenant, **Then** new authenticated sessions use the tenant's persisted choice rather than another tenant's choice.
2. **Given** a proposed duration longer than 30 minutes or a request to disable inactivity expiration, **When** the choice is submitted, **Then** it is rejected and does not replace an existing valid policy.
3. **Given** a tenant with no selected duration, **When** authenticated access begins, **Then** it uses the provider-approved default of 30 minutes.
4. **Given** a person without the required configuration authority or an attempt to change another tenant's policy, **When** a change is submitted, **Then** it is denied and the existing policy remains unchanged.
5. **Given** an existing authenticated session and a tenant policy change, **When** the change takes effect, **Then** existing authenticated sessions retain the policy fixed at their creation, while new sessions use the changed value.
6. **Given** an authorized choice of any whole minute from 5 through 30 inclusive, **When** it is established, **Then** new sessions apply that duration; fractional minutes, values below 5, and malformed values are rejected without replacing a valid choice.
7. **Given** invalid explicit stored tenant configuration, **When** the application attempts to establish authenticated access, **Then** the trusted configuration boundary rejects it rather than substituting a silent default.

### Edge Cases

- Activity at or after the authoritative deadline cannot revive expired access; earlier qualifying activity may move the idle deadline without extending absolute lifetime. Concurrent outcomes must obey that ordering.
- Deliberate keyboard, pointer, touch, and scroll interaction count even without a protected operation. Passive reading, polling, prefetch, and other automated traffic do not.
- Tabs sharing one authenticated session share activity; separate sessions, including other devices, are independent. Activity in one tenant cannot keep another tenant's access alive. When one shared-session tab's access ends for inactivity, other tabs sharing that session MUST promptly clear protected content and present recovery through per-tab revalidation and/or same-origin UI sync—without treating any tab's local timer as authority to grant access.
- Existing absolute expiration remains independently binding. If causes cannot be distinguished, recovery must not assert inactivity without evidence.
- Missing, evicted, or unavailable session state does not by itself prove inactivity. An inactivity explanation requires an explicit server-established inactivity cause; the application MUST NOT infer inactivity solely from a missing store or other absence of authorization evidence. Neither creating an anonymous session nor a cause-labeling failure may restore authorization.
- Sleep, offline operation, throttled timers, and differing clocks must not defeat authoritative rejection. When the application can run again, it must remove expired protected content before allowing further interaction; no exact browser paint instant is promised while execution is suspended.
- An absent tenant choice uses 30 minutes. Invalid explicit configuration must not authorize access using a silently substituted duration; handling must follow the existing trusted configuration failure boundary.
- A shorter or longer permitted policy change applies only to new authenticated sessions; existing sessions retain their original duration. Login again creates a new session governed by current policy.
- An active identity-provider sign-in may satisfy a new application authentication without a fresh credentials challenge. It cannot revive expired access or cleared temporary data.
- Expiration clears temporary session data, including unsaved work, and removes protected content from the active application experience. Saved durable business records remain intact; general autosave and recovery of drafts are outside this slice.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST support one tenant-specific inactivity duration, capped at 30 minutes, with provider-approved shorter choices. It MUST reject disablement and values above the ceiling.
- **FR-002**: The system MUST default to 30 minutes when no tenant choice exists and permit every whole-minute duration from 5 through 30 minutes inclusive. It MUST reject fractional minutes, values below 5 or above 30, disablement, and malformed values without replacing a valid existing choice.
- **FR-003**: Only the approved configuration authority MUST be able to establish a tenant choice. The choice MUST persist across sessions and remain isolated to that tenant. Use the existing trusted tenant-configuration management process; no new administrative roles or application are introduced. A duration is fixed when an authenticated session begins. Changed policy MUST apply only to new authenticated sessions, including login-again sessions. Invalid explicit configuration MUST fail at the existing configuration boundary rather than silently authorize access with a substituted value.
- **FR-004**: Authenticated access MUST expire when its applicable inactivity period elapses. Protected operations through that expired access MUST be rejected independently of browser execution, connectivity, or cooperation. The exact protected-access inventory is an authentication prerequisite, not an assertion about currently implemented access.
- **FR-005**: Deliberate keyboard, pointer, touch, and scroll interactions MUST qualify as activity; passive reading and automated traffic, including polling and prefetch, MUST NOT. Activity MUST be shared across tabs using the same authenticated session and remain independent across separate sessions/devices. Session creation starts its inactivity period; qualifying activity accepted before expiry restarts that period.
- **FR-006**: Activity received after access expires MUST NOT restore that access. The feature MUST preserve existing absolute-lifetime limits rather than introduce a longer lifetime or redesign them; activity at or after the authoritative deadline MUST lose to expiration, and no client clock or late report may grant access beyond an established deadline.
- **FR-007**: Anonymous tenant-session continuity MUST remain distinct from authenticated access. A replacement anonymous session MUST NOT restore protected access or serve as proof that authentication succeeded.
- **FR-008**: The system MUST distinguish confirmed inactivity expiration from other or unknown causes using an explicit server-established inactivity cause. It MUST NOT infer inactivity solely from missing session state or other absence of authorization evidence. Loss of the ability to establish authorization MUST NOT grant protected access.
- **FR-009**: While authenticated UI is running, the application MUST discover confirmed inactivity through client-driven revalidation that confirms the cause with the authoritative server, remove protected content, and present a modal explaining the cause with a “Log in again” button—without relying solely on a later full navigation. Client timing MUST NEVER authorize continued access. The modal MUST have a meaningful accessible name and explanation, announced purpose, keyboard-operable actions, visible focus, and focus movement that prevents interaction with protected work through expired access.
- **FR-010**: Login again MUST use the originating tenant's authentication journey. Cancellation or failure MUST leave expired access unusable and provide an understandable retry path. An existing identity-provider sign-in MAY satisfy a new application authentication without a fresh credentials challenge. Expiration MUST clear temporary session data, including unsaved work, and remove protected content from the active application experience, including promptly across other tabs that share the expired session. Durable saved business records MUST remain intact. The recovery explanation MAY acknowledge cleared unsaved temporary work; it MUST NOT introduce advance warning, countdown, or extension. Neither login again nor an existing identity-provider sign-in may restore cleared temporary data or revive expired access.
- **FR-011**: The provider MUST document the justification and approval for every supported policy, including the default, against applicable client obligations and risk evidence. The 30-minute ceiling MUST be described as a product decision, not a universal legal range or a compliance certification.
- **FR-012**: Acceptance evidence MUST cover expiry rejection, cause accuracy, accessible recovery, tenant isolation, activity rules, active-session policy changes, and the failure/edge cases above. Evidence retention, timing tolerances, representative workflows, and acceptable interruption/data-loss thresholds MUST be agreed before claiming this feature's outcomes are established.

### Key Entities _(include if feature involves data)_

- **Tenant inactivity policy**: A tenant's selected duration or applicable provider default, permitted choices, approval basis, and effective-change rule. It does not contain per-user, role, or device overrides.
- **Authenticated access context**: Tenant-bound access governed by a qualifying-activity history and existing lifetime rules. Its exact protected capabilities and relationship to independent credentials depend on prerequisite authentication work.
- **Access-ending cause**: An explicit server-established signal of confirmed inactivity, another established cause, or an unknown cause; supports truthful explanation without equating every missing session or absent store with inactivity.
- **Policy and acceptance evidence**: Reviewable policy rationale, accountable approval, scenario outcomes, and workflow-impact observations. Retention and operational collection requirements are not yet selected.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Every supported duration and the default have a documented provider approval and traceable rationale before release; 100% of supported tenant choices respect the 30-minute ceiling and none disables inactivity expiration.
- **SC-002**: Zero protected operations using expired access succeed at or after its inactivity deadline across the agreed coverage, including suspended/offline browsers and delayed activity. Test-clock precision must be documented separately and does not authorize extra access after the deadline.
- **SC-003**: In every agreed recovery journey, keyboard and assistive-technology users can understand confirmed inactivity expiration and operate login again through the required authentication outcome; zero unknown or unrelated failures are falsely labeled inactivity.
- **SC-004**: Zero observed outcomes deviate from the approved tenant-isolation, qualifying-activity, session-sharing, and policy-change rules across their agreed acceptance scenarios.
- **SC-005**: Every agreed representative workflow is evaluated for unintended interruption and unsaved-work loss. Record observations against provider-approved acceptable thresholds before declaring success; workflows and thresholds are unresolved and this outcome cannot yet be marked satisfied.

## Assumptions

### Evidence and approved decisions

- The authoritative source is [decision.md](../../.specify/assessments/hipaa-idle-session-timeout/decision.md), supported by [intake](../../.specify/assessments/hipaa-idle-session-timeout/intake.md), [problem](../../.specify/assessments/hipaa-idle-session-timeout/problem.md), [research](../../.specify/assessments/hipaa-idle-session-timeout/research.md), and [concept](../../.specify/assessments/hipaa-idle-session-timeout/concept.md). The decision supersedes older open questions about concept selection and the maximum.
- Confirmed: the provider owns software-behavior compliance for covered-entity clients, Option B is selected, the maximum is 30 minutes, and tenants may select shorter approved durations. During specification the user confirmed a 30-minute default, a 5-minute minimum, every whole minute from 5 through 30, the deliberate-interaction/shared-tab activity rule, clearing temporary session data, acceptance of an existing identity-provider sign-in, and policy changes applying only to new sessions.
- The assessment's dated regulatory research did not establish a universal numerical legal range. This specification carries that research and its limitations forward; it performs no new regulatory review and makes no legal-sufficiency claim. Policy approval requires a current review of relevant changes and dates.
- Acceptance statements define desired behavior, not evidence that it exists. The earlier assessment inspected anonymous session source; it did not verify authenticated expiration at runtime.

### Scope and ownership

- In scope: authorized tenant duration selection, authoritative inactivity expiration, accurate accessible recovery, interaction with existing lifetime rules and tenant changes, and evidence of these outcomes.
- Out of scope: overall HIPAA certification; general authentication implementation or identity-provider replacement; tenancy/domain-persistence redesign; per-role, per-user, per-device, or adaptive policies; a new administration application; general autosave/draft synchronization; organization-wide sign-out; an advance-warning, countdown, or extension experience; and operational metrics/alerting for idle expiry or recovery (deferred to a later slice). Revisit scope if workflow evidence requires an additional capability.
- Existing constitution ownership remains authoritative: presentation, tenant configuration, authentication orchestration, and temporary session state belong to the frontend; domain authorization and durable business records belong to the backend. This specification does not prescribe a shared store, credential-revocation mechanism, or implementation architecture.

### Dependency and decision register

The user resolved the product-policy, activity, recovery, and policy-change questions during specification. The following prerequisites and evidence obligations remain explicit; they do not authorize expanding this feature into general authentication or a compliance program.

| ID    | Dependency or assumption                                                                                                                                                                  | Readiness effect                                                                                                                                                                                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-001 | The provider must identify the accountable policy approver, document risk/contract justification for the 5–30 minute choices and 30-minute default, and review regulatory currency        | Required before policy release approval; values are selected product decisions, not legal certification                                                                                                             |
| D-002 | Assume existing trusted tenant-configuration management supplies the authorized representative's choice; no new roles or administrative surface                                           | Verify during planning; revisit scope if no suitable process exists                                                                                                                                                 |
| D-003 | Enumerate protected authenticated operations and any independently usable credentials, then establish the prerequisite that their authorization ends with the relevant application access | Required for architecture and acceptance planning; authentication implementation remains separately owned and sequenced                                                                                             |
| D-004 | Select authoritative ordering and enforcement mechanisms consistent with the stated deadline and existing ownership boundaries                                                            | Implementation planning responsibility; no browser grace period or shared writable store is authorized                                                                                                              |
| D-005 | Agree representative roles/workflows/devices, test measurement precision, acceptable interruption and data-loss thresholds, evidence retention, and evidence owner                        | Required to complete validation planning and claim release outcomes; clearing temporary unsaved data is the selected behavior, and recovery copy may acknowledge that loss without adding advance-warning/extend UI |
| D-006 | Confirm prerequisite readiness, delivery sequencing, staffing, and appetite                                                                                                               | Required for delivery commitment; no estimate or budget is approved here                                                                                                                                            |

Feature 003 specifies login initiation through arrival at the provider page. Authenticated session write via the OIDC callback path and Redis `userId` already exist in the repository; this feature extends that path for idle deadline, activity, and recovery and MUST NOT absorb a general authentication redesign. Release claims remain gated by D-001 (policy approval), D-005 (validation evidence), and D-006 (delivery readiness).
