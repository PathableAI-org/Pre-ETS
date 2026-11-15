@partial
@preets-session-006
Feature: Session state shared by independently running application instances
  Each scenario starts two production application processes, A and B, independently. They serve the
  same logical tenant authorities and share only the configured session store. A session is signed
  in through the tracked provider in a real browser whose every request, the provider return
  included, reaches one named instance; it is then presented over unfollowed HTTP to a named
  instance. Status reads never renew, so they observe a deadline without changing it.

  These scenarios establish that a session established through either instance is admitted through
  the other with the same user and tenant; that a renewal through one instance keeps the session
  usable through the other past its original deadline; that an expiration observed through one
  instance is honoured by the other, which established and renewed that session, so that neither a
  page request nor activity through it revives the session; that after renewals through both
  instances at once, both report the same deadline; and that page requests and activity through
  both instances at once at that deadline do not revive the session.

  Not established here: PREETS-SESSION-008's timeout domain and default, initial and renewed
  deadline values, policy adoption on refresh, and background traffic; more than two instances;
  routing by real infrastructure ingress. Expiration is observed from a tenth of a second after
  the deadline, not at its exact instant.

  Background:
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"

  Scenario: A session established through either instance is admitted through the other with the same user and tenant
    The visitor's Springfield session is established through instance A and the Shelbyville
    session through instance B, so each instance admits a session it never served before.

    When the visitor signs in to session "Springfield" at "springfield.localhost:3000" through instance A
    And the visitor signs in to session "Shelbyville" at "shelbyville.localhost:3000" through instance B
    Then instance B admits session "Springfield" to the application entry with the same user and tenant as instance A
    And instance A admits session "Shelbyville" to the application entry with the same user and tenant as instance B

  @preets-session-008
  Scenario: Renewal and expiration through one instance are honoured by the other, in both directions
    Springfield's idle timeout is five minutes, the shortest allowed, so this scenario waits for it
    to pass. Session "One" is established and renewed through instance A and observed through B;
    session "Two" the reverse. Both renewals come 30 seconds after both sign-ins, so each renewed
    deadline is later than both original ones.

    Given Springfield sessions end after 5 minutes of inactivity
    And the visitor signs in to session "One" at "springfield.localhost:3000" through instance A
    And the visitor signs in to session "Two" at "springfield.localhost:3000" through instance B
    When the visitor waits 30 seconds without acting
    And session "One" is renewed by a page request through instance A
    And session "Two" is renewed by a page request through instance B
    Then instance B reports the deadline that renewal set for session "One"
    And instance A reports the deadline that renewal set for session "Two"
    When the original deadlines of sessions "One" and "Two" pass
    Then instance B still reports session "One" usable with that renewed deadline
    And instance A still reports session "Two" usable with that renewed deadline
    When the renewed deadlines of sessions "One" and "Two" pass
    Then instance B denies session "One" protected access
    And instance A denies session "One" protected access
    And activity for session "One" through instance A is refused and revives it on neither instance
    And instance A denies session "Two" protected access
    And instance B denies session "Two" protected access
    And activity for session "Two" through instance B is refused and revives it on neither instance

  @preets-session-008
  Scenario: Requests through both instances at once keep one deadline and cannot revive a session at its deadline
    Springfield's idle timeout is five minutes, so this scenario also waits for it to pass.

    Given Springfield sessions end after 5 minutes of inactivity
    And the visitor signs in to session "Shared" at "springfield.localhost:3000" through instance A
    When activity for session "Shared" reaches instances A and B simultaneously
    Then instances A and B report the same later deadline for session "Shared", set by one of those renewals
    When session "Shared" reaches its deadline as page requests and activity reach instances A and B simultaneously
    Then each of those simultaneous requests for session "Shared" is denied
    And neither instance reports session "Shared" usable
