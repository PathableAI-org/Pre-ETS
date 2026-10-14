Feature: Production application on-site preview safeguard
  This checks the application-level development-only route guard.
  It does not establish production ingress blocking of /_test/* traffic.

  Scenario: The production app does not render the on-site preview
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    When a visitor requests "/_test/onsite" at "springfield.example.test"
    Then the response status is 404
    And the response has no redirect
