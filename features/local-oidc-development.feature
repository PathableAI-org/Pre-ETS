@tenant-oidc-login @US3
Feature: Local tenant OIDC development
  Developers reproduce tenant login entry with local Keycloak and synthetic tenant settings.

  Background:
    Given an isolated local OIDC development environment with documented prerequisites
    And the existing session service is available
    And local credentials are supplied by the developer outside committed fixtures

  @FR-010 @FR-011 @FR-012 @SC-004 @local-services @browser
  Scenario: Documented setup reaches two local tenant login experiences
    Given the local provider starts from a clean state
    When the developer follows the documented provider startup, readiness, and synthetic tenant provisioning instructions
    Then Keycloak runs from a pinned image with published services bound only to loopback
    And the existing session service is preserved and remains available
    And frontend and backend development processes remain on the host
    And fresh browser visits to "http://springfield.localhost:3000/" and "http://shelbyville.localhost:3000/" reach their distinct usable login experiences
    And no production account, production secret, or real client record is required

  @FR-006 @FR-011 @FR-012 @SC-004 @local-services @browser @contract
  Scenario Outline: Browser and host application share a reachable issuer identity
    Given local Keycloak is ready with a registered client for "<tenant>"
    And the documented issuer identity is configured for both browser and host application access
    And the visitor has no existing session
    When the visitor navigates to "<url>"
    Then both the browser and host-run application can reach the same configured issuer identity
    And the browser reaches the usable login experience for "<tenant>"
    And the initiation's approved return destination is registered on "<host>"

    Examples:
      | tenant      | url                                | host                       |
      | springfield | http://springfield.localhost:3000/ | springfield.localhost:3000 |
      | shelbyville | http://shelbyville.localhost:3000/ | shelbyville.localhost:3000 |

  @FR-003 @FR-012 @SC-004 @browser
  Scenario: Explicit static development mode supports local login
    Given local Keycloak is ready
    And explicit static tenant mode on bare localhost supplies valid Springfield OIDC settings
    And the visitor has no existing session
    When the visitor navigates to "http://localhost:3000/"
    Then the browser reaches Springfield's usable local login connection
    And the approved return destination uses "localhost:3000"

  @FR-007 @FR-012 @SC-003 @browser
  Scenario: Display Name-only static settings cannot bypass login
    Given local Keycloak is ready
    And explicit static tenant mode on bare localhost supplies Springfield's Display Name without OIDC settings
    And the visitor has no existing session
    When the visitor navigates to "http://localhost:3000/"
    Then the existing forbidden handling returns HTTP 403 without a login redirect or a new forbidden destination
    And the visitor receives an understandable configuration error with a clear next action
    And no login is initiated and no tenant application access is granted

  @FR-004 @FR-012 @SC-002 @http
  Scenario Outline: Host-associated local mode preserves tenant refusals
    Given local Keycloak is ready
    And local tenant resolution uses host association
    And the visitor has no existing session
    When the visitor navigates to "<url>"
    Then the application returns HTTP 403 without a login redirect
    And no tenant application access is granted

    Examples:
      | url                            |
      | http://unknown.localhost:3000/ |
      | http://localhost:3000/         |

  @FR-004 @FR-012 @SC-002 @production @http
  Scenario Outline: Local settings cannot bypass production host binding
    Given the frontend runs in production with static Springfield OIDC settings supplied
    And the visitor has no existing session
    When the visitor navigates to "<url>"
    Then the application returns HTTP 403 without a login redirect
    And local static configuration does not grant tenant application access

    Examples:
      | url                           |
      | http://localhost:3000/        |
      | https://unknown.pathable.com/ |

  @FR-007 @FR-008 @FR-011 @SC-004 @local-services @browser
  Scenario: A stopped provider prevents initiation when metadata is required
    Given local Keycloak has stopped and required metadata is unavailable to the application
    And the visitor has no existing session
    When the visitor navigates to "http://springfield.localhost:3000/"
    Then an app-owned provider failure explains that login cannot start and provides a clear next action
    And no tenant application access or automatic redirect loop occurs

  @FR-007 @FR-011 @SC-004 @local-services @browser
  Scenario: Provider failure after redirection leaves the browser at an unreachable destination
    Given the application has the valid provider metadata needed to initiate login
    And local Keycloak becomes unreachable before the browser reaches its login page
    And the visitor has no existing session
    When the visitor navigates to "http://springfield.localhost:3000/"
    Then the browser reports the provider destination as unreachable after redirection
    And no tenant application access or automatic redirect loop occurs

  @FR-011 @SC-004 @local-services @browser
  Scenario: Documented provider recovery permits a fresh login attempt
    Given a previous sessionless visit failed because local Keycloak was stopped
    And the developer has followed the documented provider recovery and readiness instructions
    And the visitor starts a fresh browser context without an existing session
    When the visitor navigates to "http://springfield.localhost:3000/"
    Then the browser reaches Springfield's usable local provider login experience
    And the request does not enter an automatic redirect loop
