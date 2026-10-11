@preets-tenant-004
@preets-tenant-005
Feature: Unavailable tenant dashboard reachability
  The dashboard is missing when a host cannot select a tenant file, and a server
  failure when static mode selects an alias with no file.
  A parsed directory setting that does not exist or cannot be read is a server
  failure. Unreadable or malformed selected files are ordinary missing tenants
  in either mode.

  Scenario: An absent path on a reachable tenant is not found
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    When a visitor requests the document at "springfield.example.test"
    Then the response status is 200
    When a visitor requests "/this-page-is-absent" at "springfield.example.test"
    Then the response status is 404
    And invalid tenant navigation presents the ordinary missing page

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

  @preets-tenant-006
  Scenario Outline: Directory failures produce server failures in both interfaces
    Given production tenant sites for Springfield and Shelbyville
    And tenant resolution uses "<mode>" mode
    And the tenant directory is "<condition>"
    When a visitor requests the document at "springfield.example.test"
    Then the response status is 500
    And the response contains no fallback tenant
    When a visitor requests "/_test/tenant-config" at "springfield.example.test"
    Then the response status is 500
    And the response header "Cache-Control" is "private, no-store"
    And the response contains no fallback tenant

    Examples:
      | mode   | condition       |
      | host   | nonexistent     |
      | static | nonexistent     |
      | host   | not a directory |
      | static | not a directory |
      | host   | unreadable      |
      | static | unreadable      |

  @preets-tenant-006
  Scenario Outline: Unusable selected files are ordinary missing tenants in both interfaces
    Given production tenant sites for Springfield and Shelbyville
    And tenant resolution uses "<mode>" mode
    And the selected Springfield tenant file is "<condition>"
    When a visitor requests the document at "springfield.example.test"
    Then the response status is 404
    And the response contains no fallback tenant
    When a visitor requests "/_test/tenant-config" at "springfield.example.test"
    Then the response status is 404
    And the response header "Cache-Control" is "private, no-store"
    And the response contains no fallback tenant

    Examples:
      | mode   | condition      |
      | host   | unreadable     |
      | static | unreadable     |
      | host   | invalid JSON   |
      | static | invalid JSON   |
      | host   | schema-invalid |
      | static | schema-invalid |

  @preets-tenant-006
  Scenario Outline: Missing selected files retain the mode-specific response in both interfaces
    Given production tenant sites for Springfield and Shelbyville
    And tenant resolution uses "<mode>" mode
    And the selected Springfield tenant file is "missing"
    When a visitor requests the document at "springfield.example.test"
    Then the response status is <status>
    And the response contains no fallback tenant
    When a visitor requests "/_test/tenant-config" at "springfield.example.test"
    Then the response status is <status>
    And the response header "Cache-Control" is "private, no-store"
    And the response contains no fallback tenant

    Examples:
      | mode   | status |
      | host   | 404    |
      | static | 500    |
