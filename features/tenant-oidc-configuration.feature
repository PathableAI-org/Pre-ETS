@tenant-oidc-login @US2
Feature: Tenant OIDC connection configuration
  Trusted tenant settings select login connections and explain failures without exposing sensitive data.

  Background:
    Given isolated OIDC tenant fixtures are configured:
      | tenant      | display name | issuer                                  | client          | connection      |
      | springfield | Springfield  | https://identity.example/realms/pre-ets | springfield-web | springfield-idp |
      | shelbyville | Shelbyville  | https://identity.example/realms/pre-ets | shelbyville-web | shelbyville-idp |
    And the visitor has no existing session
    And the existing session capability is available

  @FR-001 @FR-003 @SC-001 @browser @contract
  Scenario Outline: Required connection selection follows the provider registration
    Given Springfield's provider registration "<registration>"
    And its trusted OIDC settings supply "<selection>"
    When the visitor navigates to "https://springfield.pathable.com/"
    Then the browser reaches Springfield's intended usable provider login experience
    And the tenant id remains "springfield" and Display Name remains "Springfield"

    Examples:
      | registration                         | selection              |
      | requires broker connection selection | springfield-idp        |
      | needs no broker connection selector  | issuer and client only |

  @FR-002 @SC-003 @http @contract
  Scenario: Required client credentials remain server-only
    Given Springfield's provider registration requires a client credential
    And a synthetic credential is supplied at runtime through the planned server-only mechanism
    When the visitor navigates to "https://springfield.pathable.com/"
    Then server-side authentication work can access the supplied credential
    And that credential is absent from browser content, browser-visible configuration, redirect URLs, and captured diagnostics
    And no other tenant's credential is used

  @FR-001 @FR-004 @FR-007 @FR-008 @SC-003 @browser @contract
  Scenario Outline: Detectable configuration defects prevent login initiation
    Given Springfield's login configuration has defect "<defect>"
    And Shelbyville retains a valid login configuration
    When the visitor navigates to "https://springfield.pathable.com/"
    Then the visitor receives an app-owned error explaining that login cannot start and a clear next action
    And no login is initiated and no tenant application content is served
    And no default provider or other tenant's configuration is substituted
    And a safe diagnostic identifies a configuration failure without credentials or other tenant details
    And the response does not trigger an automatic redirect loop

    Examples:
      | defect                                    |
      | Display Name only with no OIDC settings   |
      | missing issuer                            |
      | malformed issuer URL                      |
      | missing application client identifier     |
      | missing required broker connection        |
      | app-detectable unusable broker connection |
      | missing required server-only credential   |
      | invalid approved return destination       |

  @FR-004 @FR-007 @FR-008 @SC-003 @browser @contract
  Scenario Outline: Unavailable required metadata prevents initiation
    Given required provider metadata is "<condition>" before login can start
    When the visitor navigates to "https://springfield.pathable.com/"
    Then the visitor receives an app-owned error explaining that login cannot start and a clear next action
    And a safe diagnostic identifies a provider failure without credentials or other tenant details
    And no login is initiated and no tenant application access is granted
    And no default provider is substituted and no automatic redirect loop occurs

    Examples:
      | condition                     |
      | unreachable                   |
      | unusable for login initiation |

  @FR-007 @SC-003 @production @http @contract
  Scenario Outline: Insecure destinations are rejected outside explicit local development
    Given the application runs outside explicit local development
    And Springfield's configured "<destination>" uses "<url>"
    When the visitor navigates to "https://springfield.pathable.com/"
    Then an app-owned configuration failure prevents login initiation
    And no insecure redirect or tenant application access is granted

    Examples:
      | destination             | url                                    |
      | issuer                  | http://identity.example/realms/pre-ets |
      | provider login endpoint | http://identity.example/authorize      |
      | approved return         | http://springfield.pathable.com/       |

  @FR-001 @FR-009 @FR-011 @SC-001 @browser @contract
  Scenario: Reloading one tenant's settings changes only its next login destination
    Given Springfield's connection is changed to "springfield-new-idp"
    And the documented configuration reload or restart has completed
    And each tenant has a separate fresh browser context without a session
    When the visitors navigate to their respective Springfield and Shelbyville application hosts
    Then Springfield's visitor reaches the usable login experience for "springfield-new-idp"
    And Shelbyville's visitor still reaches the usable login experience for "shelbyville-idp"
    And both tenant ids and Display Names remain unchanged

  @FR-008 @SC-005 @browser
  Scenario Outline: App-owned failure guidance is understandable with assistive technology
    Given an app-owned "<failure>" prevents Springfield login initiation
    When the visitor encounters the failure using the page's accessible structure
    Then the visitor can discover and read the explanation that login cannot start
    And the visitor can understand the offered next action without relying on color or visual placement
    And the accessible content exposes no credentials or other tenant's details

    Examples:
      | failure               |
      | configuration failure |
      | provider failure      |

  @FR-008 @SC-005 @browser
  Scenario: Any offered recovery control works using only a keyboard
    Given an app-owned login failure offers an interactive recovery action
    When the visitor reaches and activates that action using only the keyboard
    Then the control has an understandable accessible name and visible focus
    And the visitor can complete the offered action without a pointer or keyboard trap
    And recovery does not grant application access while the failure remains

  @FR-007 @FR-011 @SC-003 @browser
  Scenario: Correcting configuration permits a fresh attempt
    Given Springfield previously could not initiate login because its issuer was missing
    And the developer supplies its valid issuer using the documented configuration procedure
    And the documented reload or restart has completed
    When the visitor retries the Springfield application page without an existing session
    Then the browser reaches Springfield's usable provider login experience
    And the retry does not enter an automatic redirect loop
