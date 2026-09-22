@application @redis
Feature: The server ends idle authenticated access
  Rule: Server time is authoritative even without browser cooperation
    Background:
      Given an isolated authenticated session with a five-minute inactivity duration

    @spec-004-FR-004 @spec-004-FR-005 @spec-004-FR-006
    Scenario Outline: Protected access ends exactly at the idle deadline
      When the protected-operation guard runs <seconds> seconds after authentication
      Then protected access is "<outcome>"
      Examples:
        | seconds | outcome |
        | 299     | allowed |
        | 300     | denied  |
        | 301     | denied  |

    @spec-004-FR-005
    Scenario: Accepted activity renews only the idle deadline
      When qualifying activity is accepted 240 seconds after authentication
      Then the idle deadline is 540 seconds after authentication and absolute expiry is unchanged
      When the protected-operation guard runs 539 seconds after authentication
      Then protected access is "allowed"

    @spec-004-FR-005
    Scenario Outline: Activity cannot revive expired access
      When qualifying activity is attempted <seconds> seconds after authentication
      Then activity is denied
      When the protected-operation guard runs <seconds> seconds after authentication
      Then protected access is "denied"
      Examples:
        | seconds |
        | 300     |
        | 301     |

    @spec-004-FR-004 @spec-004-FR-010
    Scenario: Expiration clears authentication while retaining tenant-bound continuity
      When the protected-operation guard runs 300 seconds after authentication
      Then the stored session has no authenticated identity and records inactivity

    @spec-004-FR-008
    Scenario: Missing authorization state does not invent inactivity
      Given the authenticated record was removed
      When the protected-operation guard runs 300 seconds after authentication
      Then access is denied without claiming inactivity
