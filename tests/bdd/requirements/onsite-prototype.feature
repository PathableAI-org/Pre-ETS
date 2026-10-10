Feature: Local on-site report preview boundary
  The feedback form is available during development but cannot be served as an
  unauthenticated page in production.

  Scenario: Production refuses the on-site prototype
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    When a visitor requests "/onsite" at "springfield.example.test"
    Then the response status is 404
    And the response has no redirect

  @development
  Scenario: Development serves the on-site prototype without a special flag
    Given production tenant sites for Springfield and Shelbyville
    And static resolution selects Shelbyville
    When a visitor requests "/onsite" at "127.0.0.1"
    Then the response status is 200
