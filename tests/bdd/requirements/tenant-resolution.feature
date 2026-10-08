@preets-tenant-006 @development
Feature: Tenant diagnostic observation
  The diagnostic HTTP endpoint reports the effective tenant resolution
  mode and the selected tenant configuration path.

  Scenario: Host-mode requests select each tenant configuration file
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    When a visitor requests "/_test/tenant-config" at "springfield.example.test"
    Then the response status is 200
    And the response header "Cache-Control" is "private, no-store"
    And the response JSON field "resolutionMode" is "host"
    And the selected configuration path is the "springfield" tenant file
    When a visitor requests "/_test/tenant-config" at "shelbyville.example.test"
    Then the response status is 200
    And the response header "Cache-Control" is "private, no-store"
    And the response JSON field "resolutionMode" is "host"
    And the selected configuration path is the "shelbyville" tenant file
    When a visitor requests "/_test/tenant-config" at "springfield.example.test"
    Then the response status is 200
    And the response header "Cache-Control" is "private, no-store"
    And the response JSON field "resolutionMode" is "host"
    And the selected configuration path is the "springfield" tenant file

  Scenario: Static-mode requests select the configured tenant file for any host
    Given production tenant sites for Springfield and Shelbyville
    And static development settings select Shelbyville
    And BASE_HOSTNAME is not configured
    When a visitor requests "/_test/tenant-config" at "springfield.example.test"
    Then the response status is 200
    And the response header "Cache-Control" is "private, no-store"
    And the response JSON field "resolutionMode" is "static"
    And the selected configuration path is the "shelbyville" tenant file
    When a visitor requests "/_test/tenant-config" at "unknown.example.test"
    Then the response status is 200
    And the response header "Cache-Control" is "private, no-store"
    And the response JSON field "resolutionMode" is "static"
    And the selected configuration path is the "shelbyville" tenant file
    When a visitor requests "/_test/tenant-config" at "127.0.0.1"
    Then the response status is 200
    And the response header "Cache-Control" is "private, no-store"
    And the response JSON field "resolutionMode" is "static"
    And the selected configuration path is the "shelbyville" tenant file
