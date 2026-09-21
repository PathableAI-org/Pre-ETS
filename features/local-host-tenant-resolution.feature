@tenant-resolution @US3
Feature: Developers exercise production-like tenant association using local tenant addresses
  As a user developing the application locally
  I want to enable host association and check refused visits and mode safety
  So that local convenience does not hide tenant-resolution failures

  Background:
    Given the known synthetic tenants are:
      | slug        | Display Name     |
      | springfield | Springfield Demo |
      | shelbyville | Shelbyville Demo |

  @FR-003 @FR-007 @FR-008 @SC-002 @http
  Scenario Outline: Enabling association prevents static fallback
    Given the developer has enabled production-like host association
    And a local static record exists for tenant "local-demo" with Display Name "Must Not Be Used"
    When the user opens the landing page at "<host>"
    Then access is refused with HTTP status 403 without a redirect
    And no successful tenant context is returned
    And the Display Name "Must Not Be Used" is not displayed

    Examples:
      | host                       |
      | localhost:3000             |
      | unknown.localhost:3000     |
      | www.localhost:3000         |
      | a.b.localhost:3000         |
      | springfield.example:3000   |

  @FR-014 @http
  Scenario: Omitting the local mode keeps host association enabled
    Given no local resolution mode has been supplied
    And a local static record exists for tenant "local-demo" with Display Name "Must Not Be Used"
    When the user opens the landing page at "localhost:3000"
    Then access is refused with HTTP status 403 without a redirect
    And the Display Name "Must Not Be Used" is not displayed

  @FR-014 @contract
  Scenario: An invalid mode cannot silently disable host association
    Given the developer supplied the unsupported resolution mode "automatic"
    And a local static record exists for tenant "local-demo" with Display Name "Must Not Be Used"
    When the resolver handles "springfield.localhost:3000" and "unknown.localhost:3000"
    Then host association remains enforced for both requests
    And the known host resolves tenant "springfield" with Display Name "Springfield Demo"
    And the unknown host is denied without a successful tenant context
    And neither result uses the local static record
    And diagnostics report "invalid-mode" with accepted-mode guidance without echoing the supplied value

  @FR-015 @FR-016 @SC-007 @browser
  Scenario: Host-associated names are accessible text without changing keyboard navigation
    Given the developer has enabled production-like host association
    And tenant "springfield" has Display Name "<Demo & Training>"
    When the user opens the landing page at "springfield.localhost:3000"
    Then the landing page displays the literal tenant Display Name "<Demo & Training>"
    And the name is available as readable text to assistive technology
    And no markup or executable content is created from the name
    And the existing keyboard path to "Continue to Pre-ETS" remains usable
