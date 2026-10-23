@partial
Feature: Validate the selected tenant OIDC callback
  This slice recovers one tenant-bound provider attempt across frontend instances,
  validates the OIDC response, and yields no application session or protected access.
  Session creation, freshness comparison and full callback presentation remain incomplete.

  @preets-session-002
  @preets-session-003
  Scenario: Real provider completion crosses application instances once
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    When the visitor completes real provider sign-in across two application instances at "springfield.localhost:3000"
    Then the response status is 204
    And the response body is empty
    And the response is not cacheable
    And the callback clears correlation and creates no application session
    And the response contains no protected application content

  @preets-session-002
  Scenario: A wrong-state callback preserves the original valid provider return
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    When the visitor submits a wrong-state callback before the captured valid return at "springfield.localhost:3000"
    Then the response status is 204
    And the response body is empty
    And the response clears recoverable correlation and issues no application session

  @preets-session-002
  Scenario: Cross-tenant mismatch cannot consume the original provider return
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    When the captured Springfield return is first submitted to Shelbyville and then Springfield
    Then the response status is 204
    And the response body is empty
    And the response clears recoverable correlation and issues no application session

  @preets-session-002
  Scenario: Concurrent consumption has one winner and replay has none
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    When two application instances race the same captured valid return at "springfield.localhost:3000"
    Then exactly one raced callback succeeds and replay is denied
    And the response clears recoverable correlation and issues no application session

  @preets-session-002
  Scenario: Expired recovery denies without protected content
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    And the recoverable authentication lifetime is 1 second
    When the visitor submits the captured provider return after it expires at "springfield.localhost:3000"
    Then the response status is 200
    And the response has no redirect
    And the response contains no protected application content
    And the response issues no application or correlation cookie

  @preets-security-001
  @preets-session-002
  Scenario: Controlled provider denial is handled without disclosure
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    When the visitor submits a matching controlled provider denial at "springfield.localhost:3000"
    Then the response status is 200
    And the response has no redirect
    And the response contains no protected application content
    And the response clears recoverable correlation and issues no application session
    And the response does not re-emit controlled provider callback data
