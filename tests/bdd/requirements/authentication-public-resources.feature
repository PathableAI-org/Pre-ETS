@partial
@preets-session-001
Feature: Public authentication and diagnostic resources
  Existing public callback fallback, sign-in error and diagnostics remain reachable
  without authentication or provider availability. Callback acceptance, recovery
  content, comprehensive protection and the full public-asset assessment remain incomplete.

  Scenario Outline: Public authentication content is reachable without starting login
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    And Springfield preparation has "unavailable provider"
    When a visitor requests "<path>" at "springfield.example.test"
    Then the response status is 200
    And the response has no redirect
    And the response contains no protected application content
    And the response issues no application or correlation cookie

    Examples:
      | path               |
      | /auth/callback     |
      | /login-unavailable |

  @preets-tenant-006
  Scenario: Diagnostics return full selected JSON without a session or provider
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    And Springfield preparation has "unavailable provider"
    When a visitor requests "/_test/tenant-config" at "springfield.example.test"
    Then the response status is 200
    And the response has no redirect
    And the response JSON equals the independently parsed "springfield" tenant file
    And the response is not cacheable
    And the response issues no application or correlation cookie
