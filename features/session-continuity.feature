@session-setup @US1
Feature: Tenant session continuity
  Visitors automatically start and reuse a session on their tenant site.

  Background:
    Given session setup has known tenants "springfield" and "shelbyville"
    And the external session store is available and isolated for this scenario

  @FR-001 @FR-002 @FR-003 @FR-005 @FR-011 @SC-001 @http @contract
  Scenario: First visit establishes a session before rendering tenant content
    Given the visitor has no session cookie
    When the visitor opens "https://springfield.pathable.com/"
    Then cookie inspection precedes tenant resolution
    And tenant validation precedes persistence of the new session
    And the new session contains tenant id "springfield" and no authenticated identity
    And persistence succeeds before the session cookie is issued
    And downstream handling of this request receives that same session
    And the visitor receives the existing Springfield tenant page without additional action

  @FR-001 @FR-002 @FR-004 @SC-001 @http @contract
  Scenario: Returning visitor reuses a session after tenant validation
    Given the visitor has a valid unexpired session for "springfield"
    When the visitor opens "https://springfield.pathable.com/"
    Then the referenced session is loaded before tenant resolution
    And the session is accepted only after its tenant matches the validated host tenant
    And the original session id and tenant binding are retained
    And no replacement session is created

  @FR-005 @SC-003 @http @contract
  Scenario: Session survives a frontend restart
    Given the visitor has a valid unexpired session for "springfield"
    And the frontend has restarted while the external session record remains available
    When the visitor opens "https://springfield.pathable.com/"
    Then the original session id and tenant binding are retained
    And the visitor receives the existing Springfield tenant page without additional action

  @FR-003 @FR-012 @contract
  Scenario: Repeated access within one request shares a single session
    Given the visitor has no session cookie
    And the tenant page needs the session more than once during the request
    When the visitor opens "https://springfield.pathable.com/"
    Then exactly one new session is persisted for the request
    And every downstream session access receives that session
    And the response contains no conflicting session cookies

  @FR-006 @http @contract @production
  Scenario: Production cookie protects the session reference
    Given the application instead runs in production
    And the visitor has no session cookie
    When the visitor opens "https://springfield.pathable.com/"
    Then the session cookie is host-only, HttpOnly, and Secure
    And its signed application claims contain only a session reference, tenant binding, and expiry
    And it contains no authenticated identity or session payload
    And possession of the cookie does not authenticate the visitor

  @FR-007 @contract
  Scenario Outline: Session lifetime is fixed and shared by cookie and record
    Given the session lifetime is "<configuration>"
    And the visitor has a session created at "2026-09-15T10:00:00Z" for "springfield"
    And the current time is "2026-09-15T10:30:00Z"
    When the visitor opens "https://springfield.pathable.com/"
    Then the original session id and tenant binding are retained
    And both the cookie and stored session expire at "<expiry>"
    And the visit does not extend either expiry

    Examples:
      | configuration | expiry               |
      | default       | 2026-09-16T10:00:00Z |
      | 2 hours       | 2026-09-15T12:00:00Z |

  @FR-007 @http @contract
  Scenario: Session is replaced at its expiry boundary
    Given the visitor has a session for "springfield" expiring at "2026-09-16T10:00:00Z"
    And the current time is "2026-09-16T10:00:00Z"
    When the visitor opens "https://springfield.pathable.com/"
    Then a fresh session for "springfield" replaces the expired session reference
    And none of the expired session state is carried forward

  @FR-003 @http
  Scenario: Refusing cookies permits a fresh session on the next visit
    Given the visitor previously received a session but the browser refused its cookie
    When the visitor opens "https://springfield.pathable.com/"
    Then a new session for "springfield" is issued without reusing the previous id
    And the visitor receives the existing Springfield tenant page without additional action

  @FR-003 @http @contract
  Scenario Outline: Resource fetching does not establish sessions
    Given the visitor has no session cookie
    When the browser fetches an existing "<resource>" from the tenant site
    Then no session is created and no session cookie is issued

    Examples:
      | resource           |
      | static asset       |
      | framework resource |
