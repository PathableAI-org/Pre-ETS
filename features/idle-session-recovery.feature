@idle-session-timeout @US2
Feature: Recover access after inactivity
  Users understand inactivity expiration and regain tenant-bound access without restoring cleared temporary data.

  Background:
    Given the user has authenticated access for idle-timeout tenant "springfield"
    And the user has temporary unsaved work "Unsent practice note"
    And the user has a durable saved record "Saved practice note"

  @FR-009 @FR-010 @SC-003 @browser @contract
  Scenario: Expiration explains the interruption and clears temporary work
    When the user's access expires for confirmed inactivity while the application is running
    And client-driven revalidation confirms that inactivity cause with the authoritative server without a later full navigation
    Then an accessible modal explains that inactivity ended the session
    And the modal offers a button named "Log in again"
    And protected content and "Unsent practice note" are no longer exposed in the active application
    And temporary data belonging to the expired session has been cleared
    And the durable record "Saved practice note" remains saved
    And client timing alone did not authorize continued access after the deadline

  @FR-009 @SC-003 @browser
  Scenario: Keyboard users can act on the expiration modal without returning to protected work
    Given the user was editing "Unsent practice note" when inactivity expiration was confirmed
    And the inactivity modal has opened
    When the user navigates the modal's actions with the keyboard
    Then focus remains visibly usable within the modal's available actions
    And keyboard navigation does not reach the expired protected work
    And the user can activate "Log in again" with the keyboard
    And the Springfield authentication journey begins

  @FR-009 @SC-003 @browser
  Scenario: Assistive technology communicates the expiration and recovery action
    Given the user is using assistive technology to read protected content
    When confirmed inactivity expiration opens the modal
    Then focus moves into the modal
    And its accessible name and description communicate the inactivity interruption
    And "Log in again" is announced as an actionable button
    And the expired protected content is unavailable to assistive technology

  @FR-009 @FR-010 @SC-003 @browser
  Scenario: Login again returns the user through the originating tenant's authentication
    Given the confirmed inactivity modal is open for "springfield"
    And the user's identity provider requires an authentication challenge
    When the user activates "Log in again" and successfully completes Springfield authentication
    Then the user regains authorized access only to "springfield"
    And the expired session is not revived
    And "Unsent practice note" is not restored
    And the user can access the durable record "Saved practice note"

  @FR-003 @FR-010 @SC-003 @SC-004 @browser @contract
  Scenario: Existing identity-provider sign-in can establish new application access
    Given the original session used a 30-minute duration and has expired for inactivity
    And Springfield's current tenant duration is 7 minutes
    And the identity provider accepts the user's existing sign-in without a new challenge
    When the user activates "Log in again" and completes the tenant authentication journey
    Then the user has new authenticated Springfield access with a 7-minute duration
    And no fresh credentials challenge is required by the application
    And the expired session and "Unsent practice note" are not restored
    And the durable record "Saved practice note" remains accessible

  @FR-010 @SC-002 @SC-003 @browser
  Scenario Outline: Unsuccessful login again cannot restore access
    Given the confirmed inactivity modal is open
    And the user has activated "Log in again"
    When the authentication journey ends with "<outcome>"
    Then the user still cannot perform protected work
    And the user receives an understandable keyboard-operable retry path
    And cleared temporary session data is not restored

    Examples:
      | outcome                     |
      | the user cancels            |
      | authentication fails        |
      | the provider is unavailable |

  @FR-008 @FR-009 @SC-003 @browser
  Scenario Outline: Recovery does not invent an inactivity cause
    Given access ended because of "<cause>"
    And inactivity expiration has not been established
    When the application presents the interruption to the user
    Then the explanation does not claim inactivity ended the session
    And the user cannot resume protected work through the unusable access

    Examples:
      | cause                                  |
      | missing session state                  |
      | evicted session state                  |
      | unavailable authorization state        |
      | confirmed absolute lifetime expiration |
      | indistinguishable lifetime causes      |

  @FR-004 @FR-008 @FR-009 @FR-010 @SC-002 @SC-003 @browser @contract
  Scenario Outline: Resumed applications clear expired protected content before interaction
    Given the application stopped running normally because of "<condition>"
    And access has expired with confirmed inactivity while the application could not update
    When the user resumes the application
    Then expired protected content is removed before further interaction is enabled
    And temporary data belonging to the expired session is cleared
    And the inactivity modal offers "Log in again"
    And protected work using the expired access remains denied

    Examples:
      | condition       |
      | device sleep    |
      | offline use     |
      | a suspended tab |

  @FR-005 @FR-009 @FR-010 @SC-003 @SC-004 @browser @contract
  Scenario: A second tab cannot retain expired temporary work
    Given two running tabs share the same authenticated session and its temporary work
    When one tab discovers that shared access has ended for confirmed inactivity
    Then both tabs promptly remove expired protected content and present the inactivity recovery experience
    And neither tab continues to expose "Unsent practice note" from the expired session
    And the durable record "Saved practice note" remains saved
    And neither tab treats local client timing as authority to grant continued access
