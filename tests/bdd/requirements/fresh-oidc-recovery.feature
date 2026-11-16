@partial
@preets-session-013
Feature: Fresh tenant OIDC recovery with a new session
  Every scenario starts from a browser that already holds a provider single sign-on session for
  the tracked local provider. This slice establishes that such a session never yields an
  application session silently: a first visit, re-entry after logout removed the stored session
  through a new page, a refresh, or a back or forward history entry, and explicit Log in from
  the signed-out notice each ask the provider to authenticate again and yield a new session,
  with no protected page served or restored from the browser's history cache first, while a
  valid session is reused and the removed one is never admitted again. Each time the provider
  asks, the browser's single sign-on session is shown to be still held: the same authorization
  without the freshness request would be answered at once. Leaving the provider's authentication
  step unanswered and opening the application again starts a new login, shows nothing protected,
  and holds no usable session, and a later login succeeds; the step offers no cancel control, so
  a cancellation the provider reports from it is not established here. It does not establish
  re-entry after natural idle expiry (fresh-entry-after-expiry.feature), missing or stale
  provider evidence at this boundary (module evidence; a stale return with a single sign-on
  session held is in tenant-oidc-callback.feature), Log in from expired-session recovery content
  or the expiration modal (expired-recovery-login.feature), or any provider other than the local
  one. The provider records authentication times in whole seconds and may treat a request within
  the same second as its last authentication as already fresh, so each entry follows a short
  wait.

  Background:
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    And the visitor holds a provider single sign-on session for "springfield.localhost:3000"
    And a few seconds pass since the visitor last authenticated

  @preets-session-004
  Scenario: A first visit asks the provider to authenticate again and then admits a session that later pages reuse
    When the visitor opens "/" in the browser
    Then the provider asks the visitor to authenticate
    And the provider still holds the visitor's single sign-on session
    When the visitor authenticates at the provider
    Then the protected application is shown
    When the visitor remembers the current application session
    And the visitor opens "/coordination/roster" in a new page
    Then the protected application is shown without another provider login

  @preets-session-004
  Scenario Outline: Re-entry after the session was removed asks the provider again and yields a new session
    When the visitor opens "/" in the browser
    And the visitor authenticates at the provider
    And the visitor opens "/coordination/roster" in the browser
    And the visitor remembers the current application session
    And the visitor logs out
    And a few seconds pass since the visitor last authenticated
    And <entry>
    Then the provider asks the visitor to authenticate
    And the provider still holds the visitor's single sign-on session
    And no protected content was served before the provider asked
    When the visitor authenticates at the provider
    Then the protected application is shown
    And the visitor holds an application session different from the remembered one
    And a request presenting the remembered session reference is not admitted

    Examples:
      | entry                                 |
      | the visitor opens "/" in a new page   |
      | the visitor refreshes the page        |
      | the visitor navigates back in history |

  @preets-session-004
  Scenario: A forward history entry after the session was removed asks the provider again and yields a new session
    When the visitor opens "/" in the browser
    And the visitor authenticates at the provider
    And the visitor opens "/coordination/roster" in the browser
    And the visitor navigates back in history
    And the visitor remembers the current application session
    And the visitor logs out in another page
    And a few seconds pass since the visitor last authenticated
    And the visitor navigates forward in history
    Then the provider asks the visitor to authenticate
    And the provider still holds the visitor's single sign-on session
    And no protected content was served before the provider asked
    When the visitor authenticates at the provider
    Then the protected application is shown
    And the visitor holds an application session different from the remembered one
    And a request presenting the remembered session reference is not admitted

  Scenario: Log in from the signed-out notice asks the provider again and yields a new session
    When the visitor opens "/" in the browser
    And the visitor authenticates at the provider
    And the visitor remembers the current application session
    And the visitor logs out
    And a few seconds pass since the visitor last authenticated
    And the visitor activates Log in on the signed-out notice with the keyboard
    Then the provider asks the visitor to authenticate
    And the provider still holds the visitor's single sign-on session
    When the visitor authenticates at the provider
    Then the protected application is shown
    And the visitor holds an application session different from the remembered one

  Scenario: Leaving the provider's authentication step unanswered shows nothing protected and a later login succeeds
    When the visitor opens "/" in the browser
    And the visitor authenticates at the provider
    And the visitor remembers the current application session
    And the visitor logs out
    And a few seconds pass since the visitor last authenticated
    And the visitor activates Log in on the signed-out notice with the keyboard
    Then the provider asks the visitor to authenticate
    And the provider still holds the visitor's single sign-on session
    When the visitor leaves the provider's authentication step unanswered and opens "/" again
    Then the application starts a new provider login
    And the provider asks the visitor to authenticate
    And no protected content was served before the provider asked
    And the visitor holds no usable application session
    When the visitor authenticates at the provider
    Then the protected application is shown
    And the visitor holds an application session different from the remembered one
