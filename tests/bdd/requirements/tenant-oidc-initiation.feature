@partial
Feature: Tenant OIDC initiation
  This slice establishes missing-session root denial and automatic delegation,
  tenant-specific preparation and request-side freshness through real Keycloak.
  Callback validation, recoverable correlation, stored sessions, fresh-event
  verification, valid-session reuse and Microsoft compatibility remain incomplete.

  @preets-session-001
  @preets-session-004
  Scenario Outline: Root delegates before tenant-dependent work without protected content
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    And the selected Springfield tenant file is "invalid JSON"
    And the visitor supplies application cookie "<cookie>"
    When a visitor requests the document at "<host>"
    Then the response delegates to the same-origin login
    And the response contains no protected application content
    And the response is not cacheable
    And the response issues no application or correlation cookie

    Examples:
      | host                     | cookie          |
      | springfield.example.test | fabricated      |
      | example.test             | arbitrary-value |

  @preets-session-001
  @preets-session-002
  @preets-session-004
  @preets-session-013
  @preets-tenant-003
  Scenario: First-time browser entry delegates automatically to the selected real provider
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    When a visitor requests the document at "springfield.example.test"
    Then the response delegates to the same-origin login
    When a visitor requests "/auth/login" at "springfield.example.test"
    Then initiation uses the independently configured "springfield" tenant
    And the authorization request asks for fresh authentication
    And the response is not cacheable
    And the response issues no application or correlation cookie
    And browser entry at "springfield.example.test" reaches the real tenant provider

  @preets-session-001
  @preets-session-002
  Scenario Outline: Unavailable preparation leaves access denied with public failure content
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    And Springfield preparation has "<failure>"
    When a visitor requests the document at "springfield.example.test"
    Then the response delegates to the same-origin login
    When a visitor requests "/auth/login" at "springfield.example.test"
    Then the response delegates to public sign-in failure
    And the response contains no protected application content
    And the response issues no application or correlation cookie
    When a visitor requests "/login-unavailable" at "springfield.example.test"
    Then the response status is 200
    And the response has no redirect
    And the response issues no application or correlation cookie
    And browser entry at "springfield.example.test" reaches public sign-in failure

    Examples:
      | failure              |
      | no callback origin   |
      | unavailable provider |
