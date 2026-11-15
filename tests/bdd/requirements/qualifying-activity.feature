@partial
@preets-session-009
Feature: Qualifying activity renews a session; pointer movement and background requests do not
  This feature establishes, with sessions signed in through the tracked provider and a tenant
  whose idle timeout is five minutes, what renews a session, observed only as the authoritative
  deadline the session's own status reads report. In Chromium, a click, a tap on a touch screen,
  text entered without a key press, a key that enters no text, and a focus move by Tab from the
  header into the page each renew the session at once when nothing was communicated in the
  previous minute. Pointer movement across the page's controls and a focus move the page makes on
  its own renew nothing, inside an open window or after it. After a minute without communication,
  interaction in another tab sharing the session renews at once; interaction in either tab inside
  the session's open window, also after the window's first renewal has reached the tab, waits for
  the window's end and renews once, no later than 60 seconds after it occurred. Over HTTP, with
  the Fetch Metadata a browser sends, a page navigation and the protected reference form
  submission renew the session as they arrive, while an App Router prefetch, an automatic image
  request, and a session status read leave its deadline unchanged.
  Not established here: interaction less than 60 seconds before the deadline while a window is
  open. With the shortest idle timeout of five minutes, a window that a renewal opened has ended
  four minutes before the deadline, so only a communication the server did not answer leaves both
  true; the frontend coordination unit tests require the immediate send there. Activity after
  expiration (AC4) is other features' evidence; browser-initiated speculative navigations are not
  exercised.

  Background:
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    And Springfield sessions end after 5 minutes of inactivity

  Scenario Outline: A visitor who <interaction> renews the session at once
    Each example signs in afresh, so no in-page activity has been communicated before the
    interaction, which is the only one in the scenario.

    Given the visitor has signed in at "springfield.localhost:3000" on a touch screen and opened tab "T1"
    And tab "T1" shows the participant page
    When the visitor <interaction> in tab "T1"
    Then the session is renewed at once

    Examples:
      | interaction                                          |
      | clicks the acknowledgement checkbox                  |
      | taps the goal field                                  |
      | enters text in the goal field without pressing a key |
      | presses an arrow key in the goal field               |
      | moves focus from the header into the page with Tab   |

  Scenario: Pointer movement and a focus move the page makes on its own never renew the session
    Focus is already on Focus later, so the click moves no focus and is the only interaction: it
    renews the session at once and opens a window. Two seconds later the page moves focus to the
    goal field. The pointer then moves across the page's controls, pressing
    nothing, until five seconds after that window ends, so whatever was held in the window and
    whatever moved after it would have been communicated by then. A click afterwards renews at
    once, which it would not if anything had been communicated in the minute before it.

    Given the visitor has signed in at "springfield.localhost:3000" and opened tab "T1"
    And tab "T1" shows the participant page
    When the visitor clicks Focus later, which already has focus, in tab "T1"
    Then the session is renewed at once
    When the page moves focus to the goal field on its own in tab "T1"
    And the visitor moves the pointer across the controls of tab "T1" until 5 seconds after that renewal's window ends
    Then the session keeps its deadline
    When the visitor clicks the acknowledgement checkbox in tab "T1"
    Then the session is renewed at once

  Scenario: Interaction renews at once after a minute of silence, and otherwise waits for the session's window to end
    Tabs "T1" and "T2" share one session. The window is the session's, whichever tab interacts.
    An arrow key in a focused field opens the first window, because it is one interaction; a click
    on a control without focus is two, the focus move and the click, and the click would keep a
    window open past the minute of silence. The interactions held in the second window come two
    seconds into it, after its first renewal has reached the tab.

    Given the visitor has signed in at "springfield.localhost:3000" and opened tabs "T1" and "T2"
    And tabs "T1" and "T2" show the participant page
    When the visitor presses an arrow key in the goal field in tab "T1"
    Then the session is renewed at once
    When the visitor waits 61 seconds without acting
    And the visitor clicks the acknowledgement checkbox in tab "T2"
    Then the session is renewed at once
    When tab "T2" holds that renewal
    And the visitor waits 2 seconds without acting
    And the visitor clicks the acknowledgement checkbox in tab "T2"
    And the visitor types in the goal field in tab "T1"
    Then the session keeps its deadline until that window ends, then is renewed once, no later than 60 seconds after the first of those interactions

  Scenario: Page requests and form submissions renew the session as they arrive, and background requests never do
    Each request presents the visitor's session with the Fetch Metadata a browser sends for it.
    The session's deadline is read before and after each one.

    Given the visitor has signed in at "springfield.localhost:3000" through the provider
    And the visitor's page at "springfield.localhost:3000" has observed its session's coordination tag
    When the session's browser prefetches "/coordination/participant" for in-place navigation at "springfield.localhost:3000"
    Then that request was admitted without renewing the session
    When the session's browser loads "/favicon.ico" as an image at "springfield.localhost:3000"
    Then that request was admitted without renewing the session
    When the session's browser reads its session status at "springfield.localhost:3000"
    Then that request was admitted without renewing the session
    When the session's browser navigates to "/coordination/participant" at "springfield.localhost:3000"
    Then that request renewed the session as it arrived
    When the session's browser submits the protected reference form at "springfield.localhost:3000"
    Then that request renewed the session as it arrived
