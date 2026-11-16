@partial
@preets-session-008
Feature: The server ends each session at the deadline its tenant's idle timeout gives, by the test's own clock
  This feature establishes, with sessions signed in through the tracked provider and then presented
  over unfollowed HTTP with no browser left running, so only the server can end them, where the
  tenant idle timeout puts each deadline, judged by the test's own clock rather than by a deadline
  the application reports. A session's deadline is due its timeout after the request that last
  wrote it: a renewal, timed from sending that request to its answer, or a sign-in, timed from the
  browser's first request to its closing, since the provider's return establishes the session and
  the entry it loads renews it. Status reads never renew, so they observe a session without
  changing it.

  An explicit timeout below 5, above 30, fractional, text, or null makes the tenant an ordinary
  missing tenant that sets no cookie and starts no login, and a timeout made invalid while a
  session is open answers that session's requests as for a missing tenant and renews nothing.
  Timeouts of 5 and 30 minutes are accepted, and an omitted timeout gives 30. The server admits a
  session a second before the earliest moment it is due to end and refuses it once the latest has
  passed. A changed timeout reaches a session only when a page request, in-page activity, or a
  protected form submission renews it; prefetch, RSC, image, and status requests leave its deadline
  where it was; and once a session has ended, raising the timeout lets no request revive it.

  Not established here: enforcement of a 30-minute deadline, of which only the reported value is
  compared with the test's clock, because waiting for it would add half an hour to the nightly run;
  cross-instance and concurrent conditions (shared-session-instances.feature).

  Background:
    Given production tenant sites for Springfield and Shelbyville

  Scenario Outline: An invalid idle timeout makes the tenant an ordinary missing tenant
    Given tenant resolution uses "host" mode
    And the selected Springfield tenant file is "<setting>"
    When a visitor requests the document at "springfield.example.test"
    Then the response status is 404
    And the response has no redirect
    And the response issues no application or correlation cookie
    When a visitor requests "/auth/login" at "springfield.example.test"
    Then the response status is 404
    And the response has no redirect
    And the response issues no application or correlation cookie

    Examples:
      | setting                        |
      | an idle timeout of 4           |
      | an idle timeout of 31          |
      | an idle timeout of 7.5         |
      | an idle timeout of 10, as text |
      | an idle timeout of null        |

  Scenario: A timeout made invalid while a session is open is refused, and the session is not renewed
    Each request would renew the session, or read it, were the tenant accepted. Once the timeout
    is valid again, the session still has the deadline its sign-in gave it.

    Given host resolution uses base hostname "localhost"
    And Springfield sessions end after 5 minutes of inactivity
    And the visitor signs in to session "Open" at "springfield.localhost:3000"
    When Springfield's tenant file changes to an idle timeout of 31
    Then a page request, in-page activity, a protected form submission, and a status read for session "Open" are each answered 404, as for a missing tenant
    When Springfield's tenant file changes to an idle timeout of 5
    Then session "Open" reports a deadline 5 minutes after it was established or last renewed

  Scenario: The longest timeout and an omitted one each give a new session a deadline 30 minutes after its sign-in
    Given host resolution uses base hostname "localhost"
    And Springfield sessions end after 30 minutes of inactivity
    And the visitor signs in to session "Longest" at "springfield.localhost:3000"
    When Springfield's tenant file sets no idle timeout and no warning lead
    And the visitor signs in to session "Omitted" at "springfield.localhost:3000"
    Then sessions "Longest" and "Omitted" each report a deadline 30 minutes after they were established or last renewed

  @preets-session-009
  Scenario: Each session ends at the timeout in effect when it was last written, and nothing revives it
    Takes about seven minutes. Every session signs in under a five-minute timeout except "Later",
    which signs in after it changes to six. "Paged", "Active", and "Submitted" are then renewed one
    way each, so each adopts six minutes at its own refresh. "Background" is never renewed: it is
    presented only with requests an open tab sends on its own, right after the change and again 30
    seconds before its deadline, and any of them that renewed it would have moved that deadline.

    Given host resolution uses base hostname "localhost"
    And Springfield sessions end after 5 minutes of inactivity
    And the visitor signs in to sessions "Background", "Paged", "Active", and "Submitted" at "springfield.localhost:3000"
    When Springfield's tenant file changes to an idle timeout of 6
    And the visitor signs in to session "Later" at "springfield.localhost:3000"
    And session "Paged" is renewed by a page request
    And session "Active" is renewed by in-page activity
    And session "Submitted" is renewed by a protected form submission
    And session "Background" is presented with a prefetch, an RSC request, an image request, and a status read
    Then each of those requests was admitted without moving the deadline of session "Background"
    And session "Background" reports a deadline 5 minutes after it was established or last renewed
    And sessions "Later", "Paged", "Active", and "Submitted" each report a deadline 6 minutes after they were established or last renewed
    When the visitor waits until 30 seconds before session "Background" is due to end, 5 minutes after it was established or last renewed
    And session "Background" is presented with a prefetch, an RSC request, an image request, and a status read
    Then each of those requests was admitted without moving the deadline of session "Background"
    And the server ends session "Background" 5 minutes after it was established or last renewed, and not before
    When Springfield's tenant file changes to an idle timeout of 30
    Then a page request, in-page activity, and a protected form submission for session "Background" are each refused, and it stays ended
    And the server ends sessions "Later", "Paged", "Active", and "Submitted" 6 minutes after they were established or last renewed, and not before
