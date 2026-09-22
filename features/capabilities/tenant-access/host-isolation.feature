@http @production @redis @mock-idp
Feature: Tenant addresses isolate organizations
  Rule: Only a recognized tenant address can begin authentication
    Background:
      Given production tenant sites for Springfield and Shelbyville

    @spec-001-FR-002 @spec-001-FR-003 @spec-003-FR-004
    Scenario Outline: Unknown and disallowed hosts cannot initiate login
      When a visitor requests the document at "<host>"
      Then the response refuses access with status 403 and no redirect
      And no session cookie or tenant content is returned
      Examples:
        | host                              |
        | pathable.com                      |
        | www.pathable.com                  |
        | a.b.pathable.com                  |
        | unknown.pathable.com              |
        | springfield.example.com           |
        | springfield.pathable.com.evil.test |
        | localhost                         |

    @spec-001-FR-004 @spec-003-FR-009
    Scenario: Caller suggestions cannot replace the host-selected tenant
      Given caller headers and query parameters suggest Shelbyville
      When a visitor requests the document at "springfield.pathable.com"
      Then login starts for "springfield" on its own return host
      And application content is not served before authentication

    @spec-005-FR-008 @spec-001-FR-008
    Scenario Outline: Development settings cannot override production host selection
      Given static development settings select Shelbyville
      When a visitor requests the document at "<host>"
      Then the production selection is "<selection>"
      Examples:
        | host                     | selection   |
        | springfield.pathable.com | springfield |
        | unknown.pathable.com     | refused     |
        | localhost                | refused     |
