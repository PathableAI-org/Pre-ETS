@partial
@preets-session-004
@preets-session-013
Feature: Fresh entry after natural session expiry
  This feature establishes, in real browsers that signed in through the tracked local provider at a tenant
  whose idle timeout is five minutes, that once a session has expired naturally, with no activity, opening
  the application in a new tab, refreshing, and browser back and forward each start tenant sign-in
  directly: no protected document is served or restored first, the application asks the provider for fresh
  authentication, and the provider asks the visitor to authenticate again although the browser still holds
  a provider single sign-on session that would sign it in without asking. Back and forward are exercised
  between documents, including back to a page the browser restores from its back/forward cache, and within
  the application's own in-place navigation, which loads no document. After
  the visitor authenticates, the protected application is shown under a new session, and the expired one is
  never admitted again. Each entry runs in a browser of its own, with its own provider and application
  sessions, so one entry's login cannot satisfy another's. It does not establish the expiration modal
  (expiration-protection.feature), re-entry after logout removed the session (fresh-oidc-recovery.feature),
  missing or stale authentication time after expiry, or any provider other than the local one.

  Background:
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    And Springfield sessions end after 5 minutes of inactivity

  Scenario: After natural expiry a new tab, a refresh, and document back and forward ask the provider again and yield a new session
    The shortest idle timeout is five minutes, so the scenario waits for it to pass with no activity.
    Tab "Back" left the entry for the roster, and tab "Forward" returned from the roster to the entry,
    each by a full navigation. Tab "Restored" left the entry for a public page, so the browser keeps
    the entry in its back/forward cache.

    Given the visitor has signed in at "springfield.localhost:3000" and opened tab "Opener"
    And another browser has signed in at "springfield.localhost:3000" and opened tab "Refresh"
    And another browser has signed in at "springfield.localhost:3000" and opened tab "Back"
    And the visitor has opened the roster in tab "Back"
    And another browser has signed in at "springfield.localhost:3000" and opened tab "Forward"
    And the visitor has opened the roster in tab "Forward" and returned to the entry
    And another browser has signed in at "springfield.localhost:3000" and opened tab "Restored"
    And the visitor has left tab "Restored" for a public page
    When the idle deadline of tabs "Opener", "Refresh", "Back", "Forward", and "Restored" passes
    And the visitor opens a new tab "New" in the browser of tab "Opener"
    Then tab "New" follows fresh entry to the provider without the modal or protected content
    And the provider asks the visitor to authenticate in tab "New"
    And the provider still holds the single sign-on session of tab "New"
    When the visitor authenticates at the provider in tab "New"
    Then tab "New" shows the protected application under a new session
    And a request presenting the earlier session of tab "New" is not admitted
    When the visitor refreshes tab "Refresh"
    Then tab "Refresh" follows fresh entry to the provider without the modal or protected content
    And the provider asks the visitor to authenticate in tab "Refresh"
    And the provider still holds the single sign-on session of tab "Refresh"
    When the visitor authenticates at the provider in tab "Refresh"
    Then tab "Refresh" shows the protected application under a new session
    And a request presenting the earlier session of tab "Refresh" is not admitted
    When the visitor navigates back in tab "Back"
    Then tab "Back" follows fresh entry to the provider without the modal or protected content
    And the provider asks the visitor to authenticate in tab "Back"
    And the provider still holds the single sign-on session of tab "Back"
    When the visitor authenticates at the provider in tab "Back"
    Then tab "Back" shows the protected application under a new session
    And a request presenting the earlier session of tab "Back" is not admitted
    When the visitor navigates forward in tab "Forward"
    Then tab "Forward" follows fresh entry to the provider without the modal or protected content
    And the provider asks the visitor to authenticate in tab "Forward"
    And the provider still holds the single sign-on session of tab "Forward"
    When the visitor authenticates at the provider in tab "Forward"
    Then tab "Forward" shows the protected application under a new session
    And a request presenting the earlier session of tab "Forward" is not admitted
    When the visitor navigates back in tab "Restored"
    Then tab "Restored" is restored from the back-forward cache and follows fresh entry to the provider without the modal or protected content
    And the provider asks the visitor to authenticate in tab "Restored"
    And the provider still holds the single sign-on session of tab "Restored"
    When the visitor authenticates at the provider in tab "Restored"
    Then tab "Restored" shows the protected application under a new session
    And a request presenting the earlier session of tab "Restored" is not admitted

  Scenario: After natural expiry in-app back and forward ask the provider again and yield a new session
    The roster opens the participant page in place, through the application's own navigation, so
    those history entries belong to one document. Tab "In-app forward" went back to the roster in place.
    The click that opens the page in place is activity, so each tab is left until it shows the expiration
    modal, which it shows once the server has answered that its session ended.

    Given the visitor has signed in at "springfield.localhost:3000" and opened tab "In-app back"
    And the visitor has opened the participant page in place from the roster in tab "In-app back"
    And another browser has signed in at "springfield.localhost:3000" and opened tab "In-app forward"
    And the visitor has opened the participant page in place from the roster in tab "In-app forward" and gone back to the roster
    When the sessions of tabs "In-app back" and "In-app forward" expire and each shows the expiration modal
    And the visitor navigates back in tab "In-app back"
    Then tab "In-app back" leaves for fresh entry at the provider without exposing protected content
    And the provider asks the visitor to authenticate in tab "In-app back"
    And the provider still holds the single sign-on session of tab "In-app back"
    When the visitor authenticates at the provider in tab "In-app back"
    Then tab "In-app back" shows the protected application under a new session
    And a request presenting the earlier session of tab "In-app back" is not admitted
    When the visitor navigates forward in tab "In-app forward"
    Then tab "In-app forward" leaves for fresh entry at the provider without exposing protected content
    And the provider asks the visitor to authenticate in tab "In-app forward"
    And the provider still holds the single sign-on session of tab "In-app forward"
    When the visitor authenticates at the provider in tab "In-app forward"
    Then tab "In-app forward" shows the protected application under a new session
    And a request presenting the earlier session of tab "In-app forward" is not admitted
