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
  had it or to the page's content. Expiration still wins: a resumed tab confirms before it warns,
  and warns only in the warning period; a resumed tab past its deadline hides its content until the
  server answers; a Continue that reaches the server after the deadline is refused into the expired
  outcome in every sharing tab; interaction in a tab resumed after the end revives nothing; and with
  the warning disabled, by an omitted lead under a five-minute timeout or by an explicit 0, sessions
  end at their deadline with no dialog before it.
  Not established here: the default and disabled policies' other settings, invalid settings, and
  policy adoption (slice D); what assistive technology announces, which needs a person (L-3).

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

  Scenario: A resumed tab confirms before it warns, and warns only in the warning period
    Two tabs of another browser present a copy of the visitor's session with their timers
    suspended, so they exchange no cross-tab messages with the visitor's tab. "S1" opens last, so
    it holds the session's deadline; it returns ten seconds after its threshold, and its session
    check is held for half a second, so a warning shown before the answer would be seen. "S2"
    returns after the visitor's Continue has renewed the session, still holding the earlier
    deadline.

    Given the visitor has signed in at "springfield.localhost:3000" and opened tab "T1"
    And another browser sharing the visitor's session has opened tab "S2" with its timers suspended
    And another browser sharing the visitor's session has opened tab "S1" with its timers suspended
    When the visitor waits until 10 seconds after the warning threshold of tab "S1"
    And the next session check of tab "S1" is held for half a second
    And tab "S1" resumes
    Then tab "S1" kept its protected content on resuming
    And tab "S1" confirms with the server, then shows the warning over its protected content within 2 seconds of resuming
    When the visitor activates Continue with Enter in tab "T1"
    And tab "S2" resumes
    Then tab "S2" confirms with the server, shows no warning, and adopts the deadline of tab "T1"

  Scenario: Expiration still wins after a resume, after a late Continue, and with the warning disabled
    "S3" and "S5" are suspended tabs of browsers sharing the visitor's session. The visitor renews
    once with Continue, so the session is in its warning period when "S3" returns past its own
    stale deadline. Continue in "T1" just before the renewed deadline is held by request routing
    until after it. "S5" returns after the session ended. In Shelbyville, "B1" signs in under a
    five-minute timeout with no warning lead set, and "B2", in another browser, after the tenant
    file changes to a six-minute timeout with an explicit 0.

    Given the visitor has signed in at "springfield.localhost:3000" and opened tabs "T1" and "T2"
    And another browser sharing the visitor's session has opened tab "S3" with its timers suspended
    And another browser sharing the visitor's session has opened tab "S5" with its timers suspended
    And Shelbyville sessions end after 5 minutes of inactivity, with no warning lead set
    And another browser has signed in at "shelbyville.localhost:3000" and opened tab "B1"
    And Shelbyville's tenant file changes to a 6-minute timeout with a warning lead of 0
    And another browser has signed in at "shelbyville.localhost:3000" and opened tab "B2"
    When the visitor types in tab "T1"
    And tabs "T1" and "T2" reach their warning threshold
    Then tabs "T1" and "T2" each show the warning within 2 seconds of their warning threshold, with focus on Continue
    When the visitor activates Continue with Enter in tab "T1"
    Then tabs "T1" and "T2" close their warning within 2 seconds of the renewal and hold its later deadline
    When the idle deadline of tabs "S3" passes
    And the next session check of tab "S3" is held for half a second
    And tab "S3" resumes
    Then tab "S3" hid its protected content at once on resuming
    And tab "S3" confirms with the server, then shows the warning over its protected content within 2 seconds of resuming
    When the visitor activates Continue in tab "T1" 3 seconds before its deadline, and the request reaches the server after it
    Then the late Continue in tab "T1" was answered 401 after its deadline
    And tabs "T1" and "T2" replaced the warning with the expiration modal, never closing it as renewed
    And a request presenting the earlier session of tab "T1" is not admitted
    And the session status of tab "T1" answers 401
    When tab "S5" resumes
    Then tab "S5" hid its protected content at once on resuming
    And tab "S5" shows the expiration modal within 2 seconds of resuming
    When the visitor presses character keys and Escape in tab "S5"
    And the visitor clicks where the protected control was in tab "S5"
    Then no request from tab "S5" was answered 200 since then
    And tabs "B1" and "B2" showed no dialog before their deadline, then the expiration modal within 2 seconds of it
    And a request presenting the earlier session of tab "B1" is not admitted
    And a request presenting the earlier session of tab "B2" is not admitted
