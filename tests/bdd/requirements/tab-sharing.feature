@partial
@preets-session-010
Feature: One session shared by a browser's tabs, renewed and logged out together
  This feature establishes, in real browsers with sessions signed in through the tracked provider,
  that the tabs one browser opens for a tenant share one application session: a tab opened while
  the session exists is served the protected page without starting a login and presents the
  session reference the browser already held, and every tab holds the deadline the session's own
  status read reports. Typing in one tab renews the session, and every running tab sharing it
  holds the renewed deadline within two seconds of the renewal response, while the visitor's tab
  of another tenant in the same browser and another browser's own session keep their content and
  deadlines. Logging out in one tab shows the signed-out notice in every running tab
  sharing the session, with no protected content left, within two seconds of the logout request,
  while the other tenant's tab and the other browser keep their content and their sessions, neither
  ended nor renewed. The logged-out session is refused: presented as a tab still holding it would,
  a protected operation is answered 401 with no effect, activity sent with the session's own tag is
  answered 401 and revives nothing, a status read is answered 401, and a refreshed tab is served no
  protected document. A tab suspended across the logout shows the signed-out notice, with no
  protected content left, within two seconds of returning before its deadline.
  Not established here: warning and expiration across tabs (AC4) and the isolation of warnings,
  continuation, and expiration (AC6), which the expiration warning and expiration protection
  features establish; where a refused page request leads instead, which is fresh entry
  (PREETS-SESSION-004); and the notice's content beyond its heading. A renewal by a page load
  reaches other tabs only once that page is interactive (gap G2), so a joining tab's deadline is
  compared with the server's, not timed; a tab still loading when the logout happens (gap G1) is
  not exercised. Suspension is emulated, as in the expiration protection feature, by a tab of
  another browser that presents the visitor's session with its timers suspended, so no message
  from the visitor's tabs reaches it.

  Background:
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"

  Scenario: Every tab holds one session's deadline, and a new tab joins it without a login
    The visitor waits two seconds before opening the new tab, so its page load moves the session's
    deadline by more than the tabs' clock-offset estimates differ, and the earlier tabs hold the
    server's deadline only once they have adopted that renewal.

    Given the visitor has signed in at "springfield.localhost:3000" and opened tabs "S1" and "S2"
    And the visitor waits 2 seconds without acting
    When the visitor opens a protected page in a new tab "S3"
    Then tab "S3" started no login and presents the session reference tab "S1" opened with
    And tabs "S1", "S2", and "S3" each hold the deadline the server reports for the session tab "S1" opened with

  Scenario: Typing in one tab renews the session in every sharing tab within two seconds, and no other session
    The visitor's tabs "S1", "S2", and "S3" share one Springfield session. "Shelbyville" is the
    visitor's session for the other tenant in the same browser, and "Other" is another browser's own
    Springfield session; both last renewed before the visitor's Springfield sign-in. The visitor
    waits two seconds before typing, so the renewal moves the deadline by more than the tabs'
    clock-offset estimates differ.

    Given another browser has signed in at "springfield.localhost:3000" and opened tab "Other"
    And the visitor has signed in at "shelbyville.localhost:3000" and opened tab "Shelbyville"
    And the visitor has signed in at "springfield.localhost:3000" and opened tabs "S1", "S2", and "S3"
    And the visitor waits 2 seconds without acting
    When the visitor types in tab "S1"
    Then tabs "S1", "S2", and "S3" hold the renewed deadline within 2 seconds of the renewal response in tab "S1"
    And tabs "Shelbyville" and "Other" keep their sessions unchanged 3 seconds after the typing in tab "S1"
    And tabs "Shelbyville" and "Other" still show their protected content

  Scenario: Logging out in one tab signs out every sharing tab within two seconds, and no other session
    The tabs are as in the typing scenario. The requests sent outside the browser present the
    session as a tab still holding it would, which after the logout is the logged-out session.

    Given another browser has signed in at "springfield.localhost:3000" and opened tab "Other"
    And the visitor has signed in at "shelbyville.localhost:3000" and opened tab "Shelbyville"
    And the visitor has signed in at "springfield.localhost:3000" and opened tabs "S1", "S2", and "S3"
    And requests sent outside the browser present the session tab "S1" opened with
    And the visitor's page at "springfield.localhost:3000" has observed its session's coordination tag
    When the visitor logs out in tab "S2"
    Then tabs "S1", "S2", and "S3" show the signed-out notice within 2 seconds of the logout in tab "S2"
    And tabs "S1", "S2", and "S3" hold no protected content
    And tabs "Shelbyville" and "Other" keep their sessions unchanged 3 seconds after the logout in tab "S2"
    And tabs "Shelbyville" and "Other" still show their protected content
    When a visitor invokes the protected reference action at "springfield.localhost:3000"
    Then the response status is 401
    And the response issues no reference-operation receipt
    And the response contains no protected application content
    When the visitor's page communicates "text-entry" activity at "springfield.localhost:3000"
    Then the response status is 401
    When a visitor sends "GET" to "/session/status" at "springfield.localhost:3000" as an "application" request
    Then the response status is 401
    When the visitor refreshes tab "S3"
    Then tab "S3" was served no protected document

  Scenario: A tab suspended across the logout shows the signed-out notice within two seconds of resuming
    Tab "Suspended" is in another browser that presents the visitor's session with its timers
    suspended from page load, so no message from the visitor's tab reaches it. It returns long before
    its deadline.

    Given the visitor has signed in at "springfield.localhost:3000" and opened tab "S1"
    And another browser sharing the visitor's session has opened tab "Suspended" with its timers suspended
    When the visitor logs out in tab "S1"
    Then tab "Suspended" still shows the protected content it had when suspended
    When tab "Suspended" resumes
    Then tab "Suspended" shows the signed-out notice within 2 seconds of resuming, with no protected content
