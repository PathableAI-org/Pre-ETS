# Feature Specification: Tenant Resolution

**Feature Branch**: `001-tenant-resolution`

**Created**: 2026-09-13

**Status**: Draft

**Input**: Create a feature from `.specify/assessments/tenant-resolution/*.md`, following the approved Option B: separate host association from reading current tenant configuration.

## Clarifications

### Session 2026-09-13

- Q: What tenant configuration and visible success condition are included in this slice? → A: The only tenant-config field is Display Name; verify success by displaying it on the landing page. (User-supplied clarification.)

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Reach the correct tenant (Priority: P1)

A visitor reaches a known tenant's address. The application associates that request with exactly that tenant and displays its configured Display Name on the landing page so the visitor can recognize the tenant. A visitor using an unrecognized address is refused, preventing accidental substitution of another tenant.

**Why this priority**: A trustworthy tenant association is the prerequisite for later tenant-specific experiences.

**Independent Test**: Use two synthetic known tenants with distinct Display Name values. Visit each landing page and verify that it shows the matching Display Name and not the other tenant’s name; visit invalid addresses and verify refusal.

**Acceptance Scenarios**:

1. **Given** known tenants `springfield` and `shelbyville`, **When** a visitor reaches `springfield.pathable.com`, **Then** the current tenant is `springfield` and the landing page shows its configured Display Name, with no other tenant’s Display Name.
2. **Given** production-like resolution, **When** the host is missing, malformed, unknown, `pathable.com`, `www.pathable.com`, or `a.b.pathable.com`, **Then** the request is refused with HTTP 403 and no tenant configuration is substituted.
3. **Given** a correctly shaped tenant host, **When** its slug has no known configuration record, **Then** the request is refused with HTTP 403.
4. **Given** an established tenant association, **When** another consumer requests the current tenant or configuration, **Then** it receives the same tenant determination without interpreting the address again.
5. **Given** requests for two tenants overlap, **When** their configurations are read, **Then** neither request receives the other's identity or configuration.
6. **Given** the trusted host identifies `springfield`, **When** other caller-supplied values suggest `shelbyville`, **Then** those values cannot change the tenant association.

---

### User Story 2 - Work locally with supplied configuration (Priority: P1)

A frontend developer disables production-like resolution locally, supplies synthetic tenant configuration, and opens `localhost`. They can work on configuration-dependent features without arranging a tenant-shaped address or a durable store.

**Why this priority**: The approved increment must preserve ordinary local development as well as tenant association.

**Independent Test**: Disable resolution locally, supply a synthetic record, open the landing page on `localhost`, and verify the supplied Display Name is shown. Change Display Name and repeat using the documented reload or restart procedure.

**Acceptance Scenarios**:

1. **Given** local resolution is explicitly disabled and static tenant configuration is supplied, **When** the developer opens `localhost`, **Then** the landing page shows the supplied Display Name through the current tenant/configuration context without claiming the host established a tenant association.
2. **Given** this local mode, **When** the developer changes Display Name in the supplied configuration and follows the documented reload or restart procedure, **Then** the landing page shows the updated Display Name without requiring a durable store or tenant-host setup.
3. **Given** this local mode, **When** static data is missing, lacks its tenant slug or a valid Display Name, or is internally inconsistent, **Then** the developer receives an understandable configuration error and no successful tenant context or default tenant is returned.
4. **Given** production operation, **When** a local resolution-disable setting or static stand-in is supplied, **Then** it cannot bypass host association or serve the stand-in.

---

### User Story 3 - Exercise production-like resolution locally (Priority: P2)

A frontend developer enables production-like resolution to verify host association and refusal behavior using tenant-shaped local addresses.

**Why this priority**: Developers need to verify the production rules without using production addresses or real tenant data.

**Independent Test**: Enable resolution locally and exercise known and unknown tenant-shaped local hosts plus bare `localhost`.

**Acceptance Scenarios**:

1. **Given** local resolution is enabled and `springfield` is known, **When** the developer visits `springfield.localhost`, **Then** the request associates with `springfield` and the landing page shows its configured Display Name.
2. **Given** local resolution is enabled, **When** the developer visits bare `localhost`, an unknown slug, or an invalid tenant-host pattern, **Then** the outcome is HTTP 403 with no static-data fallback.
3. **Given** valid static data exists for local resolution-off work, **When** resolution is enabled, **Then** that data cannot replace a failed host association.

### Edge Cases

