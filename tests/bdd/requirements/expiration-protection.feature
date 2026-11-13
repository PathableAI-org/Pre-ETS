@partial
@preets-session-012
Feature: Expired content concealed behind a blocking expiration modal
  This feature establishes, in real browsers with sessions signed in through the tracked provider
  and a tenant whose idle timeout is five minutes, that when a session expires every running tab
  sharing it hides its protected content and shows a blocking expiration modal within two seconds
  of the deadline, while a tab of another tenant and a browser with its own session keep their
  content. The modal explains expiration with the same words and the same Log in again action as
  in-tab recovery after a denied action, takes focus on Log in again, keeps keyboard focus within
  itself, and cannot be dismissed by Escape, a click outside, or its close control; no protected
  text, header, or form remains in the document or its accessibility tree. Refresh, browser back
  and forward, and Log in again follow fresh entry at the provider. A tab that showed the
  signed-out notice stays there across its former deadline. A tab is never expired while the
  session stays valid: crossing its local deadline after another browser renewed the session
  keeps its content. A suspended tab that returns past its deadline hides its content at once and
  shows its content again when the session was renewed meanwhile, or the modal within two seconds
  when it expired, also when the tab's clock lags behind the server.
  Suspension is emulated with Playwright's clock and a visibility change; pixels painted before
  scripts run and assistive-technology announcements are not established here. The library modal
  shows an inert close control until a non-dismissible mode exists (#400). What happens after Log
  in is a later slice of #157.

  Background:
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    And Springfield sessions end after 5 minutes of inactivity

  Scenario: Expiry conceals every sharing tab behind the blocking expiration modal within two seconds
    The shortest idle timeout is five minutes, so this scenario waits for it to pass. The
    visitor's three Springfield tabs share one session. Another browser keeps its own session
    active, and a third browser logged out before the deadline.

    Given the visitor has signed in at "springfield.localhost:3000" and opened tabs "S1", "S2", and "S3"
    And the visitor has opened the roster in tab "S3" and returned to the entry
    And the visitor has signed in at "shelbyville.localhost:3000" and opened tab "Shelbyville"
    And another browser has signed in at "springfield.localhost:3000" and opened tab "Other"
    And another browser has signed in at "springfield.localhost:3000" and opened tab "Signed out"
    When the visitor logs out in tab "Signed out"
    And the idle deadline of tab "S1" passes while tab "Other" stays active
    Then tabs "S1", "S2", and "S3" each show the expiration modal within 2 seconds of their deadline
    And tabs "S1", "S2", and "S3" hold no protected content
    And tabs "Shelbyville" and "Other" still show their protected content
    And focus in tab "S1" is on "Log in again" in the expiration modal
    And the expiration modal in tab "S1" explains expiration as in-tab recovery does, with the same Log in action
    When the visitor presses Escape, clicks outside the modal, and activates its close button in tab "S1"
    Then tab "S1" still shows the expiration modal and no protected content
    When the visitor presses Tab 30 times and then Shift+Tab 30 times in tab "S1"
    Then focus in tab "S1" stayed within the expiration modal with visible focus
    When the visitor clicks where the protected control was in tab "S1"
    Then tab "S1" still shows the expiration modal and no protected content
    When the visitor refreshes tab "S2"
    Then tab "S2" follows fresh entry to the provider without the modal or protected content
    When the visitor navigates forward in tab "S3"
    Then tab "S3" follows fresh entry to the provider without the modal or protected content
    When the visitor navigates back in tab "S3"
    Then tab "S3" follows fresh entry to the provider without the modal or protected content
    When the visitor activates "Log in again" by keyboard in tab "S1"
    Then tab "S1" follows fresh entry to the provider without the modal or protected content
    And tab "Signed out" still shows the signed-out notice and no expiration modal after its former deadline

  Scenario: Tabs stay unexpired while the session is renewed, and a resumed tab confirms before showing content
    The visitor's tabs reach their local deadline after another browser sharing the session
    renewed it. A tab of a further sharing browser, with its timers suspended, missed every
    renewal and returns after its own deadline.

    Given the visitor has signed in at "springfield.localhost:3000" and opened tabs "S1" and "S2"
    And another browser sharing the visitor's session has opened tab "Suspended" with its timers suspended
    When another browser sharing the visitor's session opens tab "Renewing" 30 seconds before the deadline of tab "S1"
    And the idle deadline of tabs "S1", "S2", and "Suspended" passes
    Then tabs "S1", "S2", and "Renewing" still show their protected content
    When tab "Suspended" resumes
    Then tab "Suspended" hid its protected content at once on resuming
    And tab "Suspended" shows its protected content again without the expiration modal

  Scenario: A tab suspended across expiration shows the expiration modal within two seconds of resuming
    Both tabs keep their timers suspended from page load past the deadline. One returns with its
    clock at the current time; the other returns with its clock still a minute before its own
    deadline, while the server has already ended the session.

    Given the visitor has signed in at "springfield.localhost:3000" and opened tab "Suspended" with its timers suspended
    And another browser has signed in at "springfield.localhost:3000" and opened tab "Lagging" with its timers suspended
    When the idle deadline of tabs "Suspended" and "Lagging" passes
    And tab "Suspended" resumes
    Then tab "Suspended" hid its protected content at once on resuming
    And tab "Suspended" shows the expiration modal within 2 seconds of resuming
    When tab "Lagging" resumes with its clock held 60 seconds before its deadline
    Then tab "Lagging" shows the expiration modal within 2 seconds of resuming
