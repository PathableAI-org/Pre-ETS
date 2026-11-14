@partial
@preets-session-013
Feature: Fresh Log in from expired-session recovery and the expiration modal
  This feature establishes, in real browsers that hold a provider single sign-on session for the
  tracked local provider and a tenant whose idle timeout is five minutes, that Log in from
  in-tab recovery content and from the blocking expiration modal starts nothing until the
  visitor activates it, then asks the provider to authenticate again and yields a new session,
  while the earlier session is never admitted again. A second tab still behind the expiration
  modal keeps showing it, with no protected content, after another tab's login, and its own Log
  in then shows the application from a new document under the valid session without another
  provider login. A login cancelled at the provider and a provider that becomes unreachable,
  from either entry point, show nothing protected, establish no usable session, and a later Log
  in succeeds. Each failing login reaches the real provider, which asks the visitor to
  authenticate; the browser then replaces the provider's answer to the visitor's submission. A
  cancellation is the error return the provider sends when a visitor declines, because the
  tracked realm's cancellation client would keep the synthetic user's grant. An unreachable
  provider is a refused connection, because stopping the shared provider is outside the runner.
  The realm's stale authentication-time client cannot establish the session that expires, so
  stale and missing authentication time from these entry points are not established here; the
  real provider's stale and cancel returns are established at the callback in
  tenant-oidc-callback.feature, and freshness decisions in module evidence. Suspension is
  emulated with Playwright's clock, and assistive-technology announcements and providers other
  than the local one are not established here.

  Background:
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    And Springfield sessions end after 5 minutes of inactivity

  @preets-session-007
  @preets-session-012
  Scenario: Log in from expired recovery and from the modal asks the provider again, and a tab left expired shows nothing until its own Log in
    The visitor's tabs "M1" and "M2" share one session and reach the expiration modal. Another
    browser's tab "R" keeps its timers suspended past its deadline and submits the protected
    action, so it shows in-tab recovery. Each browser holds its own provider session.

    Given the visitor has signed in at "springfield.localhost:3000" and opened tabs "M1" and "M2"
    And another browser has signed in at "springfield.localhost:3000" and opened tab "R" with its timers suspended
    When the idle deadline of tabs "M1", "M2", and "R" passes
    Then tabs "M1" and "M2" show the expiration modal and no protected content
    When the clock of tab "R" is set to the current time without running its timers
    And the visitor submits the reference form by keyboard in tab "R"
    Then tab "R" shows recovery explaining "Your session expired" in place of its content
    When the timers of tab "R" run again
    And the visitor waits 5 seconds without acting
    Then no login has started in tabs "M1", "M2", and "R"
    When the visitor activates "Log in again" by keyboard in tab "M1"
    Then the provider asks the visitor to authenticate in tab "M1"
    When the visitor authenticates at the provider in tab "M1"
    Then tab "M1" shows the protected application under a new session
    And a request presenting the earlier session of tab "M1" is not admitted
    And tab "M2" still shows the expiration modal and no protected content after the login in tab "M1"
    When the visitor activates "Log in again" by keyboard in tab "M2"
    Then tab "M2" shows the protected application from a new document without another provider login
    When the visitor activates "Log in again" in the recovery content by keyboard in tab "R"
    Then the provider asks the visitor to authenticate in tab "R"
    When the visitor authenticates at the provider in tab "R"
    Then tab "R" shows the protected application under a new session
    And a request presenting the earlier session of tab "R" is not admitted

  @preets-session-007
  Scenario Outline: A failed Log in from recovery content shows nothing protected and a later Log in succeeds
    Another browser sharing the session logs out, so the visitor's tab learns only from its denied
    action that the session is no longer available.

    Given the visitor has signed in at "springfield.localhost:3000" and opened tab "R"
    And another browser sharing the visitor's session has opened tab "Sharing"
    When the visitor logs out in tab "Sharing"
    And the visitor submits the reference form by keyboard in tab "R"
    Then tab "R" shows recovery explaining "Your session is no longer available" in place of its content
    When the visitor waits 5 seconds without acting
    Then no login has started in tabs "R"
    When <failure> at the next authentication step in tab "R"
    And the visitor activates "Log in again" in the recovery content by keyboard in tab "R"
    Then the provider asks the visitor to authenticate in tab "R"
    When the visitor submits the authentication step at the provider in tab "R"
    Then tab "R" shows no protected content and holds no usable application session
    When the visitor tries Log in again from tab "R"
    Then the provider asks the visitor to authenticate in tab "R"
    When the visitor authenticates at the provider in tab "R"
    Then tab "R" shows the protected application under a new session
    And a request presenting the earlier session of tab "R" is not admitted

    Examples:
      | failure                              |
      | the visitor will cancel              |
      | the provider will become unreachable |

  @preets-session-012
  Scenario: A failed Log in from the expiration modal shows nothing protected and a later Log in succeeds
    Two browsers, each with its own session and provider session, reach the expiration modal
    together. One login is cancelled at the provider; the other cannot reach the provider.

    Given the visitor has signed in at "springfield.localhost:3000" and opened tab "Cancelled"
    And another browser has signed in at "springfield.localhost:3000" and opened tab "Unreachable"
    When the idle deadline of tabs "Cancelled" and "Unreachable" passes
    Then tabs "Cancelled" and "Unreachable" show the expiration modal and no protected content
    When the visitor waits 5 seconds without acting
    Then no login has started in tabs "Cancelled" and "Unreachable"
    When the visitor will cancel at the next authentication step in tab "Cancelled"
    And the provider will become unreachable at the next authentication step in tab "Unreachable"
    And the visitor activates "Log in again" by keyboard in tab "Cancelled"
    And the visitor activates "Log in again" by keyboard in tab "Unreachable"
    Then the provider asks the visitor to authenticate in tab "Cancelled"
    And the provider asks the visitor to authenticate in tab "Unreachable"
    When the visitor submits the authentication step at the provider in tab "Cancelled"
    And the visitor submits the authentication step at the provider in tab "Unreachable"
    Then tab "Cancelled" shows no protected content and holds no usable application session
    And tab "Unreachable" shows no protected content and holds no usable application session
    When the visitor tries Log in again from tab "Cancelled"
    Then the provider asks the visitor to authenticate in tab "Cancelled"
    When the visitor authenticates at the provider in tab "Cancelled"
    Then tab "Cancelled" shows the protected application under a new session
    When the visitor tries Log in again from tab "Unreachable"
    Then the provider asks the visitor to authenticate in tab "Unreachable"
    When the visitor authenticates at the provider in tab "Unreachable"
    Then tab "Unreachable" shows the protected application under a new session
