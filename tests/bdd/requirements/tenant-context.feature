@preets-tenant-003
Feature: Dashboard reachability
  The dashboard is reachable when a tenant can be selected.
  Unavailable-tenant outcomes are not part of these scenarios.

  Scenario: Host-mode requests reach the dashboard for each selected tenant
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    When a visitor requests the document at "springfield.example.test"
    Then the response status is 200
    When a visitor requests the document at "shelbyville.example.test"
    Then the response status is 200
    When a visitor requests the document at "springfield.example.test"
    Then the response status is 200

  Scenario Outline: Static-mode requests reach the dashboard for any host
    Given production tenant sites for Springfield and Shelbyville
    And static resolution selects Shelbyville
    And BASE_HOSTNAME is not configured
    When a visitor requests the document at "<host>"
    Then the response status is 200

    Examples:
      | host                     |
      | springfield.example.test |
      | unknown.example.test     |
      | 127.0.0.1                |
