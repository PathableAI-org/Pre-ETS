@preets-session-001
@partial
Feature: Local on-site report preview boundary
  The /_test/onsite feedback form is an explicitly public test route in
  development, but its app page is not served in production. These scenarios
  establish neither default authentication nor production ingress protection.

  Scenario: Production refuses the on-site prototype
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    When a visitor requests "/_test/onsite" at "springfield.example.test"
    Then the response status is 404
    And the response has no redirect

  @development
  Scenario: Development serves the on-site prototype without a special flag
    Given production tenant sites for Springfield and Shelbyville
    And static resolution selects Shelbyville
    When a visitor requests "/_test/onsite" at "127.0.0.1"
    Then the response status is 200
