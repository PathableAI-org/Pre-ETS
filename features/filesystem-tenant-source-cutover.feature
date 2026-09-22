@tenant-config-fs @US3
Feature: Filesystem tenant files replace inline configuration documents
  As a user operating or developing the application
  I want one authoritative filesystem configuration source
  So that inline multi-tenant and full static JSON documents cannot diverge from durable files

  Background:
    Given a tenant configuration directory is configured
    And the directory contains synthetic tenant files:
      | alias       | Display Name        |
      | springfield | Filesystem Demo     |
      | shelbyville | Shelbyville Files   |

  @FR-001 @FR-009 @FR-013 @SC-004 @browser
  Scenario: Host association works from files without inline multi-tenant JSON
    Given no former inline multi-tenant configuration document is supplied
    And production-like host association is enabled
    When the user opens the landing page at "springfield.localhost:3000"
    Then the landing page displays the tenant Display Name "Filesystem Demo"
    And the landing page does not display the tenant Display Name "Shelbyville Files"

  @FR-007 @FR-009 @FR-013 @SC-003 @browser
  Scenario: Static mode works from a tenant name without a full static JSON document
    Given no former full static configuration document is supplied
    And the application runs locally in development
    And the developer has explicitly disabled production-like host association
    And the developer sets the static tenant name to "springfield"
    When the user opens the landing page at "localhost:3000"
    Then the landing page displays the tenant Display Name "Filesystem Demo"
    And no successful context depends on a full static JSON environment document

  @FR-009 @SC-004 @SC-007 @contract
  Scenario: Filesystem configuration wins over a conflicting inline multi-tenant document
    Given production-like host association is enabled
    And a former inline multi-tenant configuration document still supplies tenant "springfield" with Display Name "Inline Must Not Win"
    When the unchanged consumer resolves "springfield.localhost:3000" and reads its established tenant configuration
    Then the returned context identifies tenant "springfield" with Display Name "Filesystem Demo"
    And the Display Name "Inline Must Not Win" is not used
    And the consumer does not need knowledge of the filesystem configuration source

  @FR-007 @FR-009 @SC-003 @SC-007 @contract
  Scenario: Filesystem configuration wins over a conflicting full static JSON document
    Given the application runs locally in development
    And the developer has explicitly disabled production-like host association
    And the developer sets the static tenant name to "springfield"
    And a former full static configuration document still supplies tenant "springfield" with Display Name "Inline Static Must Not Win"
    When the resolver consumes the static tenant name and configuration source
    Then the current context identifies tenant "springfield" with Display Name "Filesystem Demo"
    And the Display Name "Inline Static Must Not Win" is not used
    And the context is identified as supplied local static data rather than host-associated identity

  @FR-004 @FR-009 @SC-007 @contract
  Scenario: Replacing only the configuration source preserves tenant selection behavior
    Given an alternative filesystem test directory supplies tenant "springfield" with Display Name "Springfield Training"
    When the unchanged consumer resolves "springfield.pathable.com" and reads its established tenant configuration
    Then the returned context identifies tenant "springfield" with Display Name "Springfield Training"
    And the consumer does not need knowledge of the replacement configuration source
    And the consumer does not reinterpret the host to choose a configuration file
