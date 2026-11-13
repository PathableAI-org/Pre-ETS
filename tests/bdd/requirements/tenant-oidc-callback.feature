@partial
@preets-session-003
Feature: Validate the selected tenant OIDC callback
  This slice recovers one tenant-bound provider attempt across frontend instances.
  A real provider return whose authentication event is confirmed fresh establishes a
  tenant-bound session that admits the application entry; a return whose provider reports
  a stale authentication time, a return after the visitor cancels at the provider, and
  untrusted, mismatched, replayed, expired, and denied returns, establish none, and after a
  stale, cancelled, or denied return a new login can begin. Tenant-mismatch denial with a
  real bound session and expired-session action denial remain without end-to-end
  evidence here.

  @preets-session-002
  @preets-session-013
  Scenario: A fresh real provider return across instances establishes a session
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    When the visitor completes real provider sign-in across two application instances at "springfield.localhost:3000"
    Then the response establishes a session and navigates to the application entry
    And the response is not cacheable
    And the response contains no protected application content
    And the established session admits the application entry at "springfield.localhost:3000"

  @preets-session-013
  Scenario: A real provider return with a stale authentication time establishes no session
    Given production tenant sites for Springfield and Shelbyville
    And a Stale tenant whose provider always reports an old authentication time
    And host resolution uses base hostname "localhost"
    When the visitor completes real provider sign-in across two application instances at "stale.localhost:3000"
    Then the response status is 200
    And the response is not cacheable
    And the response has no redirect
    And the response contains no protected application content
    And the response clears recoverable correlation and issues no application session
    When a visitor requests the document at "stale.localhost:3000"
    Then the response delegates to the same-origin login
    When a visitor requests "/auth/login" at "stale.localhost:3000"
    Then initiation uses the independently configured "stale" tenant
    And the authorization request asks for fresh authentication

  @preets-session-013
  Scenario: Cancelling at the real provider establishes no session and a new login can begin
    Given production tenant sites for Springfield and Shelbyville
    And a Consent tenant whose provider asks the visitor to grant access
    And host resolution uses base hostname "localhost"
    When the visitor signs in and then cancels at the real provider at "consent.localhost:3000"
    Then the response status is 200
    And the response has no redirect
    And the response contains no protected application content
    And the response clears recoverable correlation and issues no application session
    When a visitor requests the document at "consent.localhost:3000"
    Then the response delegates to the same-origin login
    When a visitor requests "/auth/login" at "consent.localhost:3000"
    Then initiation uses the independently configured "consent" tenant
    And the authorization request asks for fresh authentication

  @preets-session-002
  Scenario: A wrong-state callback preserves the original valid provider return
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    When the visitor submits a wrong-state callback before the captured valid return at "springfield.localhost:3000"
    Then the earlier callback status is 200
    And the earlier callback issues no cookie
    Then the response establishes a session and navigates to the application entry

  @preets-session-002
  Scenario: Cross-tenant mismatch cannot consume the original provider return
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    When the captured Springfield return is first submitted to Shelbyville and then Springfield
    Then the earlier callback status is 200
    And the earlier callback issues no cookie
    Then the response establishes a session and navigates to the application entry

  @preets-session-002
  Scenario: Concurrent consumption has one winner and replay has none
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    When two application instances race the same captured valid return at "springfield.localhost:3000"
    Then exactly one raced callback consumes the return and replay does not
    And the response establishes a session and navigates to the application entry

  @preets-session-002
  Scenario: Expired recovery denies without protected content
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    And the recoverable authentication lifetime is 1 second
    When the visitor submits the captured provider return after it expires at "springfield.localhost:3000"
    Then the response status is 200
    And the response has no redirect
    And the response contains no protected application content
    And the response issues no application or correlation cookie

  @preets-security-001
  @preets-session-002
  Scenario: Controlled provider denial is handled without disclosure
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    When the visitor submits a matching controlled provider denial at "springfield.localhost:3000"
    Then the response status is 200
    And the response has no redirect
    And the response contains no protected application content
    And the response clears recoverable correlation and issues no application session
    And the response does not re-emit controlled provider callback data
    When a visitor requests the document at "springfield.localhost:3000"
    Then the response delegates to the same-origin login
