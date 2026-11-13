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
  401 here. It does not establish what a browser displays, a real scripts-disabled browser
  submission, in-place recovery in a running tab, the expiration modal, or Log in itself; those
  are later slices of #157. The server observes an expired record only briefly before the store
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
