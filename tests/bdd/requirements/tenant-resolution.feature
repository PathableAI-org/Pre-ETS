@preets-tenant-006
Feature: Tenant diagnostic observation
  The diagnostic HTTP endpoint returns the complete parsed tenant
  configuration selected for the request.

  Scenario: Host-mode requests return each selected tenant configuration
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    When a visitor requests "/_test/tenant-config" at "springfield.example.test"
    Then the response status is 200
    And the response header "Cache-Control" is "private, no-store"
    And the response JSON equals the independently parsed "springfield" tenant file
    When a visitor requests "/_test/tenant-config" at "shelbyville.example.test"
    Then the response status is 200
    And the response header "Cache-Control" is "private, no-store"
    And the response JSON equals the independently parsed "shelbyville" tenant file
    When a visitor requests "/_test/tenant-config" at "springfield.example.test"
    Then the response status is 200
    And the response header "Cache-Control" is "private, no-store"
    And the response JSON equals the independently parsed "springfield" tenant file

  Scenario Outline: Static-mode requests return the configured tenant configuration for any host
    Given production tenant sites for Springfield and Shelbyville
    And static resolution selects Shelbyville
    And BASE_HOSTNAME is not configured
    When a visitor requests "/_test/tenant-config" at "<host>"
    Then the response status is 200
    And the response header "Cache-Control" is "private, no-store"
    And the response JSON equals the independently parsed "shelbyville" tenant file

    Examples:
      | host                     |
      | springfield.example.test |
      | unknown.example.test     |
      | 127.0.0.1                |
