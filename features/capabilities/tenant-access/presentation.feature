@browser @development @redis @mock-idp
Feature: Authenticated users recognize their organization
  Rule: Tenant names are readable literal text within the protected workspace
    @spec-001-FR-015 @spec-001-FR-016 @spec-005-FR-003
    Scenario Outline: Authenticated tenant presentation is accessible and literal
      Given an explicitly seeded authenticated Springfield browser session with tenant name "<name>"
      When the browser opens the protected workspace
      Then the authenticated workspace visibly presents "<name>" as literal tenant text
      And the workspace has an accessible heading and keyboard-operable continuation
      Examples:
        | name                            |
        | Springfield Community Training  |
        | <Demo & Training>               |
        | <script>alert('tenant')</script> |
