@tenant-oidc-login @US1
Feature: Tenant OIDC login entry
  Visitors without an existing valid session reach their tenant's provider login experience automatically.

  Background:
    Given isolated OIDC tenant fixtures are configured:
      | tenant      | display name | issuer                                  | client          | connection      |
      | springfield | Springfield  | https://identity.example/realms/pre-ets | springfield-web | springfield-idp |
      | shelbyville | Shelbyville  | https://identity.example/realms/pre-ets | shelbyville-web | shelbyville-idp |
    And the existing session capability and required provider metadata are available

  @FR-003 @FR-004 @FR-006 @SC-001 @SC-005 @browser @contract
  Scenario Outline: A first visit reaches the resolved tenant's usable login page
    Given the visitor has no existing session in a fresh browser context
    When the visitor navigates to "https://<tenant>.pathable.com/"
    Then the trusted tenant boundary resolves "<tenant>" before login initiation
    And the browser reaches the usable provider login experience for "<connection>" with client "<client>"
    And the visitor can identify and operate the provider's login controls
    And no tenant chooser or tenant application content is served before the redirect
    And the initiation is bound to "<tenant>" and an approved return destination on "<tenant>.pathable.com"
    And no authenticated identity is established by initiation

    Examples:
      | tenant      | client          | connection      |
      | springfield | springfield-web | springfield-idp |
      | shelbyville | shelbyville-web | shelbyville-idp |

  @FR-004 @FR-009 @SC-001 @browser @contract
  Scenario: Overlapping visits remain isolated even with a shared issuer and Display Name
    Given both tenants have Display Name "Pre-ETS Learning"
    And each visitor has a separate fresh browser context without a session
    When the visitors concurrently navigate to the Springfield and Shelbyville application hosts
    Then each visitor reaches only their resolved tenant's usable login connection and client
    And the two initiation contexts retain their distinct tenant ids and approved return hosts

  @FR-004 @SC-002 @http
  Scenario Outline: Unrecognized hosts cannot initiate login
    Given the visitor has no existing session
    When the visitor navigates to "<url>"
    Then the application returns HTTP 403 without a login redirect
    And no tenant application content or other tenant's login configuration is exposed

    Examples:
      | url                           |
      | https://unknown.pathable.com/ |
      | https://pathable.com/         |
      | https://a.b.pathable.com/     |
      | https://springfield.example/  |

  @FR-004 @FR-006 @SC-003 @http @contract
  Scenario Outline: Caller input cannot select a different login destination
    Given the visitor has no existing session
    And caller-controlled "<source>" supplies "<value>"
    When the visitor navigates to the trusted application host "springfield.pathable.com"
    Then no initiation uses a caller-selected tenant, issuer, client, connection, or return host
    And any initiated login uses only Springfield's trusted configuration and approved return host
    And no tenant application access is granted by the supplied input

    Examples:
      | source                 | value                                |
      | tenant query value     | shelbyville                          |
      | issuer query value     | https://other-identity.example/realm |
      | client query value     | shelbyville-web                      |
      | connection query value | shelbyville-idp                      |
      | return query value     | https://other-app.example/           |
      | forwarded host header  | shelbyville.pathable.com             |
      | tenant header          | shelbyville                          |

  @FR-005 @FR-009 @SC-002 @browser @contract
  Scenario Outline: An existing matching session continues the established request flow
    Given the session capability reports an existing valid session bound to "springfield"
    And Springfield's OIDC settings are "<settings>"
    When the visitor navigates to "https://springfield.pathable.com/"
    Then this entry feature initiates no new login
    And the existing session flow continues with the Springfield landing page and its Display Name
    And session presence alone is not represented as authenticated identity

    Examples:
      | settings                       |
      | unchanged and valid            |
      | changed since session creation |
      | missing required issuer        |

  @FR-005 @FR-006 @SC-002 @SC-003 @contract
  Scenario Outline: Sessionless results from unusable references can initiate tenant-bound login
    Given the visitor presents a session evaluated as "<condition>" by the existing session capability
    And that capability's authoritative result is a sessionless request
    When the visitor navigates to "https://springfield.pathable.com/"
    Then login is initiated only after Springfield is resolved through the trusted tenant boundary
    And no rejected session state or identity grants application access
    And the initiation uses only Springfield's configured login connection

    Examples:
      | condition            |
      | expired              |
      | invalid              |
      | bound to shelbyville |

  @FR-005 @FR-007 @SC-003 @contract
  Scenario: A session capability refusal is not converted into login
    Given the existing session capability refuses the request instead of returning a sessionless result
    When the visitor navigates to "https://springfield.pathable.com/"
    Then the capability's refusal remains authoritative
    And no login is initiated and no tenant application access is granted

  @FR-003 @FR-006 @contract @http
  Scenario: Creating tenant state during initiation does not cancel the current redirect
    Given the visitor has no existing session
    And the session capability creates a tenant-bound session during login initiation
    When the visitor navigates to "https://springfield.pathable.com/"
    Then the current response still redirects to Springfield's configured login connection
    And storing the tenant id does not establish authenticated identity or complete login
    And tenant application content is not served in place of that redirect

  @FR-013 @http @contract
  Scenario Outline: Supporting requests do not enter automatic browser login
    Given the visitor has no existing session
    When the visitor's browser requests an existing "<category>" on the Springfield application host
    Then this entry feature does not redirect that request to an HTML login page
    And the request retains its category's planned handling without recursive entry redirects

    Examples:
      | category                    |
      | static asset                |
      | operational health endpoint |
      | login initiation route      |
      | authentication return route |
      | non-navigation request      |
