@idle-session-timeout @US3
Feature: Configure tenant inactivity duration
  Authorized tenant representatives select whole-minute durations for new sessions through trusted configuration management.

  Background:
    Given idle-timeout tenants "springfield" and "shelbyville" have independent trusted configuration
    And the representative is authorized to manage only Springfield's timeout
    And Springfield's persisted timeout is 15 minutes
    And Shelbyville's persisted timeout is 20 minutes

  @FR-001 @FR-002 @FR-003 @SC-001 @SC-004 @contract
  Scenario Outline: Every whole minute in the permitted range is accepted
    When the representative establishes a timeout of <minutes> minutes for "springfield"
    Then the persisted Springfield choice is <minutes> minutes
    And a new authenticated Springfield session uses <minutes> minutes
    And Shelbyville's persisted choice remains 20 minutes

    Examples:
      | minutes |
      | 5       |
      | 6       |
      | 7       |
      | 8       |
      | 9       |
      | 10      |
      | 11      |
      | 12      |
      | 13      |
      | 14      |
      | 15      |
      | 16      |
      | 17      |
      | 18      |
      | 19      |
      | 20      |
      | 21      |
      | 22      |
      | 23      |
      | 24      |
      | 25      |
      | 26      |
      | 27      |
      | 28      |
      | 29      |
      | 30      |

  @FR-002 @SC-001 @contract
  Scenario: Omitted tenant choice uses the default
    Given Springfield has no explicit timeout choice
    When the user starts a new authenticated Springfield session
    Then that session uses a 30-minute idle duration

  @FR-001 @FR-002 @FR-003 @SC-001 @SC-004 @contract
  Scenario Outline: Invalid proposed settings preserve the existing choice
    When the representative proposes "<choice>" for Springfield's timeout
    Then the proposed timeout is rejected
    And Springfield's persisted choice remains 15 minutes
    And new Springfield sessions continue using 15 minutes

    Examples:
      | choice             |
      | 4 minutes          |
      | 31 minutes         |
      | 0 minutes          |
      | -1 minutes         |
      | 5.5 minutes        |
      | disable expiration |
      | malformed text     |

  @FR-003 @SC-004 @contract
  Scenario: A representative without configuration authority cannot change policy
    Given the representative no longer has authority to manage Springfield's timeout
    When the representative proposes a 5-minute Springfield timeout
    Then the policy change is denied
    And Springfield's persisted choice remains 15 minutes

  @FR-003 @SC-004 @contract
  Scenario: Tenant authority does not extend to another tenant
    When the representative proposes a 5-minute Shelbyville timeout
    Then the policy change is denied
    And Shelbyville's persisted choice remains 20 minutes
    And Springfield's persisted choice remains 15 minutes

  @FR-003 @SC-004 @contract
  Scenario Outline: Changes apply only to newly authenticated sessions
    Given Springfield's persisted duration is <old> minutes
    And an existing Springfield session authenticated at "09:00:00" using that duration
    And that session has had no subsequent qualifying activity
    When the representative establishes <new> minutes at "09:04:00"
    Then the existing session retains <old> minutes and its idle deadline "<deadline>"
    And a newly authenticated Springfield session uses <new> minutes

    Examples:
      | old | new | deadline |
      | 30  | 5   | 09:30:00 |
      | 5   | 30  | 09:05:00 |

  @FR-003 @SC-004 @contract
  Scenario: Tenant choice survives the session that first used it
    Given the representative previously established a 7-minute Springfield timeout
    And a session using that choice has ended
    When the user starts another authenticated Springfield session
    Then that session uses a 7-minute idle duration
    And Springfield's persisted choice remains 7 minutes

  @FR-002 @FR-003 @SC-001 @contract
  Scenario Outline: Invalid stored configuration cannot silently become a default
    Given Springfield's explicit stored timeout is "<choice>"
    When the user attempts to establish authenticated Springfield access
    Then the trusted configuration boundary refuses access
    And neither the 30-minute default nor another tenant's policy is substituted

    Examples:
      | choice             |
      | 4 minutes          |
      | 31 minutes         |
      | 5.5 minutes        |
      | disable expiration |
      | malformed text     |
