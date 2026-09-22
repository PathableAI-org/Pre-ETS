@application
Feature: Trusted tenant settings define inactivity duration
  Rule: Only whole-minute durations from 5 through 30 are valid
    @spec-004-FR-001 @spec-004-FR-002
    Scenario Outline: Valid configuration supplies the effective duration
      When production tenant parsing receives inactivity choice "<choice>"
      Then the effective inactivity duration is <minutes> minutes
      Examples:
        | choice  | minutes |
        | omitted | 30      |
        | 5       | 5       |
        | 17      | 17      |
        | 30      | 30      |

    @spec-004-FR-002
    Scenario Outline: An invalid explicit duration cannot silently become the default
      When production tenant parsing receives inactivity choice "<choice>"
      Then the tenant configuration is rejected
      Examples:
        | choice  |
        | 4       |
        | 31      |
        | 0       |
        | -1      |
        | 5.5     |
        | disable |
        | text    |
