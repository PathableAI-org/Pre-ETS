@partial
@preets-session-010
Feature: One session shared by a browser's tabs, renewed and logged out together
  This feature establishes, in real browsers with sessions signed in through the tracked provider,
  that the tabs one browser opens for a tenant share one application session. Each tab's own
  status read answers the same session and deadline, and each tab holds that deadline; a tab
  opened later is served the protected page without starting a login and keeps the session
  reference the browser already held. Typing in one tab renews the session, and every running tab
  sharing it holds the renewed deadline within two seconds of the renewal response, while the
  visitor's tab of another tenant in the same browser and another browser's own session keep their
  content and deadlines. Logging out in one tab shows the signed-out notice in every running tab
  sharing the session within two seconds of the logout request, with no protected content left,
  while the other tenant's tab and the other browser keep their content and their sessions, neither
  ended nor renewed. Every tab's browser still presents the logged-out session, and it is refused:
  a protected operation is answered 401 with no effect, activity sent with the session's own tag is
  answered 401 and revives nothing, a status read is answered 401, and a page request delegates to
  login, as a refreshed tab follows fresh entry. A tab suspended across the logout shows the
  signed-out notice within two seconds of returning before its deadline.
  Not established here: warning and expiration across tabs (AC4) and the isolation of warnings,
  continuation, and expiration (AC6), which the expiration warning and expiration protection
  features establish. A renewal by a page load reaches other tabs only once that page is
  interactive (gap G2), so a joining tab's deadline is compared with the server's, not timed; a tab
  still loading when the logout happens (gap G1) is not exercised. Suspension is emulated, as in the
  expiration protection feature, by a tab of another browser that presents the visitor's session
  with its timers suspended, so no message from the visitor's tabs reaches it.

  Background:
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"

  Scenario: Every tab reads one session, and a new tab joins it without a login
    Given the visitor has signed in at "springfield.localhost:3000" and opened tabs "S1" and "S2"
    When the visitor opens a protected page in a new tab "S3"
    Then tab "S3" started no login and presents the session reference tab "S1" opened with
    And tabs "S1", "S2", and "S3" each read one session and its deadline from the server, and hold that deadline

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
    And tabs "Shelbyville" and "Other" keep their content and unchanged sessions 3 seconds after the typing in tab "S1"

  Scenario: Logging out in one tab signs out every sharing tab within two seconds, and no other session
    The tabs are as in the typing scenario. Logout leaves the session cookie in place, so every tab's
    browser still presents the logged-out session afterwards; requests sent outside the browser
    present it as they would.

    Given another browser has signed in at "springfield.localhost:3000" and opened tab "Other"
    And the visitor has signed in at "shelbyville.localhost:3000" and opened tab "Shelbyville"
    And the visitor has signed in at "springfield.localhost:3000" and opened tabs "S1", "S2", and "S3"
    And requests sent outside the browser present the session tab "S1" opened with
    And the visitor's page at "springfield.localhost:3000" has observed its session's coordination tag
    When the visitor logs out in tab "S2"
    Then tabs "S1", "S2", and "S3" show the signed-out notice within 2 seconds of the logout in tab "S2"
    And tabs "S1", "S2", and "S3" hold no protected content
    And tabs "Shelbyville" and "Other" keep their content and unchanged sessions 3 seconds after the logout in tab "S2"
    And tabs "S1", "S2", and "S3" still present that session
    When a visitor invokes the protected reference action at "springfield.localhost:3000"
    Then the response status is 401
    And the response issues no reference-operation receipt
    And the response contains no protected application content
    When the visitor's page communicates "text-entry" activity at "springfield.localhost:3000"
    Then the response status is 401
    When a visitor sends "GET" to "/session/status" at "springfield.localhost:3000" as an "application" request
    Then the response status is 401
    When a visitor sends "GET" to "/" at "springfield.localhost:3000" as a "document" request
    Then the response delegates to the same-origin login
    And the response contains no protected application content
    When the visitor refreshes tab "S3"
    Then tab "S3" follows fresh entry to the provider without the modal or protected content

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
