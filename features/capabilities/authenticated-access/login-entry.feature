@http @production @redis @mock-idp
Feature: Visitors enter their tenant's authentication flow
  Rule: Login initiation is tenant-bound and does not authenticate the visitor
    Background:
      Given production tenant sites for Springfield and Shelbyville

    @spec-003-FR-003 @spec-003-FR-004 @spec-003-FR-006
    Scenario Outline: A first visit starts a protected tenant login transaction
      When a visitor requests the document at "<tenant>.pathable.com"
      Then login starts for "<tenant>" on its own return host
      And the authorization request contains PKCE, state, and nonce without a verifier
      And application content is not served before authentication
      Examples:
        | tenant      |
        | springfield |
        | shelbyville |

    @spec-003-FR-005
    Scenario: Returning anonymous continuity still requires login
      Given a visitor previously received an anonymous Springfield session cookie
      When a visitor requests the document at "springfield.pathable.com"
      Then login starts for "springfield" on its own return host
      And application content is not served before authentication

    @spec-003-FR-007 @spec-003-FR-008
    Scenario: Invalid tenant login configuration refuses initiation
      Given Springfield's server configuration requires a missing client secret
      When a visitor requests the document at "springfield.pathable.com"
      Then the response refuses access with status 403 and no redirect
      And no session cookie or tenant content is returned

    @spec-003-FR-013
    Scenario: A non-document request does not receive a provider login page
      When a visitor requests protected data without document navigation
      Then the response refuses access with status 401 and no redirect

    @spec-002-FR-006
    Scenario: The production session cookie protects an anonymous reference
      When a visitor requests the document at "springfield.pathable.com"
      Then login starts for "springfield" on its own return host
      And the production cookie is host-only, HttpOnly, Secure, and contains only a signed anonymous reference

    @spec-002-FR-005
    Scenario: Anonymous continuity survives a frontend restart
      Given a visitor previously received an anonymous Springfield session cookie
      And the owned frontend is restarted
      When a visitor requests the document at "springfield.pathable.com"
      Then login starts for "springfield" on its own return host
      And the previous anonymous session remains usable without a replacement cookie

    @spec-002-FR-002 @spec-002-FR-008
    Scenario: A previously valid session cannot authorize an unknown host
      Given a visitor previously received an anonymous Springfield session cookie
      When a visitor requests the document at "unknown.pathable.com"
      Then the response refuses access with status 403 and no redirect
      And no session cookie or tenant content is returned

    @spec-002-FR-002
    Scenario: Removing a tenant denies its existing session
      Given a visitor previously received an anonymous Springfield session cookie
      And Springfield is removed from configuration and the frontend restarts
      When a visitor requests the document at "springfield.pathable.com"
      Then the response refuses access with status 403 and no redirect
      And no session cookie or tenant content is returned