- Missing, non-text, empty, or whitespace-only Display Name is invalid configuration: fail visibly rather than displaying a slug, a default name, or another tenant’s name.
- Display Name values need not be unique and never determine tenant identity; tenants with the same name remain distinct by slug.
- Display Name is presented as readable text, including names containing punctuation or markup-like characters; it must not be interpreted as page instructions or executable content.

- A matching-looking address outside the configured tenant host pattern, including extra labels or a deceptive suffix, is refused with HTTP 403.
- A local address with a development port still identifies the same tenant; the port is not part of the slug.
- A configuration record identifying a different tenant from the associated slug must be rejected without exposing either record as the current configuration.
- If configuration cannot be read because its source is unavailable, the operation fails visibly without a default tenant; this is distinguishable from an unknown tenant for diagnosis.
- Multiple consumers in one request and overlapping requests for different tenants must preserve the original per-request determination.
- Missing or invalid local mode configuration must not silently disable host association; resolution remains enabled or startup fails with an understandable error.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Production requests MUST associate with exactly one known tenant using the trusted request host before tenant-dependent work succeeds. The tenant identifier for this increment MUST be its unique slug.
- **FR-002**: Production tenant addresses MUST follow `{slug}.pathable.com`. Missing, malformed, apex, `www`, extra-label, and unrecognized hosts MUST be refused with HTTP 403.
- **FR-003**: A readable slug with no known tenant configuration MUST result in HTTP 403. No failure MAY substitute another tenant, identity, or configuration.
- **FR-004**: Host interpretation MUST occur at a single trusted boundary. Other caller-supplied host values, paths, and query values MUST NOT override that determination. Downstream consumers MUST use the established context without reinterpreting the address.
- **FR-005**: Reading current tenant configuration MUST be separate from host association. Consumers MUST obtain the current tenant and its matching configuration without knowledge of where configuration is stored.
- **FR-006**: Tenant configuration MUST remain frontend-owned and contain exactly one configuration field for this slice: Display Name. The tenant slug remains identity, not an additional configuration field. The consumer-facing contract MUST allow later configuration fields and a later durable source without requiring consumers to perform host association or storage access. This increment MUST NOT select or build that durable source or define those later fields.
- **FR-007**: Local developers MUST be able to explicitly enable or disable production-like resolution. Disabled resolution MUST be restricted to local development and MUST NOT be a production bypass or an automatic response to failed association.
- **FR-008**: With local resolution enabled, `{slug}.localhost` MUST support the same known-tenant and HTTP 403 rules as production. Bare `localhost` MUST fail in this mode. A development port MUST NOT change tenant identity.
- **FR-009**: With local resolution disabled, consumers MUST receive the developer-supplied static tenant/configuration record on `localhost`. This context MUST be distinguishable from host-associated context and MUST NOT represent successful host binding.
- **FR-010**: Local static data MUST identify exactly one tenant by slug. Missing, invalid, or inconsistent data MUST produce an understandable local configuration error, with no successful tenant context and no fallback.
- **FR-011**: Developers MUST have documented instructions for both local modes, supplying and changing static data, any reload or restart needed, and recognizing missing-data errors. Both local modes MUST work without a durable tenant store. Examples and fixtures MUST be synthetic and free of credentials, tokens, and real client records.
- **FR-012**: Repeated current-context reads within a request MUST preserve the same tenant determination. Concurrent requests for different tenants MUST NOT share or overwrite tenant identity or configuration.
- **FR-013**: A configuration/slug mismatch or an unavailable configuration source MUST prevent successful tenant-dependent work without substituting configuration. Diagnostic outcomes MUST distinguish configuration failures from unknown tenants without revealing another tenant's data.
- **FR-014**: Production-like association MUST be the safe behavior when local mode selection is absent; invalid mode selection MUST either preserve association or prevent startup with an understandable error.
- **FR-015**: Display Name MUST be required, non-blank text representing the tenant’s human-readable name. It MUST NOT replace the unique slug as identity or be required to be unique. Invalid Display Name MUST be treated as a configuration failure with no name fallback.
- **FR-016**: The existing landing page MUST show the current tenant’s Display Name as visible, readable text available to assistive technology, using the current configuration in both host-associated and local static modes. It MUST NOT display another tenant’s name or interpret the value as executable content. This addition MUST preserve meaningful page structure and existing keyboard navigation.

### Key Entities _(include if feature involves data)_

