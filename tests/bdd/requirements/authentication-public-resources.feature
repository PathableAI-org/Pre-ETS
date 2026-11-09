@partial
@preets-session-001
Feature: Public authentication and diagnostic resources
  Public callback fallback, sign-in error and diagnostics remain reachable without
  authentication or provider availability under default protection, and an absent path
  under the public test prefix is an ordinary missing page rather than a login. Callback
  acceptance, recovery content and the full public-asset assessment remain incomplete.

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

  Scenario: An absent path under the public test prefix is not found without starting login
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    When a visitor requests "/_test/this-page-is-absent" at "springfield.example.test"
    Then the response status is 404
    And the response has no redirect
    And the response issues no application or correlation cookie
