@session-setup @US3
Feature: Local session development
  Developers can verify tenant sessions using a local external store.

  Background:
    Given a clean local session-development environment with documented prerequisites

  @FR-005 @FR-009 @FR-010 @SC-005 @local-services
  Scenario: Documented setup supports session creation and retrieval
    When the developer follows the documented session setup and verification instructions
    Then Compose starts Redis from an official image with a pinned version
    And Redis is published only on a loopback address
    And the host-run frontend creates and retrieves a tenant session through the configured Redis connection
    And no hosted service account is required
    And the frontend and backend remain host processes
    And the developer can stop the local service using the documented shutdown instructions

  @FR-011 @SC-001 @SC-005 @http @contract
  Scenario Outline: Local tenant modes retain session continuity
    Given local Redis and the host-run frontend are available
    And local tenant resolution uses "<mode>" with tenant "springfield"
    And the visitor already has a session established at "<url>"
    When the visitor returns to "<url>"
    Then the original session id and tenant binding are retained
    And the visitor is redirected to initiate Springfield login without tenant application content
    And the HTTP development cookie remains host-only and HttpOnly

    Examples:
      | mode             | url                                |
      | host association | http://springfield.localhost:3000/  |
      | explicit static  | http://localhost:3000/              |

  @FR-008 @SC-004 @local-services @http
  Scenario: Stopping local Redis produces the specified failure
    Given the host-run frontend is configured for local Redis
    And local Redis has been stopped
    When the visitor opens "http://springfield.localhost:3000/"
    Then the visitor receives a controlled service failure without normal tenant content
    And no successful new session cookie is issued

  @FR-008 @SC-004 @local-services @http
  Scenario: Restarting local Redis permits a retry
    Given a visitor received a service failure while local Redis was stopped
    And local Redis has restarted successfully
    When the visitor retries "http://springfield.localhost:3000/"
    Then an existing usable session is resumed or a fresh session for "springfield" is created
    And the visitor is redirected to initiate Springfield login without tenant application content

  @FR-002 @FR-011 @SC-002 @production @http
  Scenario Outline: Development settings cannot bypass production tenant restrictions
    Given the frontend runs in production with local static tenant settings supplied
    When the visitor opens "<url>"
    Then the existing access-denied outcome is returned without a redirect
    And no session is created and no session cookie is issued

    Examples:
      | url                             |
      | http://localhost:3000/           |
      | https://unknown.pathable.com/    |
