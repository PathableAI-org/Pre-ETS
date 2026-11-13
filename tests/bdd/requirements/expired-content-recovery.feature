@partial
@preets-session-007
Feature: Expired-content protection for denied Server Actions
  This feature establishes, at the HTTP boundary with real sessions signed in through the tracked
  provider, that a protected Server Action whose session record was removed, or whose idle
  deadline passed before the request arrived, is answered with actual HTTP 401, performs no
  operation, starts no login, and carries no protected content or session values. A submission
  without scripts, sent as a browser form navigation, receives the accessible recovery document
  in that 401 response: one heading that explains the session is no longer available, and a Log
  in again link to the application entry. A script-driven submission receives a plain-text cause
  token in its 401. In a real browser with scripts disabled, the protected reference form submits
  as a form navigation: with a usable session it succeeds, and after the record was removed the
  browser displays the recovery document, whose Log in again link is reachable and operable by
  keyboard. With scripts enabled, a denied submission replaces that tab's header and content with
  recovery content and moves focus to its heading. The content says the session expired when the
  tab's held deadline had passed on the server clock, even while the tab's timers were suspended,
  and that it is no longer available otherwise. Another tab sharing the session keeps its content.
  It does not establish the expiration modal or what happens after Log in; those are later slices
  of #157. The server observes an expired record only briefly before the store evicts it, so a
  request after the deadline is usually explained as no longer available.

  Background:
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"

  Scenario: A protected action after the session record was removed is denied with recovery meaning
    Given the visitor has signed in at "springfield.localhost:3000" through the provider
    And the visitor's session record is removed by logging out in another browser
    When a visitor invokes the protected reference action at "springfield.localhost:3000"
    Then the response status is 401
    And the response is the action denial token "session-unavailable"
    And the response is not cacheable
    And the response issues no reference-operation receipt
    And the response does not delegate to login
    And the response issues no application or correlation cookie
    And the response contains no protected application content
    And the response reveals no session reference, identity, or tenant
    When the visitor submits the protected reference action without scripts at "springfield.localhost:3000"
    Then the response status is 401
    And the response is the recovery document explaining "Your session is no longer available"
    And the response is not cacheable
    And the response issues no reference-operation receipt
    And the response does not delegate to login
    And the response issues no application or correlation cookie
    And the response contains no protected application content
    And the response reveals no session reference, identity, or tenant

  Scenario: A protected action received after the idle deadline is denied with the recovery document
    The tenant's shortest idle timeout is five minutes, so this scenario waits for it to pass
    with no activity on the session.

    Given Springfield sessions end after 5 minutes of inactivity
    And the visitor has signed in at "springfield.localhost:3000" through the provider
    When the session's idle deadline passes without activity
    And the visitor submits the protected reference action without scripts at "springfield.localhost:3000"
    Then the response status is 401
    And the response is a recovery document with a Log in again link
    And the response is not cacheable
    And the response issues no reference-operation receipt
    And the response does not delegate to login
    And the response issues no application or correlation cookie
    And the response contains no protected application content
    And the response reveals no session reference, identity, or tenant

  Scenario: Without scripts, a protected form submission after the record was removed displays the recovery document
    Given the visitor has signed in at "springfield.localhost:3000" through the provider
    And the visitor opens the application entry at "springfield.localhost:3000" with scripts disabled
    And the visitor's session record is removed by logging out in another browser
    When the visitor submits the reference form by keyboard
    Then the form submission is a document request answered with status 401
    And the browser holds no reference-operation receipt
    And the page displays the recovery document explaining "Your session is no longer available"
    And "Log in again" is reachable by keyboard with visible focus and opens the application entry

  Scenario: Without scripts, a protected form submission with a usable session performs the operation
    Given the visitor has signed in at "springfield.localhost:3000" through the provider
    And the visitor opens the application entry at "springfield.localhost:3000" with scripts disabled
    When the visitor submits the reference form by keyboard
    Then the form submission is a document request answered with status 200
    And the page shows the status "The reference operation finished."
    And the browser holds a reference-operation receipt

  Scenario: With scripts, a denied submission replaces only that tab's content with recovery
    The keyboard submission is also activity, and a refused activity report ends the tab by itself,
    so this scenario delays those reports to observe the denied action's own outcome.

    Given the visitor has signed in at "springfield.localhost:3000" through the provider
    And the visitor opens the application entry at "springfield.localhost:3000" with scripts enabled
    And the visitor opens a second tab on the application entry
    And the visitor's activity reports reach the server 2 seconds late
    And the visitor's session record is removed by logging out in another browser
    When the visitor submits the reference form by keyboard
    Then the form submission is a fetch request answered with status 401
    And the form submission was answered with the action denial token "session-unavailable"
    And the browser holds no reference-operation receipt
    And the tab shows recovery explaining "Your session is no longer available" in place of its content
    And focus is on the recovery heading
    And the second tab still shows its protected content
    And "Log in again" is reachable by keyboard with visible focus and opens the application entry

  Scenario: With scripts, a tab that observed logout shows the signed-out notice instead of recovery
    Given the visitor has signed in at "springfield.localhost:3000" through the provider
    And the visitor opens the application entry at "springfield.localhost:3000" with scripts enabled
    And the visitor opens a second tab on the application entry
    When the visitor logs out in the second tab
    Then the first tab shows the signed-out notice and no recovery content

  Scenario: With scripts, a submission after the deadline explains expiration though the tab's timers were suspended
    The tenant's shortest idle timeout is five minutes, so this scenario waits for it to pass. The
    tab's timers stay paused from page load, so it never confirms at its deadline; its clock is set
    to the current time just before the submission.

    Given Springfield sessions end after 5 minutes of inactivity
    And the visitor has signed in at "springfield.localhost:3000" through the provider
    And the visitor opens the application entry at "springfield.localhost:3000" with its timers suspended
    And the visitor's activity reports reach the server 2 seconds late
    When the session's idle deadline passes without activity
    And the tab's clock is set to the current time without running its timers
    And the visitor submits the reference form by keyboard
    Then the form submission is a fetch request answered with status 401
    And the browser holds no reference-operation receipt
    And the tab shows recovery explaining "Your session expired" in place of its content
    And focus is on the recovery heading
