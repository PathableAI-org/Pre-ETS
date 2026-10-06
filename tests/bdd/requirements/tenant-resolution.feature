@preets-tenant-006 @development
Feature: Tenant diagnostic observation
  The diagnostic HTTP endpoint for PREETS-TENANT-006 is available
  at the application boundary.

  Scenario: The tenant diagnostic endpoint is available
    When a visitor requests "/_test/tenant-config" at "127.0.0.1"
    Then the response status is 200
    And the response header "Cache-Control" is "private, no-store"
