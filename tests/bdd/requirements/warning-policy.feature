@partial
@preets-session-011
Feature: Each tenant's warning policy holds end to end, and a change reaches a session when it renews
  This feature establishes, in real browsers with sessions signed in through the tracked provider,
  that each session warns by the policy it was established or last renewed under: an omitted lead
  under a six-minute timeout warns one minute in, a lead of 1 under five minutes warns four minutes
  in, and an explicit 0 under five or six minutes never shows a dialog before the session expires at
  its deadline. Under the default policy a session warns 25 minutes in, and an explicit 0 at the
  30-minute default never warns. A lead that is negative, fractional, text, or not below the timeout
  makes the tenant an ordinary missing tenant that sets no cookie and starts no login. A changed
  lead reaches a session only when it renews, in every tab that shares it, while a session that is
  not renewed keeps its lead.
  Not established here: the warning's presentation, blocking, focus, and Continue, resumed tabs, and
  the late Continue (expiration-warning.feature); what assistive technology announces, which needs
  a person (L-3).

  Background:
    Given production tenant sites for Springfield and Shelbyville

  Scenario: Each session warns by the policy it was established under, and a lead of 0 never warns
    Four browsers sign in one after another while the Springfield file changes before each, and all
    four sessions then stay idle.

    Given host resolution uses base hostname "localhost"
    And Springfield's tenant file changes to a 6-minute timeout with no warning lead set
    And another browser has signed in at "springfield.localhost:3000" and opened tab "P1"
    And Springfield's tenant file changes to a 5-minute timeout with a warning lead of 1
    And another browser has signed in at "springfield.localhost:3000" and opened tab "P2"
    And Springfield's tenant file changes to a 5-minute timeout with a warning lead of 0
    And another browser has signed in at "springfield.localhost:3000" and opened tab "P3"
    And Springfield's tenant file changes to a 6-minute timeout with a warning lead of 0
    And another browser has signed in at "springfield.localhost:3000" and opened tab "P4"
    Then tab "P1" holds a warning lead of 5
    And tab "P2" holds a warning lead of 1
    And tabs "P3" and "P4" hold a warning lead of 0
    When tab "P1" reaches its warning threshold
    Then tab "P1" shows the warning within 2 seconds of its warning threshold, with focus on Continue
    When tab "P2" reaches its warning threshold
    Then tab "P2" shows the warning within 2 seconds of its warning threshold, with focus on Continue
    And tabs "P3" and "P4" showed no dialog before their deadline, then the expiration modal within 2 seconds of it
    And tabs "P1" and "P2" replaced the warning with the expiration modal, never closing it as renewed

  Scenario Outline: An invalid warning lead makes the tenant an ordinary missing tenant
    Given tenant resolution uses "host" mode
    And the selected Springfield tenant file is "<setting>"
    When a visitor requests the document at "springfield.example.test"
    Then the response status is 404
    And the response has no redirect
    And the response issues no application or correlation cookie
    When a visitor requests "/auth/login" at "springfield.example.test"
    Then the response status is 404
    And the response has no redirect
    And the response issues no application or correlation cookie

    Examples:
      | setting                                  |
      | a warning lead of -1                     |
      | a warning lead of 1.5                    |
      | a warning lead of five, as text          |
      | a warning lead equal to its idle timeout |
      | a warning lead above its idle timeout    |

  Scenario: A changed lead reaches a session only when it renews
    The visitor's session has tabs "T1" and "T2"; another browser's session has tab "U1". Both start
    under a five-minute timeout with a lead of 4, and the lead changes before their threshold.

    Given host resolution uses base hostname "localhost"
    And Springfield sessions end after 5 minutes of inactivity
    And Springfield warns 4 minutes before its sessions end
    And the visitor has signed in at "springfield.localhost:3000" and opened tabs "T1" and "T2"
    And another browser has signed in at "springfield.localhost:3000" and opened tab "U1"
    When Springfield's tenant file changes to a warning lead of 0
    And tabs "T1", "T2", and "U1" reach their warning threshold
    Then tabs "T1", "T2", and "U1" each show the warning within 2 seconds of their warning threshold, with focus on Continue
    When the visitor activates Continue with Enter in tab "T1"
    Then tabs "T1" and "T2" close their warning within 2 seconds of the renewal and hold its later deadline
    And tabs "T1" and "T2" hold a warning lead of 0
    And the warning stays open in tab "U1" with its deadline unchanged
    And tab "U1" holds a warning lead of 4
    When Springfield's tenant file changes to no warning lead set
    And the visitor types in tab "T1"
    Then tabs "T1" and "T2" hold a warning lead of 0
    When Springfield's tenant file changes to a warning lead of 1
    And the visitor types in tab "T1"
    Then tabs "T1" and "T2" hold a warning lead of 1
    When tabs "T1" and "T2" reach their warning threshold
    Then tabs "T1" and "T2" each show the warning within 2 seconds of their warning threshold, with focus on Continue
    When Springfield's tenant file changes to a warning lead of 2
    And the visitor activates Continue with Enter in tab "T1"
    Then tabs "T1" and "T2" close their warning within 2 seconds of the renewal and hold its later deadline
    And tabs "T1" and "T2" hold a warning lead of 2
    When tabs "T1" and "T2" reach their warning threshold
    Then tabs "T1" and "T2" each show the warning within 2 seconds of their warning threshold, with focus on Continue

  @long-idle
  Scenario: Under the default policy a session warns 25 minutes in, and an explicit 0 at 30 minutes never warns
    Takes about 31 minutes. "L1" signs in under the default policy; "L2", in another browser, signs
    in after the file sets an explicit 0 with the timeout still omitted. Neither is ever continued.

    Given host resolution uses base hostname "localhost"
    And Springfield's tenant file sets no idle timeout and no warning lead
    And another browser has signed in at "springfield.localhost:3000" and opened tab "L1"
    And Springfield's tenant file changes to a warning lead of 0
    And another browser has signed in at "springfield.localhost:3000" and opened tab "L2"
    Then tab "L1" holds a warning lead of 5
    And tab "L2" holds a warning lead of 0
    When tab "L1" reaches its warning threshold
    Then tab "L1" shows the warning within 2 seconds of its warning threshold, with focus on Continue
    And tabs "L2" showed no dialog before their deadline, then the expiration modal within 2 seconds of it
    And tabs "L1" replaced the warning with the expiration modal, never closing it as renewed
