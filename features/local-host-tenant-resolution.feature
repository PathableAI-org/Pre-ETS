@tenant-resolution @US3
Feature: Developers exercise production-like tenant association using local tenant addresses
  As a user developing the application locally
  I want to enable host association and check both successful and refused visits
  So that local convenience does not hide tenant-resolution failures

  Background:
    Given the application runs locally without a durable tenant store
    And the known synthetic tenants are:
      | slug        | Display Name     |
      | springfield | Springfield Demo |
      | shelbyville | Shelbyville Demo |

  @FR-007 @FR-008 @FR-011 @FR-016 @SC-003 @browser
  Scenario Outline: Tenant-shaped local addresses display the associated name
    Given the developer follows the documented instructions to enable production-like host association
    When the user opens the landing page at "<host>"
    Then the landing page displays the tenant Display Name "<name>"
    And the current tenant identity is "<slug>"

    Examples:
      | host                       | slug        | name             |
      | springfield.localhost:3000 | springfield | Springfield Demo |
      | shelbyville.localhost:3000 | shelbyville | Shelbyville Demo |
      | springfield.localhost:3100 | springfield | Springfield Demo |

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
    When the user attempts to open the local landing page
    Then host association is not disabled
    And either host association remains enforced or startup is prevented with an understandable configuration error

  @FR-007 @SC-006 @http
  Scenario Outline: Local settings cannot bypass production association
    Given the application instead runs in production
    And the developer supplied a setting to disable host association
    And a local static record exists for tenant "local-demo" with Display Name "Must Not Be Used"
    When the user opens the landing page at "<host>"
    Then the visit has outcome "<outcome>"
    And the Display Name "Must Not Be Used" is not displayed

    Examples:
      | host                     | outcome                                      |
      | springfield.pathable.com | displays tenant Display Name Springfield Demo |
      | unknown.pathable.com     | HTTP 403 refusal without a redirect           |
      | localhost:3000           | HTTP 403 refusal without a redirect           |

  @FR-015 @FR-016 @SC-007 @browser
  Scenario: Host-associated names are accessible text without changing keyboard navigation
    Given the developer has enabled production-like host association
    And tenant "springfield" has Display Name "<Demo & Training>"
    When the user opens the landing page at "springfield.localhost:3000"
    Then the landing page displays the literal tenant Display Name "<Demo & Training>"
    And the name is available as readable text to assistive technology
    And no markup or executable content is created from the name
    And the existing keyboard path to "Continue to Pre-ETS" remains usable
