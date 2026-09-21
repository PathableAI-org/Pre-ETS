@tenant-resolution @US1 @production
Feature: Visitors see the Display Name of the tenant associated with their address
  As a user
  I want the landing page to identify the tenant whose address I visited
  So that I can recognize the organization without receiving another tenant's configuration

  Background:
    Given production-like host association is enabled in production
    And the known synthetic tenants are:
      | slug        | Display Name     |
      | springfield | Springfield Demo |
      | shelbyville | Shelbyville Demo |

  @FR-002 @FR-003 @SC-002 @http
  Scenario Outline: A disallowed or unknown host is refused
    When the user opens the landing page at "<host>"
    Then access is refused with HTTP status 403 without a redirect
    And no successful tenant context is returned
    And neither known tenant's Display Name is displayed

    Examples:
      | host                              |
      | pathable.com                      |
      | www.pathable.com                  |
      | a.b.pathable.com                  |
      | unknown.pathable.com              |
      | springfield.example.com           |
      | springfield.pathable.com.evil.test |
      | localhost                         |

  @FR-002 @SC-002 @http
  Scenario Outline: An unreadable host reaching the application is refused
    Given the visitor's request reaches the application with "<condition>"
    When the user requests the landing page
    Then access is refused with HTTP status 403 without a redirect
    And no successful tenant context is returned

    Examples:
      | condition                              |
      | a missing host                         |
      | a comma-separated pair of host values  |
      | a host containing an invalid DNS label |

  @FR-004 @SC-006 @http
  Scenario Outline: Competing caller values cannot select another tenant
    Given the authoritative host is "<host>"
    And caller-supplied forwarded-host, tenant headers, and query values suggest "shelbyville"
    When the user requests the landing page
    Then the visit has outcome "<outcome>"
    And the landing page does not display the tenant Display Name "Shelbyville Demo"

    Examples:
      | host                     | outcome                                      |
      | springfield.pathable.com | displays tenant Display Name Springfield Demo |
      | unknown.pathable.com     | HTTP 403 refusal without a redirect           |

  @FR-004 @FR-005 @FR-012 @SC-005 @contract
  Scenario: Multiple consumers use one established tenant determination
    Given the visitor's request has been associated with tenant "springfield"
    When consumers repeatedly read the established tenant context and configuration
    Then every consumer receives tenant "springfield" and Display Name "Springfield Demo"

  @FR-013 @SC-006 @contract
  Scenario Outline: Configuration failures never become a different tenant
    Given the configuration read for "springfield" has failure "<failure>"
    When the resolver consumes the configuration result for the established tenant "springfield"
    Then a configuration failure prevents a successful tenant context
    And the failure does not become another tenant or expose tenant Display Names
    And the error response contains neither known tenant's Display Name
    And diagnostics identify "<category>" without exposing another tenant's data

    Examples:
      | failure                                       | category                  |
      | the source returns a record for shelbyville    | configuration mismatch    |
      | the source cannot complete the read            | configuration unavailable |

  @FR-015 @contract @browser
  Scenario: Equal Display Names do not merge tenant identities
    Given both known tenants have Display Name "Regional Training"
    When two users visit their respective tenant landing pages
    Then both visitors see the tenant Display Name "Regional Training"
    And the Springfield visitor's tenant identity remains "springfield"
    And the Shelbyville visitor's tenant identity remains "shelbyville"

  @FR-015 @SC-007 @contract @http
  Scenario Outline: A known tenant requires a usable Display Name
    Given the configuration for "springfield" has "<invalid_name>"
    When the user opens the landing page at "springfield.pathable.com"
    Then the response has HTTP status 500 without a redirect
    And a visible configuration failure prevents a successful tenant context
    And neither the slug nor another tenant's name is used as a Display Name fallback

    Examples:
      | invalid_name                    |
      | no Display Name field           |
      | a numeric Display Name of 42    |
      | an empty Display Name           |
      | a whitespace-only Display Name  |
