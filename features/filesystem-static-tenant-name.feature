@tenant-config-fs @US2
Feature: Developers select a static tenant by name from the filesystem directory
  As a user developing the application locally
  I want to name one tenant and load its file from the shared configuration directory
  So that local work does not require a full inline configuration document

  Background:
    Given a tenant configuration directory is configured
    And the directory contains synthetic tenant files:
      | alias       | Display Name     |
      | springfield | Local Demo       |
      | shelbyville | Shelbyville Demo |
    And the application runs locally in development
    And the developer has explicitly disabled production-like host association

  @FR-001 @FR-007 @FR-008 @FR-013 @SC-003 @browser
  Scenario: Naming a static tenant shows that file's Display Name on localhost
    Given the developer sets the static tenant name to "springfield"
    When the user opens the landing page at "localhost:3000"
    Then the landing page displays the tenant Display Name "Local Demo"
    And the landing page does not display the tenant Display Name "Shelbyville Demo"
    And no tenant-shaped local address is required

  @FR-004 @FR-007 @SC-007 @contract
  Scenario: Static name resolution is not represented as host association
    Given the developer sets the static tenant name to "springfield"
    When the resolver consumes the static tenant name and filesystem configuration
    Then the current context identifies tenant "springfield" with Display Name "Local Demo"
    And the context is identified as supplied local static data rather than host-associated identity
    And the host is not used to select a tenant
    And consumers do not need knowledge of the configuration directory path

  @FR-007 @FR-013 @SC-005 @browser
  Scenario: Changing the named tenant's file updates localhost after restart
    Given the developer set the static tenant name to "springfield"
    And the user has seen "Local Demo" on the local landing page
    And the operator changed only Display Name in "springfield.json" to "Updated Local Demo" and completed the documented restart
    When the user reloads the landing page at "localhost:3000"
    Then the landing page displays the tenant Display Name "Updated Local Demo"
    And the landing page does not display the previous tenant Display Name "Local Demo"

  @FR-007 @FR-008 @SC-003 @http
  Scenario Outline: An unusable static tenant name fails with a local configuration error
    Given the developer sets the static tenant name to "<name_setting>"
    When the user opens the landing page at "localhost:3000"
    Then the response has HTTP status 500 without a redirect
    And an understandable local configuration error is displayed
    And the error explains how to supply a valid static tenant name and restart
    And no successful tenant context is returned
    And neither a default tenant nor another tenant's Display Name is displayed

    Examples:
      | name_setting              |
      | no static tenant name     |
      | a blank static tenant name |
      | unknown                   |

  @FR-006 @FR-007 @FR-010 @SC-002 @http
  Scenario Outline: An unusable file for the static tenant name fails closed
    Given the developer sets the static tenant name to "springfield"
    And the file for alias "springfield" has "<problem>"
    When the user opens the landing page at "localhost:3000"
    Then the response has HTTP status 500 without a redirect
    And an understandable local configuration error is displayed
    And no successful tenant context is returned
    And the Display Name "Shelbyville Demo" is not displayed

    Examples:
      | problem                                   |
      | malformed JSON                            |
      | missing required configuration fields     |
      | a declared tenant identity of shelbyville |

  @FR-008 @SC-006 @http @production
  Scenario Outline: Static tenant name settings cannot bypass production association
    Given the application instead runs in production
    And the developer supplied a setting to disable host association
    And the developer set the static tenant name to "springfield"
    When the user opens the landing page at "<host>"
    Then the visit has outcome "<outcome>"
    And the Display Name "Local Demo" is not displayed as a static stand-in

    Examples:
      | host                     | outcome                                 |
      | springfield.pathable.com | displays tenant Display Name Local Demo |
      | unknown.pathable.com     | HTTP 403 refusal without a redirect     |
      | localhost:3000           | HTTP 403 refusal without a redirect     |
