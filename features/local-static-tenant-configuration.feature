@tenant-resolution @US2
Feature: Local static tenant Display Names remain accessible text
  As a user developing the application locally
  I want tenant Display Names on localhost to stay readable and keyboard-reachable
  So that local configuration work does not regress accessibility

  Background:
    Given the developer has explicitly disabled production-like host association

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
