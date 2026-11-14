@partial
@preets-session-011
Feature: Expiration warning in every sharing tab, closed only by a renewal
  This feature establishes, in real browsers with sessions signed in through the tracked provider
  and a tenant whose idle timeout is five minutes with a warning lead of four minutes, that every
  running tab sharing a session opens the warning no earlier than its threshold and within two
  seconds of it, with focus on Continue, while a tab of another tenant and a browser with its own
  session warn only at their own thresholds. Escape, a click outside, and a Continue answered with
  a server error leave the warning open in every tab and renew nothing; the failed Continue says so
  inside the warning. Continue by keyboard renews the session, and every sharing tab closes its
  warning within two seconds of the renewal response and holds the renewed deadline, while the
  other tenant's tab and the other browser are unchanged. A protected page opened in a new tab
  also closes the warning in every sharing tab; that delay is recorded, not held to two seconds
  (gap G2). A tab that learned of no renewal confirms at its stale threshold, shows no warning,
  and adopts the later deadline. The warning is one modal dialog, named and described, whose only
  control is Continue; nothing behind it is exposed or reachable by keyboard or pointer, focus
  stays on Continue, Space renews as Enter does, and focus returns afterwards to the control that
  had it or to the page's content.
  Not established here: the default and disabled policies, invalid settings, and policy adoption
  (slice D); what assistive technology announces, which needs a person (L-3); resumed tabs, a late
  Continue, and expiration with the warning disabled (slice C).

  Background:
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    And Springfield sessions end after 5 minutes of inactivity
    And Springfield warns 4 minutes before its sessions end

  Scenario: Every sharing tab warns at its threshold, and only a renewal closes the warning
    The visitor's tabs "T1" and "T2" share one Springfield session, and "T3" is the visitor's
    Shelbyville session in the same browser, under the default 30-minute policy. Another browser
    signs in to Springfield twenty seconds later, so its tab "T4" reaches its threshold later.

    Given the visitor has signed in at "springfield.localhost:3000" and opened tabs "T1" and "T2"
    And the visitor has signed in at "shelbyville.localhost:3000" and opened tab "T3"
    And the visitor waits 20 seconds without acting
    And another browser has signed in at "springfield.localhost:3000" and opened tab "T4"
    When tabs "T1" and "T2" reach their warning threshold
    Then tabs "T1" and "T2" each show the warning within 2 seconds of their warning threshold, with focus on Continue
    And tabs "T3" and "T4" show no warning
    When the visitor presses Escape and clicks outside the warning in tab "T1"
    Then the warning stays open in tabs "T1" and "T2" with their deadline unchanged
    When the next activity report from tab "T1" fails with a server error
    And the visitor clicks Continue in tab "T1"
    Then tab "T1" says the session could not be continued
    And the warning stays open in tabs "T1" and "T2" with their deadline unchanged
    When tab "T4" reaches its warning threshold
    Then tab "T4" shows the warning within 2 seconds of its warning threshold, with focus on Continue
    When the visitor activates Continue with Enter in tab "T1"
    Then tabs "T1" and "T2" close their warning within 2 seconds of the renewal and hold its later deadline
    And tab "T3" shows no warning and holds its deadline unchanged
    And the warning stays open in tab "T4" with its deadline unchanged
    When tabs "T1" and "T2" reach their warning threshold
    Then tabs "T1" and "T2" each show the warning within 2 seconds of their warning threshold, with focus on Continue
    When the visitor opens a protected page in a new tab "T5"
    Then tabs "T1" and "T2" close their warning and adopt the deadline of tab "T5"

  Scenario: A tab that missed a renewal confirms at its stale threshold and shows no warning
    Another browser presents a copy of the visitor's session in tab "S". It exchanges no cross-tab
    messages with the visitor's tabs, so it does not learn of the renewal the visitor's typing
    makes thirty seconds before its threshold.

    Given the visitor has signed in at "springfield.localhost:3000" and opened tabs "T1" and "T2"
    And another browser sharing the visitor's session has opened tab "S"
    When the visitor types in tab "T1" 30 seconds before the warning threshold of tab "S"
    Then tab "S" shows no warning through its stale threshold and adopts the deadline of tab "T1"
    And tabs "T1" and "T2" show no warning

  Scenario: The warning is the only thing operable, holds focus, and gives it back when it closes
    Tab "T1" shows the roster with focus on its attendance note, and tab "T2" shows the reference
    page with nothing focused. What is exposed is read from Chromium's own accessibility tree,
    which leaves out inert content as assistive technology and the keyboard do.

    Given the visitor has signed in at "springfield.localhost:3000" and opened tabs "T1" and "T2"
    And tab "T1" shows the roster with focus on its attendance note, and tab "T2" has learned its renewal
    When tabs "T1" and "T2" reach their warning threshold
    Then tabs "T1" and "T2" each show the warning within 2 seconds of their warning threshold, with focus on Continue
    And focus in tab "T1" is on Continue with a visible focus indicator
    And the warning in tab "T1" is a modal dialog that explains itself, with Continue as its only control
    And nothing behind the warning in tab "T1" is exposed
    And nothing behind the warning in tab "T2" is exposed
    When the visitor presses Tab 30 times and then Shift+Tab 30 times in tab "T1"
    Then focus in tab "T1" is on Continue
    When the visitor clicks outside the warning in tab "T1"
    Then focus in tab "T1" is on Continue
    When another window takes focus from tab "T1" and gives it back
    Then focus in tab "T1" is on Continue
    When the visitor clicks where Log out and the participant link are in tab "T1"
    Then tab "T1" navigated nowhere and started no logout
    When the visitor activates Continue with Space in tab "T1"
    Then tabs "T1" and "T2" close their warning within 2 seconds of the renewal and hold its later deadline
    And focus in tab "T1" is back on its attendance note
    And focus in tab "T2" is on its main content
    And tabs "T1" and "T2" expose their header and controls again
