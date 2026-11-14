@partial
@preets-session-007
Feature: Expired-content protection for denied Server Actions
  This slice establishes, at the HTTP boundary with real sessions signed in through the tracked
  provider, that a protected Server Action whose session record was removed, or whose idle
  deadline passed before the request arrived, is answered with actual HTTP 401, performs no
  operation, starts no login, and carries no protected content or session values. A submission
  without scripts, sent as a browser form navigation, receives the accessible recovery document
  in that 401 response: one heading that explains the session is no longer available, and a Log
  in again link to the application entry. A script-driven submission still receives an empty
  401 here. In a real browser with scripts disabled, the protected reference form submits as a
  form navigation: with a usable session it succeeds, and after the record was removed the
  browser displays the recovery document, whose Log in again link is reachable and operable by
  keyboard. With scripts enabled, that denial is still announced as not performed and the tab
  then shows the signed-out notice. It does not establish in-place recovery in a running tab,
  the expiration modal, or what happens after Log in; those are later slices of #157. The server observes an expired
  record only briefly before the store
  evicts it, so a request after the deadline is usually explained as no longer available.

  Background:
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"

  Scenario: A protected action after the session record was removed is denied with recovery meaning
    Given the visitor has signed in at "springfield.localhost:3000" through the provider
    And the visitor's session record is removed by logging out in another browser
    When a visitor invokes the protected reference action at "springfield.localhost:3000"
    Then the response status is 401
    And the response body is empty
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

  Scenario: With scripts, a protected form submission after the record was removed is not performed
    The keyboard submission is also activity, and a refused activity report ends the tab by itself,
    so this scenario delays those reports to observe the denied action's own outcome.

    Given the visitor has signed in at "springfield.localhost:3000" through the provider
    And the visitor opens the application entry at "springfield.localhost:3000" with scripts enabled
    And the visitor's activity reports reach the server 2 seconds late
    And the visitor's session record is removed by logging out in another browser
    And the visitor's page records its status announcements
    When the visitor submits the reference form by keyboard
    Then the form submission is a fetch request answered with status 401
    And the browser holds no reference-operation receipt
    And the page announced "The operation was not performed." and then shows the signed-out notice
