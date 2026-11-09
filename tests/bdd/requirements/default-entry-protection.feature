@partial
@preets-session-001
Feature: Default entry-point protection
  This slice establishes that, without a usable session, every undesignated page path is
  delegated to tenant login for a document navigation, other requests obtain no protected
  content and are not delegated to login, and a direct protected Server Action request with
  a missing session record answers 401 without performing its operation. Tenant failure
  keeps its 404 or 500 ahead of protection. Admission of a real session, cross-instance
  recognition, tenant mismatch with a real session, public static assets and Server Action
  recovery content remain incomplete pending freshness confirmation, the asset decision and
  recovery work.

  @preets-session-004
  Scenario Outline: Undesignated navigations delegate to tenant login
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    And the visitor's session reference is "<reference>"
    When a visitor sends "GET" to "<path>" at "springfield.example.test" as a "document" request
    Then the response delegates to the same-origin login
    And the response contains no protected application content
    And the response is not cacheable
    And the response issues no application or correlation cookie

    Examples:
      | path                  | reference           |
      | /                     | absent              |
      | /                     | malformed           |
      | /                     | well-formed unknown |
      | /access-denied        | absent              |
      | /access-denied        | malformed           |
      | /access-denied        | well-formed unknown |
      | /an-undesignated-path | absent              |
      | /an-undesignated-path | malformed           |
      | /an-undesignated-path | well-formed unknown |
      | /_testing             | absent              |
      | /_testing             | malformed           |
      | /_testing             | well-formed unknown |
      | /auth/login/extra     | absent              |
      | /auth/login/extra     | malformed           |
      | /auth/login/extra     | well-formed unknown |

  Scenario Outline: Non-navigation requests obtain no protected content and do not start login
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    And the visitor's session reference is "well-formed unknown"
    When a visitor sends "<method>" to "<path>" at "springfield.example.test" as a "<kind>" request
    Then the response contains no protected application content
    And the response does not delegate to login
    And the response issues no application or correlation cookie

    Examples:
      | method | path                  | kind          |
      | GET    | /                     | application   |
      | GET    | /                     | metadata-less |
      | POST   | /                     | application   |
      | POST   | /an-undesignated-path | application   |

  @preets-session-007
  Scenario: A protected action request with a missing session record performs no operation
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    And the visitor's session reference is "well-formed unknown"
    When a visitor invokes the protected reference action at "springfield.example.test"
    Then the response status is 401
    And the response does not delegate to login
    And the response contains no protected application content
    And the response issues no application or correlation cookie

  @preets-tenant-005
  Scenario Outline: A host-mode tenant failure wins over protection
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    When a visitor sends "<method>" to "<path>" at "capital-city.example.test" as a "<kind>" request
    Then the response status is 404
    And the response has no redirect
    And the response contains no fallback tenant

    Examples:
      | method | path               | kind        |
      | GET    | /                  | document    |
      | POST   | /                  | application |
      | GET    | /login-unavailable | document    |

  @preets-tenant-004
  Scenario Outline: A static-mode missing tenant file wins over protection
    Given production tenant sites for Springfield and Shelbyville
    And static resolution selects an alias with no tenant file
    And BASE_HOSTNAME is not configured
    When a visitor sends "<method>" to "/" at "springfield.example.test" as a "<kind>" request
    Then the response status is 500
    And the response has no redirect
    And the response contains no fallback tenant

    Examples:
      | method | kind        |
      | GET    | document    |
      | POST   | application |

  @preets-session-004
  Scenario: Fresh entry without a valid session starts tenant sign-in
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    And the visitor's session reference is "well-formed unknown"
    When a visitor sends "GET" to "/" at "springfield.localhost:3000" as a "document" request
    Then the response delegates to the same-origin login
    And each fresh browser entry to "/" at "springfield.localhost:3000" reaches the Springfield provider for fresh authentication
