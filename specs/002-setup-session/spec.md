# Feature Specification: Set Up a Session

**Feature Branch**: `002-setup-session`

**Created**: 2026-09-15

**Status**: Draft

**Input**: User description: "Define a feature for setting up a session: add an external Redis cache dependency and local Docker Compose service; check request cookies for a session id before checking the tenant; create a cookie when no session exists and store the tenant id in Redis-backed session storage. Prioritize simplicity and readability."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Start and continue a tenant session (Priority: P1)

As a visitor opening a tenant site, I receive a session automatically so later requests continue in the same tenant context without extra steps or a login requirement.

**Why this priority**: Establishes the session lifecycle needed by later frontend workflows.

**Independent Test**: Open a known tenant site without a cookie, then revisit with the returned cookie. Verify the same session and tenant association survive a frontend process restart while the session store remains available.

**Acceptance Scenarios**:

1. **Given** a request without a session cookie, **When** it enters tenant-scoped request handling, **Then** session lookup occurs before tenant resolution, the existing tenant boundary validates the tenant, and a new session containing that tenant id is stored before its cookie is issued.
2. **Given** a valid cookie and stored session for the current tenant, **When** another request arrives, **Then** the session is loaded before tenant checking, its binding is validated, and the same session is reused without changing its tenant or creating a replacement.
3. **Given** an unexpired stored session, **When** the frontend restarts and the visitor returns, **Then** the same session remains usable without relying on process-local state.

---

### User Story 2 - Recover safely from missing or unusable sessions (Priority: P1)

As a visitor, I can start a fresh session when an old one is unusable, while another tenant's state is never exposed to me.

**Why this priority**: Session continuity must preserve the existing tenant isolation boundary.

**Independent Test**: Exercise missing, malformed, expired, unknown, and cross-tenant cookies against known and unknown tenant hosts, including a session-store outage.

**Acceptance Scenarios**:

1. **Given** a missing, malformed, tampered, expired, or unknown session cookie, **When** the request's tenant is valid, **Then** a fresh session and cookie replace the unusable reference without retaining client-supplied session ids or old state.
2. **Given** a cookie or stored record bound to a different tenant, **When** the request is checked against its host, **Then** that session is treated as missing, no state from it is exposed or reassigned, and a fresh session is created only for the validated current tenant.
3. **Given** an invalid host or unknown tenant, **When** a request arrives with or without a session cookie, **Then** the existing access-denied behavior remains and no new session or session cookie is issued.
4. **Given** unavailable session storage or a failed session write, **When** session setup runs, **Then** the request fails with a controlled service failure, no successful session cookie is issued, and no in-memory fallback permits normal tenant processing.
5. **Given** storage becomes available again, **When** the visitor retries, **Then** the request can resume an existing valid session or establish a new one.

---

### User Story 3 - Run sessions locally (Priority: P2)

As a developer, I can start the external session store with Docker Compose and run the frontend on the host using documented local settings.

**Why this priority**: Makes session behavior reproducible without a hosted service account.

**Independent Test**: Follow the documented setup from a clean local environment, start the service, run the frontend, and complete the first-visit and repeat-visit scenarios.

**Acceptance Scenarios**:

1. **Given** a clean checkout and documented prerequisites, **When** a developer follows local setup instructions, **Then** Compose starts Redis and the host-run frontend can create and retrieve sessions.
2. **Given** local host-associated or explicitly configured static tenant resolution, **When** a visitor opens the corresponding local site, **Then** the session stores the tenant id supplied by that existing resolution mode and subsequent requests reuse it.
3. **Given** the local service is stopped, **When** the developer requests a tenant page, **Then** the controlled failure from Story 2 is observable, and restarting the service allows subsequent requests to succeed.

### Edge Cases

