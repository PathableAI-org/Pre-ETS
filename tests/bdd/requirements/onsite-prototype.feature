@preets-session-001
@partial
Feature: Local on-site report preview boundary
  The /_test/onsite feedback form is an explicitly public test route in
  development. Public access does not bypass tenant selection; these scenarios
  establish neither default authentication nor production ingress protection.
  The tenant-host scenario covers only unknown-alias HTTP rejection, not hosts
  outside the URL pattern, static-mode failures, or browser missing-page behavior.

  @development
  Scenario: Development serves the public on-site prototype
    Given production tenant sites for Springfield and Shelbyville
    And static resolution selects Shelbyville
    When a visitor requests "/_test/onsite" at "127.0.0.1"
    Then the response status is 200

  @development
  @preets-tenant-005
  Scenario: An invalid tenant host cannot reach the on-site prototype
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    When a visitor requests "/_test/onsite" at "springfield.example.test"
    Then the response status is 200
    When a visitor requests "/_test/onsite" at "unknown.example.test"
    Then the response status is 404
    And the response has no redirect
    And the response contains no fallback tenant
