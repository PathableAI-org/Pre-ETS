@tenant-resolution @US2
Feature: Developers use supplied tenant configuration on the local landing page
  As a user developing the application locally
  I want to see my supplied tenant Display Name on localhost
  So that configuration-dependent work does not require tenant-host setup

  Background:
    Given the application runs locally without a durable tenant store
    And the developer has explicitly disabled production-like host association

  @FR-007 @FR-009 @FR-011 @FR-016 @SC-003 @browser
  Scenario: Follow the local instructions to see supplied configuration
    Given the developer follows the documented instructions to supply tenant "springfield" with only Display Name "Local Demo"
    When the user opens the landing page at "localhost:3000"
    Then the landing page displays the tenant Display Name "Local Demo"
    And no tenant-shaped local address is required

  @FR-009 @SC-005 @contract
  Scenario: Static configuration is not represented as host association
    Given the developer supplies tenant "springfield" with Display Name "Local Demo"
    When the user opens the landing page at "localhost:3000"
    Then the current context identifies tenant "springfield" with Display Name "Local Demo"
    And the context is identified as supplied local static data rather than host-associated identity
    And the host is not used to select a tenant

  @FR-010 @FR-011 @SC-004 @browser
  Scenario: Changing the supplied name changes the landing page after restart
    Given the developer supplied tenant "springfield" with Display Name "Local Demo"
    And the user has seen "Local Demo" on the local landing page
    And the developer changed only Display Name to "Updated Local Demo" and completed the documented restart
    When the user reloads the landing page at "localhost:3000"
    Then the landing page displays the tenant Display Name "Updated Local Demo"
    And the landing page does not display the previous tenant Display Name "Local Demo"

  @FR-010 @FR-011 @FR-015 @SC-004 @SC-007 @http
  Scenario Outline: Invalid supplied data gives an actionable local error
    Given the supplied local tenant data has "<problem>"
    When the user opens the landing page at "localhost:3000"
    Then an understandable local configuration error is displayed
    And the error explains how to supply valid data and restart
    And no successful tenant context is returned
    And neither a default tenant nor the slug is displayed as a replacement name

    Examples:
      | problem                            |
      | no supplied record                 |
      | a missing tenant slug              |
      | inconsistent tenant identity       |
      | no Display Name field              |
      | a numeric Display Name of 42       |
      | an empty Display Name              |
      | a whitespace-only Display Name     |

  @FR-015 @FR-016 @SC-007 @browser
  Scenario Outline: Supplied names remain readable text
    Given the developer supplies tenant "springfield" with Display Name "<name>"
    When the user opens the landing page at "localhost:3000"
    Then the landing page displays the literal tenant Display Name "<name>"
    And the name is available as readable text to assistive technology
    And no markup or executable content is created from the name

    Examples:
      | name                                  |
      | Springfield Community Training        |
      | <Demo & Training>                     |
      | <script>alert('tenant')</script>       |

  @FR-016 @SC-007 @browser
  Scenario: The tenant name preserves the existing keyboard journey
    Given the developer supplies tenant "springfield" with Display Name "Local Demo"
    And the user has opened the local landing page
    When the user navigates the page using the keyboard
    Then the user can reach the existing "Continue to Pre-ETS" button with visible focus
    And the page retains a meaningful top-level heading
    And the tenant Display Name "Local Demo" remains readable