- **Tenant**: An organization represented here by a unique slug; no separate tenant identifier is introduced.
- **Tenant configuration**: Frontend-owned information associated with one tenant slug. Its sole configuration field is **Display Name**, required non-blank text used on the landing page. The slug identifies the associated tenant separately; additional configuration fields remain deferred.
- **Current tenant context**: The tenant and matching configuration made available to consumers, with a distinction between host association and explicitly supplied local static data.
- **Local resolution mode**: The developer's explicit choice to exercise host association or work with supplied static configuration. It does not grant production access.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Across acceptance cases with at least two known tenants, 100% of successful landing-page visits show the intended tenant’s configured Display Name and no other tenant’s name, including overlapping requests and repeated visits.
- **SC-002**: 100% of the specified invalid-host and unknown-tenant cases are refused with HTTP 403 in production-like operation, with zero substituted tenant configurations.
- **SC-003**: A developer following the local instructions can complete both workflows: see the supplied Display Name on the landing page at bare `localhost` with resolution disabled, and verify the matching Display Name on tenant-shaped local hosts plus refusal for invalid hosts with resolution enabled, without a durable store or production tenant data.
- **SC-004**: Changing the local static Display Name changes the name visible on the landing page after the documented reload or restart; all missing or inconsistent record cases fail visibly with zero fallback tenants.
- **SC-005**: Consumers can obtain current tenant/configuration in both modes with zero additional tenant determinations or knowledge of configuration storage. Substituting a test configuration source containing only Display Name does not require changes to consumer tenant-selection behavior; no extra field is required to demonstrate this slice.
- **SC-006**: All production bypass attempts using local-mode settings or stand-in data fail to disable required association; all configuration mismatch and unavailable-source acceptance cases return no successful tenant context.
- **SC-007**: In both local modes, the displayed Display Name is available as readable text to assistive technology; markup-like names remain text, and existing landing-page keyboard navigation remains usable. All invalid Display Name cases fail visibly without a name fallback.

## Assumptions

### Evidence and approved decisions

- The user’s 2026-09-13 clarification narrows configuration to Display Name and adds its display on the existing landing page as the visible acceptance outcome. This supersedes the earlier deferral of all business fields and tenant presentation for this slice.

- [Intake](../../.specify/assessments/tenant-resolution/intake.md) records the business and developer goals and explicit 403/local-mode answers. These are stated needs, not measured operational demand.
- [Research](../../.specify/assessments/tenant-resolution/research.md) and [problem definition](../../.specify/assessments/tenant-resolution/problem.md) describe the gap and risks. Their older open questions are resolved here by the later decision or the explicit assumptions below.
- [Concept](../../.specify/assessments/tenant-resolution/concept.md) separates association from configuration reads. The [decision](../../.specify/assessments/tenant-resolution/decision.md) approves Option B and supersedes Option A and the earlier blocking verdict.
- The decision's HTTP 403 rule takes precedence for this feature over the “not-found” wording in [multi-tenancy strategy](../../docs/multi-tenancy.md). Planning must record the corresponding strategy synchronization before implementation.

### Inferred defaults and dependencies

- “Tenant id” means the documented unique slug. `{slug}.hostname` means the environment-specific tenant-host pattern, concretely `{slug}.localhost` locally.
- Missing or inconsistent local data fails visibly rather than supplying a default. Live editing is not required; a documented reload or restart is acceptable.
- Resolution is enabled unless explicitly disabled in local development. Static context is only a development stand-in, consistent with the approved decision; it confers no production association or authentication guarantees.
- The [constitution](../../.specify/memory/constitution.md) requires single trusted host binding. The local stand-in is scoped to configuration development, not a second host-binding path. Planning must explicitly assess this distinction against Principle III and record any necessary governance follow-up before dependent implementation.
- Verification needs at least two synthetic known-tenant records and distinct Display Name values. The eventual durable source remains deferred; this increment establishes the read contract, local/static capability, and landing-page display of Display Name.
- Frontend ownership and trustworthy host selection are dependencies. The exact framework conventions, source contract, and trusted deployment host input belong to planning.
- No measured latency, scale, or developer-time baseline exists in the assessment. Success is evaluated through the specified completion and rejection outcomes rather than invented performance targets.
- A named business decision-maker remains an organizational follow-up; both business refusal behavior and developer ergonomics are required regardless of that assignment.

### Scope boundaries

This increment establishes tenant association, access to current configuration containing only Display Name, and display of that name on the existing landing page. Billing, other branding/copy behavior, backend domain authorization and isolation, real-tenant onboarding, login, sessions, cookies, operator workflows, durable stores, and future configuration fields are out of scope. Later authentication/session work must assess its tenant-host requirements independently. No end-user tenant switcher, configuration editor, or new product workflow is required.
