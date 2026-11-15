@preets-session-005
Feature: Independent request tenant and session binding
  Every scenario starts from a session established through real sign-in with the tracked
  local provider for Springfield, which the visitor then presents to protected requests.
  The request tenant is resolved independently of the session, from the Host or from a
  static selection. When it equals the session's tenant the protected application is
  admitted; when it differs, the application entry page, its application request, a
  protected route handler, and the protected action are each forbidden with HTTP 403 and
  no protected content or operation, and the browser shows the forbidden page. Under
  static resolution the selected tenant decides the outcome even where the Host names
  another tenant, so the comparison uses the resolved tenant rather than the Host. The
  entries represent each kind of protected request rather than an inventory, and whether
  the forbidden page is rendered directly or reached through navigation is not asserted,
  as the requirement leaves it open.

  Background:
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    And the visitor completes real provider sign-in across two application instances at "springfield.localhost:3000"
    And the visitor presents the established session in later requests

  Scenario: The session's own tenant admits it
    When a visitor sends "GET" to "/" at "springfield.localhost:3000" as a "document" request
    Then the response shows the protected application

  Scenario Outline: Another tenant forbids the session with HTTP 403
    When a visitor sends "GET" to "<path>" at "shelbyville.localhost:3000" as a "<kind>" request
    Then the response status is 403
    And the response contains no protected application content

    Examples:
      | path            | kind        |
      | /               | document    |
      | /               | application |
      | /session/status | application |

  Scenario: Another tenant forbids the session's protected action without performing it
    When a visitor invokes the protected reference action at "shelbyville.localhost:3000"
    Then the response status is 403
    And the response issues no reference-operation receipt

  Scenario: The browser shows the forbidden page when another tenant forbids the session
    Then browser navigation to "/" at "shelbyville.localhost:3000" presents the forbidden page

  Scenario: A static selection of another tenant forbids the session at its own tenant's Host
    When the application restarts with static resolution selecting "shelbyville"
    And a visitor sends "GET" to "/" at "springfield.localhost:3000" as a "document" request
    Then the response status is 403
    And the response contains no protected application content

  Scenario: A static selection of the session's tenant admits it at another tenant's Host
    When the application restarts with static resolution selecting "springfield"
    And a visitor sends "GET" to "/" at "shelbyville.localhost:3000" as a "document" request
    Then the response shows the protected application
