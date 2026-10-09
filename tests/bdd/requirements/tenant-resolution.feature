@preets-tenant-006
@development
Feature: Tenant diagnostic observation
  The diagnostic HTTP endpoint reports the effective tenant resolution
  mode from application configuration.

  Scenario: Host-mode application reports host resolutionMode
    Given production tenant sites for Springfield and Shelbyville
    When a visitor requests "/_test/tenant-config" at "127.0.0.1"
    Then the response status is 200
    And the response header "Cache-Control" is "private, no-store"
    And the response JSON field "resolutionMode" is "host"

  Scenario: Static-mode application reports static resolutionMode
    Given production tenant sites for Springfield and Shelbyville
    And static development settings select Shelbyville
    When a visitor requests "/_test/tenant-config" at "127.0.0.1"
    Then the response status is 200
    And the response header "Cache-Control" is "private, no-store"
    And the response JSON field "resolutionMode" is "static"