- A valid cookie whose record has expired or been evicted is a missing session.
- A stored record missing its tenant binding or otherwise malformed is unusable; none of its state is exposed.
- A previously known tenant that is no longer configured remains denied even with an otherwise valid session.
- Repeated session access within one request uses one session; it must not create multiple records or conflicting cookies.
- Independent simultaneous requests without cookies may create independent sessions; coordinating browser tabs is outside this increment.
- Static assets and framework resources do not create sessions solely because they are fetched.
- A browser refusing cookies may receive a fresh session on each request; the feature does not add a cookie-support UI.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The frontend MUST inspect and validate the session cookie and load any referenced session before invoking tenant resolution for a tenant-scoped application request.
- **FR-002**: The existing trusted tenant boundary MUST still validate the current request's tenant before session state is accepted or new tenant-bound state is persisted. Cookie contents MUST NOT override the host binding or make unknown tenants valid.
- **FR-003**: If no usable session exists, the frontend MUST generate an unpredictable new session id, store the validated tenant id in its session record, and issue the corresponding cookie only after successful persistence. The new session MUST be available to downstream handling of that same request.
- **FR-004**: A valid existing session MUST be reused only when its tenant binding matches the validated current tenant. A session's tenant MUST never be changed. Mismatches MUST be treated as missing sessions without exposing or modifying the other tenant's record.
- **FR-005**: Redis MUST be the external, frontend-owned session store. Session continuity MUST survive frontend restarts while the record remains available. The backend MUST NOT access this store; tenant configuration and durable business records MUST remain outside it.
- **FR-006**: The session cookie MUST be host-only, inaccessible to browser scripts, and secure over production HTTPS. It MUST carry only a signed session reference, tenant binding, and expiry, following the existing session strategy; it MUST NOT carry the session payload or imply authentication.
- **FR-007**: Cookies and stored sessions MUST have a finite, aligned lifetime. Expired or missing records, invalid cookie signatures, and malformed records MUST be treated as unusable sessions. Presented unknown ids MUST NOT be adopted for new records.
- **FR-008**: Storage read/write failures MUST produce a controlled service failure without normal tenant content, issuing a successful new session cookie, or falling back to process-local sessions. Invalid hosts and unknown tenants MUST retain existing rejection behavior when storage is available.
- **FR-009**: Local Compose MUST provide Redis using an official image with a pinned version and a loopback-only published port. Frontend and backend processes MUST remain on the host; adding unrelated external services is outside this feature.
- **FR-010**: The frontend MUST declare its Redis client dependency and configurable connection settings. Local instructions and non-secret configuration examples MUST explain service startup, frontend connection, verification, and shutdown without committing credentials.
- **FR-011**: The session integration MUST preserve both existing tenant resolution modes, production host restrictions, and the current tenant page outcome. Normal setup MUST require no additional visitor action.
- **FR-012**: The solution MUST prioritize simplicity and readability: one frontend session owner and one request setup flow, reusing the tenant boundary without a parallel tenancy or authentication framework. Planning MUST explain any additional abstraction in terms of a requirement here.

### Key Entities _(include if feature involves data)_

- **Session**: Temporary frontend-owned state identified by a server-generated session id, bound immutably to one tenant id, with a finite expiry. This increment stores no authenticated identity or domain records.
- **Session cookie**: A signed, expiring browser reference to a session, restricted to its host. It is not the session store.
- **Tenant id**: The existing canonical tenant slug, resolved through the current trusted tenant boundary; no new tenant identifier is introduced.
- **Session store**: External Redis storage for temporary session records, owned exclusively by the frontend.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Every supported first-visit scenario establishes a tenant-bound session with zero additional visitor actions, and a subsequent visit reuses it.
- **SC-002**: All defined invalid-host, unknown-tenant, and tenant-mismatch scenarios expose zero other-tenant state.
- **SC-003**: A visitor retains the same unexpired session across a frontend restart when stored state is available.
- **SC-004**: All defined unavailable-storage scenarios fail predictably without reporting successful session setup; retry succeeds after service recovery.
- **SC-005**: A developer following the documented local setup can complete first-visit and repeat-visit verification without obtaining a hosted service account.

## Assumptions

- **User-approved scope**: Session-first cookie lookup, external Redis, local Compose support, and simplicity/readability are explicit requirements from this request. This artifact specifies that work; it does not implement it.
- **Repository evidence**: The current tenant layout invokes tenant resolution directly. [Tenant strategy](../../docs/multi-tenancy.md) allows a later session-first slice. [Session strategy](../../docs/session-state.md) establishes signed cookies and Redis ownership. [Local services strategy](../../docs/docker-compose.md) describes intended infrastructure, but no Compose file currently exists in this checkout.
- **Ordering interpretation**: Lookup happens first; host/tenant validation still precedes accepting or persisting a tenant binding. This reconciles the requested order with the [constitution](../../.specify/memory/constitution.md). A store outage can stop processing before tenant validation.
- **Lifecycle default**: Use a configurable fixed lifetime, defaulting to 24 hours from creation, with no sliding renewal in this increment. The record and cookie expire together; earlier record loss starts a fresh session. This is an assumption for review, not an existing product rule.
- **Scope boundary**: No login, OIDC callback, logout, authenticated identity, form drafts, business persistence, new UI, production Redis provisioning, high availability, or additional Compose services are included.
- **Local behavior**: Local HTTP supports development cookies without requiring production HTTPS; host-only and script-inaccessible restrictions remain. Existing static tenant configuration is preserved.
- **Planning dependency**: Consult the existing session strategy for its official Redis client and signing-library choices. Determine the framework-supported request boundary for setting cookies before response rendering during planning; no specific mechanism is prescribed here.
- **Documentation follow-up**: Implementation must update session and tenancy strategy descriptions to reflect the specified ordering and lifecycle, and local service instructions to distinguish what actually exists from future infrastructure.
- **Verification boundary**: Request ordering, cookie protections, persistence, expiry, and failure behavior require meaningful request/store integration checks. Browser checks cover first visit and continuity; a static page-text assertion alone is insufficient evidence.
