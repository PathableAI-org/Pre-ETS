@idle-session-timeout @US1
Feature: End idle authenticated access
  Users lose protected access at their session's inactivity deadline regardless of browser cooperation.

  Background:
    Given idle-timeout tenants "springfield" and "shelbyville" are isolated for this scenario
    And the user authenticated to "springfield" at "09:00:00" with a 5-minute idle duration
    And that session's absolute deadline is "17:00:00"

  @FR-004 @FR-005 @SC-002 @contract
  Scenario Outline: Access ends exactly at the inactivity deadline
    Given the user has had no qualifying activity since authentication
    When the user attempts protected work at authoritative time "<time>"
    Then that attempt is "<outcome>" under the idle policy

    Examples:
      | time     | outcome |
      | 09:04:59 | allowed |
      | 09:05:00 | denied  |
      | 09:05:01 | denied  |

  @FR-004 @FR-006 @SC-002 @contract
  Scenario Outline: Browser execution cannot extend expired access
    Given the user's browser is "<condition>" without qualifying activity
    When protected work is attempted through that session at authoritative time "09:05:00"
    Then the protected work is denied independently of the browser

    Examples:
      | condition                        |
      | suspended                        |
      | closed                           |
      | offline                          |
      | running without expiration UI    |
      | throttling background timers     |
      | using a clock ten minutes behind |
      | using a clock ten minutes ahead  |

  @FR-005 @FR-006 @SC-004 @contract
  Scenario Outline: Deliberate interaction restarts an unexpired idle period
    Given the user deliberately performs "<interaction>" at "09:04:00"
    And the interaction is accepted at "09:04:00" without a protected operation
    When the user attempts protected work at authoritative time "09:08:59"
    Then that attempt is "allowed" under the idle policy
    And the session's idle deadline is "09:09:00"
    And the session's absolute deadline remains "17:00:00"

    Examples:
      | interaction    |
      | keyboard input |
      | pointer input  |
      | touch input    |
      | scrolling      |

  @FR-005 @SC-002 @SC-004 @contract
  Scenario Outline: Passive use and automated traffic do not restart inactivity
    Given only "<activity>" occurs between "09:00:00" and "09:05:00"
    When the user attempts protected work at authoritative time "09:05:00"
    Then that attempt is "denied" under the idle policy

    Examples:
      | activity             |
      | passive reading      |
      | background polling   |
      | automatic prefetch   |
      | automated keepalives |

  @FR-005 @SC-004 @contract
  Scenario: Tabs sharing authenticated access share qualifying activity
    Given the user has two tabs sharing the Springfield authenticated session
    And qualifying activity from the first tab is accepted at "09:04:00"
    When the user attempts protected work from the second tab at "09:08:59"
    Then that attempt is "allowed" under the idle policy
    And both tabs use the idle deadline "09:09:00"

  @FR-005 @SC-004 @contract
  Scenario Outline: Independent sessions do not share activity
    Given the user also authenticated at "09:00:00" in "<context>" with a 5-minute idle duration
    And qualifying activity in that independent session is accepted at "09:04:00"
    When the user attempts protected work through the original session at "09:05:00"
    Then that attempt is "denied" under the idle policy
    And the independent session remains usable until "09:09:00" unless another lifetime limit ends it

    Examples:
      | context                                    |
      | another device for springfield             |
      | a separate browser session for springfield |
      | a session for shelbyville                  |

  @FR-006 @SC-002 @contract
  Scenario Outline: Activity at or after expiry cannot revive access
    Given a deliberate interaction occurred in the browser at "<occurred>"
    When its activity report is accepted for evaluation at authoritative time "<received>"
    Then the original session remains expired with idle deadline "09:05:00"
    And protected work using the original access is denied

    Examples:
      | occurred | received |
      | 09:05:00 | 09:05:00 |
      | 09:05:01 | 09:05:01 |
      | 09:04:59 | 09:05:01 |

  @FR-006 @SC-002 @contract
  Scenario: Concurrent activity does not beat expiration at the deadline
    Given no qualifying activity has been accepted since "09:00:00"
    When deliberate activity and protected work arrive concurrently at "09:05:00"
    Then the protected work is denied
    And the activity does not revive expired access

  @FR-006 @SC-002 @contract
  Scenario: Idle renewal cannot extend absolute lifetime
    Given this session instead has an existing absolute deadline of "09:06:00"
    And qualifying activity is accepted at "09:04:00"
    When the user attempts protected work at authoritative time "09:06:00"
    Then the protected work is denied because the absolute lifetime ended
    And the session's absolute deadline remains "09:06:00"

  @FR-007 @SC-002 @contract
  Scenario: Replacement anonymous continuity does not restore authenticated access
    Given the authenticated access expired at "09:05:00"
    And a new anonymous tenant session has been established for "springfield"
    When the user attempts protected work without completing authentication
    Then the protected work is denied
    And the anonymous session is not treated as authenticated identity

  @FR-008 @SC-002 @SC-003 @contract
  Scenario Outline: Unusable authorization state fails closed without guessing inactivity
    Given the authorization state is "<condition>"
    And there is no independent evidence of inactivity expiration
    When the user attempts protected work
    Then the protected work is denied
    And the interruption is not attributed to inactivity

    Examples:
      | condition   |
      | missing     |
      | evicted     |
      | unavailable |

  @FR-003 @FR-005 @SC-004 @contract
  Scenario: Another tenant cannot change the active session's policy
    Given an authorized representative changes Shelbyville's duration to 30 minutes
    When the Springfield user attempts protected work at "09:05:00" without intervening activity
    Then that attempt is "denied" under the idle policy
    And the Springfield session's duration remains 5 minutes
