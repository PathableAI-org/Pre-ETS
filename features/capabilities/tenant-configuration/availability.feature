@application
Feature: Tenant configuration fails safely
  Rule: Resolving a tenant never substitutes another organization's configuration
    Background:
      Given isolated filesystem configuration for Springfield and Shelbyville

    @spec-001-FR-004 @spec-005-FR-002 @spec-005-FR-012
    Scenario Outline: A known host resolves only its tenant configuration
      When application tenant resolution handles "<host>"
      Then the resolved identity is "<tenant>" with name "<name>"
      Examples:
        | host                     | tenant      | name             |
        | springfield.pathable.com | springfield | Springfield Demo |
        | shelbyville.pathable.com | shelbyville | Shelbyville Demo |

    @spec-001-FR-015
    Scenario: Equal names do not merge tenant identities
      Given both tenant files display "Regional Training"
      When both tenant hosts are resolved concurrently
      Then the results have separate Springfield and Shelbyville identities

    @spec-005-FR-005
    Scenario: An absent tenant file is an unknown tenant
      When application tenant resolution handles "unknown.pathable.com"
      Then tenant resolution reports "unknown" without configuration

    @spec-001-FR-013 @spec-005-FR-006 @spec-005-FR-010
    Scenario Outline: Unusable tenant data cannot become another tenant
      Given Springfield's file contains "<defect>"
      When application tenant resolution handles "springfield.pathable.com"
      Then tenant resolution reports "config-error" without configuration
      Examples:
        | defect               |
        | malformed JSON       |
        | missing name         |
        | empty name           |
        | whitespace name      |
        | numeric name         |
        | mismatched identity  |

    @spec-005-FR-013
    Scenario: Reopening configuration observes the operator's changed name
      Given Springfield configuration was read before the operator changed its name
      When a fresh application resolver reads Springfield after the change
      Then the resolved identity is "springfield" with name "Springfield Training"
