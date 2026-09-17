@tenant-oidc-login @US1
Feature: Tenant OIDC login entry
  Unauthenticated visitors—with no session or only an anonymous tenant-bound session—reach their tenant's provider login experience; application landing is never served without login.

  Background:
    Given isolated OIDC tenant fixtures are configured:
      | tenant      | display name | issuer                                  | client          | client auth | connection      |
      | springfield | Springfield  | https://identity.example/realms/pre-ets | springfield-web | public      | springfield-idp |
      | shelbyville | Shelbyville  | https://identity.example/realms/pre-ets | shelbyville-web | public      | shelbyville-idp |
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

  @FR-006 @SC-003 @http @contract
  Scenario: Initiation prepares a protected tenant-bound authorization-code transaction
    Given the visitor has no existing session in a fresh browser context
    When the visitor navigates to "https://springfield.pathable.com/"
    Then the redirect starts an OIDC authorization-code request using Springfield's trusted issuer, client, and connection
    And the authorization request includes a PKCE challenge while its verifier remains protected from browser-visible output
    And fresh unpredictable state and nonce correlate the attempt with the originating browser, resolved tenant "springfield", and approved return destination on "springfield.pathable.com"
    And the protected transaction context retains Springfield's expected issuer, client, connection, and correlation values for later callback validation
    And the PKCE verifier is retained only server-side
    And preparing that transaction neither completes authentication nor serves tenant application content

  @FR-006 @FR-007 @FR-008 @SC-003 @http @contract
  Scenario: Failure to establish protected transaction context prevents redirection
    Given the visitor has no existing session
    And the protected OIDC transaction context cannot be established
    When the visitor navigates to "https://springfield.pathable.com/"
    Then no provider login redirect is issued
    And the visitor receives an understandable app-owned failure explaining that login cannot start and a clear next action
    And no tenant application content or authenticated identity is granted
    And no unprotected authorization request is substituted
    And the response does not trigger an automatic redirect loop
    And the response does not include a Set-Cookie header for "pathable-session"

  @FR-005 @FR-007 @SC-003 @http @contract
  Scenario Outline: Initiation failure responses omit the pathable-session cookie
    Given the visitor has no existing session
    And Springfield initiation is forced into failure class "<failure>"
    When the visitor issues the corresponding Springfield request for that failure class
    Then the response matches failure class "<failure>"
    And the response does not include a Set-Cookie header for "pathable-session"

    Examples:
      | failure             |
      | configuration 403   |
      | login-unavailable   |
      | transaction failure |
      | non-document 401    |

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

  @FR-003 @FR-005 @SC-002 @browser @contract
  Scenario: An existing anonymous matching session still initiates login
    Given the session capability reports an existing valid session bound to "springfield"
    And that session was presented on entry and contains no authenticated user identity
    When the visitor navigates to "https://springfield.pathable.com/"
    Then login is initiated again for Springfield's configured provider connection
    And no tenant application landing page or Display Name content is served
    And no authenticated identity is established by initiation
    And session presence alone is not represented as authenticated identity
    And the response does not trigger an automatic redirect loop

  @FR-005 @FR-007 @FR-008 @SC-002 @SC-003 @http @contract
  Scenario Outline: An anonymous reusable session with invalid login configuration is refused
    Given the session capability reports an existing valid session bound to "springfield"
    And that session was presented on entry and contains no authenticated user identity
    And Springfield's login configuration has defect "<defect>"
    When the visitor navigates to "https://springfield.pathable.com/"
    Then the existing forbidden handling returns HTTP 403 without a login redirect or a new forbidden destination
    And the forbidden response uses extended copy explaining that login cannot start with a clear next action
    And that response is not the login-unavailable route
    And no tenant application landing page or Display Name content is served
    And the response does not include a Set-Cookie header for "pathable-session"

    Examples:
      | defect                                  |
      | missing issuer                          |
      | missing required server-only credential |

  @FR-005 @FR-006 @SC-002 @SC-003 @contract
  Scenario Outline: Replacement sessions preserve login entry after unusable references
    Given the visitor presents a session evaluated as "<condition>" by the existing session capability
    And that capability creates a fresh session for the validated Springfield tenant during this request
    When the visitor navigates to "https://springfield.pathable.com/"
    Then login is initiated only after Springfield is resolved through the trusted tenant boundary
    And no rejected session state or identity grants application access
    And the initiation uses only Springfield's configured login connection
    And the replacement session does not suppress the current redirect or establish authenticated identity

    Examples:
      | condition            |
      | expired              |
      | invalid              |
      | bound to shelbyville |

  @FR-005 @FR-007 @SC-003 @contract
  Scenario: A session capability refusal is not converted into login
    Given the existing session capability returns a terminal refusal or service failure instead of a ready session
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
