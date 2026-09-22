@tenant-config-fs @US1
Feature: Host-bound tenants load configuration from per-tenant files
  As a user
  I want the tenant whose address I visited to use only that tenant's configuration file
  So that durable per-tenant settings never substitute another organization's configuration

  Background:
    Given a tenant configuration directory is configured
    And the directory contains synthetic tenant files:
      | alias       | Display Name     |
      | springfield | Springfield Demo |
      | shelbyville | Shelbyville Demo |
    And production-like host association is enabled

  @FR-001 @FR-002 @FR-003 @FR-004 @FR-010 @SC-001 @SC-004 @browser
  Scenario Outline: A known tenant host shows the Display Name from its file
    When the user opens the landing page at "<host>"
    Then the landing page displays the tenant Display Name "<name>"
    And the landing page does not display the tenant Display Name "<other_name>"

    Examples:
      | host                       | name             | other_name       |
      | springfield.pathable.com   | Springfield Demo | Shelbyville Demo |
      | shelbyville.pathable.com   | Shelbyville Demo | Springfield Demo |
      | springfield.localhost:3000 | Springfield Demo | Shelbyville Demo |
      | shelbyville.localhost:3000 | Shelbyville Demo | Springfield Demo |

  @FR-005 @SC-002 @http
  Scenario Outline: A host alias without a matching file is refused as unknown
    Given the directory has no file for alias "unknown"
    When the user opens the landing page at "<host>"
    Then access is refused with HTTP status 403 without a redirect
    And no successful tenant context is returned
    And neither known tenant's Display Name is displayed

    Examples:
      | host                     |
      | unknown.pathable.com     |
      | unknown.localhost:3000   |

  @FR-006 @FR-010 @SC-002 @contract @http
  Scenario Outline: An unusable tenant file fails as configuration unavailable
    Given the file for alias "springfield" has "<problem>"
    When the user opens the landing page at "springfield.pathable.com"
    Then the response has HTTP status 500 without a redirect
    And a visible configuration failure prevents a successful tenant context
    And the failure does not become another tenant or expose tenant Display Names
    And diagnostics identify "<category>" without exposing another tenant's data

    Examples:
      | problem                                         | category                  |
      | malformed JSON                                  | configuration unavailable |
      | missing required configuration fields           | configuration unavailable |
      | an empty Display Name                           | configuration unavailable |
      | a declared tenant identity of shelbyville       | configuration mismatch    |
      | an unreadable file                              | configuration unavailable |

  @FR-001 @FR-006 @SC-002 @contract @http
  Scenario Outline: An unusable configuration directory fails visibly
    Given the tenant configuration directory setting has "<problem>"
    When the user opens the landing page at "springfield.pathable.com"
    Then the response has HTTP status 500 without a redirect
    And a visible configuration failure prevents a successful tenant context
    And neither known tenant's Display Name is displayed
    And diagnostics identify "configuration unavailable" without treating the outcome as a quiet empty tenant set

    Examples:
      | problem                        |
      | a missing path                 |
      | an empty path                  |
      | a path that is not a directory |

  @FR-002 @FR-011 @SC-006 @contract
  Scenario Outline: Alias resolution cannot escape the configuration directory
    Given the host-bound alias is crafted as "<alias>"
    When the resolver reads configuration for that alias from the configured directory
    Then the read is rejected without leaving the configured directory
    And no successful tenant context is returned
    And neither known tenant's Display Name is exposed

    Examples:
      | alias                  |
      | ../outside             |
      | springfield/../secret  |
      | nested/springfield     |
      | springfield.json.bak   |

  @FR-002 @FR-012 @SC-001 @contract
  Scenario: A host-bound read opens only that tenant's file
    Given the visitor's request has been associated with tenant "springfield"
    When consumers read the established tenant configuration
    Then only the file "springfield.json" under the configured directory is opened for that request
    And the file "shelbyville.json" is not opened for that request
    And every consumer receives tenant "springfield" and Display Name "Springfield Demo"

  @FR-012 @SC-001 @browser
  Scenario: Overlapping visits preserve each visitor's file-backed configuration
    Given two users independently visit the Springfield and Shelbyville landing pages on the same running application
    When both users reload their landing pages with overlapping requests
    Then the Springfield visitor sees the tenant Display Name "Springfield Demo"
    And the Shelbyville visitor sees the tenant Display Name "Shelbyville Demo"
    And neither visitor sees the other tenant's Display Name

  @FR-010 @FR-013 @SC-005 @browser
  Scenario: Changing a tenant file updates the landing page after restart
    Given the user has seen "Springfield Demo" on the landing page at "springfield.localhost:3000"
    And the operator changed only Display Name in "springfield.json" to "Springfield Training" and completed the documented restart
    When the user reloads the landing page at "springfield.localhost:3000"
    Then the landing page displays the tenant Display Name "Springfield Training"
    And the landing page does not display the previous tenant Display Name "Springfield Demo"
    And the landing page does not display the tenant Display Name "Shelbyville Demo"
