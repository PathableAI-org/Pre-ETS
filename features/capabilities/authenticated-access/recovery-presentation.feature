@browser @development @redis @mock-idp
Feature: Inactivity interruption presents an accessible recovery action
  Rule: Confirmed expiration removes protected content before recovery
    @spec-004-FR-009 @spec-004-FR-010
    Scenario: A seeded session's expiration presents the recovery dialog
      Given an explicitly seeded authenticated Springfield browser session with tenant name "Springfield Demo"
      And the browser opens the protected workspace
      When the server session is aged beyond inactivity and the browser requests confirmation
      Then the inactivity dialog names and describes the interruption
      And protected temporary content is removed
      And recovery starts from a focused keyboard-operable Log in again button

  Rule: Login configuration failures give accessible app-owned guidance
    @spec-003-FR-007 @spec-003-FR-008
    Scenario: A visitor can read why login cannot start
      Given a browser site whose Springfield login configuration requires a missing client secret
      When the browser opens the tenant entry page
      Then accessible failure guidance explains that login cannot start
