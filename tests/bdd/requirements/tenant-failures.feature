@preets-tenant-004
@preets-tenant-005
Feature: Unavailable tenant dashboard reachability
  The dashboard is missing when a host cannot select a tenant file, and a server
  failure when static mode selects an alias with no file.

  Scenario: An absent path on a reachable tenant is not found
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    When a visitor requests the document at "springfield.example.test"
    Then the response status is 200
    When a visitor requests "/this-page-is-absent" at "springfield.example.test"
    Then the response status is 404

  Scenario: A host-mode alias with no tenant file is not found
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    When a visitor requests the document at "springfield.example.test"
    Then the response status is 200
    When a visitor requests the document at "capital-city.example.test"
    Then the response status is 404

  Scenario: A static alias with no tenant file is a server failure
    Given production tenant sites for Springfield and Shelbyville
    And static resolution selects an alias with no tenant file
    And BASE_HOSTNAME is not configured
    When a visitor requests the document at "springfield.example.test"
    Then the response status is 500

  Scenario Outline: A host outside the tenant pattern is not found
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    When a visitor requests the document at "springfield.example.test"
    Then the response status is 200
    When a visitor requests the document at "<host>"
    Then the response status is 404

    Examples:
      | host                 |
      | example.test         |
      | unknown.example.test |
      | 127.0.0.1            |
