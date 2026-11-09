@partial
@preets-session-001
Feature: Default entry-point protection
  This slice establishes that, without a usable session, a protected page navigation leads
  to the resolved tenant's provider without protected content, other requests to protected
  resources obtain no protected content, and a well-formed direct invocation of the protected
  reference Server Action is denied with 401 without performing its operation or starting
  login. Tenant failure keeps its 404 or 500 ahead of protection. Fresh browser entry is
  bounded request-level evidence that the authorization request carries max_age=0; it does
  not establish auth_time validation or a confirmed fresh event (#158). Admission of a real
  session, cross-instance recognition, tenant mismatch with a real session, public static
  assets (finding F-1) and Server Action recovery content (#157) remain incomplete.

  @preets-session-004
  Scenario Outline: A protected page navigation leads to the tenant provider
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    And the visitor's session reference is "<reference>"
    When a visitor sends "GET" to "/" at "springfield.localhost:3000" as a "document" request
    Then the response contains no protected application content
    And following the response at "springfield.localhost:3000" reaches the "springfield" tenant provider

    Examples:
      | reference           |
      | absent              |
      | malformed           |
      | well-formed unknown |

  Scenario Outline: Non-navigation requests obtain no protected content
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    And the visitor's session reference is "well-formed unknown"
    When a visitor sends "<method>" to "<path>" at "springfield.example.test" as a "<kind>" request
    Then the response contains no protected application content

    Examples:
      | method | path                            | kind          |
      | GET    | /                               | application   |
      | GET    | /                               | metadata-less |
      | GET    | /favicon.ico                    | image         |
      | GET    | /_next/image?url=%2Fx&w=16&q=75 | image         |
      | POST   | /                               | application   |
      | POST   | /an-undesignated-path           | application   |

  @preets-session-007
  Scenario Outline: A direct protected action request without a usable session performs no operation
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    And the visitor's session reference is "<reference>"
    When a visitor invokes the protected reference action at "springfield.example.test"
    Then the response status is 401
    And the response issues no reference-operation receipt
    And the response does not delegate to login
    And the response issues no application or correlation cookie
    And the response contains no protected application content

    Examples:
      | reference           |
      | absent              |
      | well-formed unknown |

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
      | GET    | /auth/login        | application |

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
  @preets-session-013
  Scenario: Fresh entry without a valid session starts tenant sign-in
    The max_age=0 observation is bounded request-level evidence for the selected freshness request only;
    it does not establish auth_time validation, which #158 owns.

    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    And the visitor's session reference is "well-formed unknown"
    When the visitor opens "/" at "springfield.localhost:3000" in a browser, refreshes a page showing it, and opens it in another page
    Then each browser entry reaches the "springfield" tenant provider without protected content
    And each browser entry's authorization request asks for fresh authentication
