@partial
@preets-session-009
Feature: Cross-tab activity coordination
  This slice establishes that an in-page activity communication sent with an absent,
  malformed, or never-stored session reference is refused and does not restore access to a
  protected page. It does not establish refusal for a stored record that has expired or been
  removed; that evidence is the real-Redis coordination integration tests in
  frontend-services ("does not revive an expired session through activity" and "does not
  revive a session through activity after logout"). Renewal of a real session by qualifying
  activity, the 60-second communication windows, and the exclusion of pointer movement,
  programmatic focus, and background requests are the qualifying activity feature's evidence.
  Multi-tab synchronization, logout, and session isolation are not established here;
  tab-sharing.feature holds that evidence. Warning, continuation, and expiration presentation
  are in expiration-warning.feature, warning-policy.feature, and expiration-protection.feature.

  Scenario Outline: Activity without a usable session does not revive access
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    And the visitor's session reference is "<reference>"
    When a visitor communicates "<activity>" activity at "springfield.example.test"
    Then the response status is 401
    And the response issues no application or correlation cookie
    And the response contains no protected application content
    When a visitor sends "GET" to "/" at "springfield.example.test" as a "document" request
    Then the response delegates to the same-origin login
    And the response contains no protected application content

    Examples:
      | reference           | activity                       |
      | absent              | text-entry                     |
      | malformed           | keyboard-interaction           |
      | well-formed unknown | intentional-control-activation |
      | well-formed unknown | touch-interaction              |
