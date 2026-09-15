@session-setup @US2
Feature: Safe session recovery
  Visitors recover from unusable sessions without crossing tenant boundaries.

  Background:
    Given session setup has known tenants "springfield" and "shelbyville"
    And the external session store is available and isolated for this scenario

  @FR-003 @FR-006 @FR-007 @SC-001 @http @contract
  Scenario Outline: Unusable session references start fresh sessions
    Given the visitor presents a session reference with condition "<condition>"
    When the visitor opens "https://springfield.pathable.com/"
    Then a fresh server-generated session for "springfield" is persisted before its cookie is issued
    And no presented session id is adopted for the new record
    And no state from the unusable session is exposed or copied

    Examples:
      | condition                       |
      | missing cookie                  |
      | malformed cookie                |
      | tampered signature              |
      | expired cookie                  |
      | unknown session id              |
      | expired record with valid cookie |
      | evicted record with valid cookie |
      | record missing tenant binding   |
      | malformed stored record         |

  @FR-002 @FR-004 @SC-002 @http @contract
  Scenario Outline: Cross-tenant state cannot follow a session reference
    Given the visitor presents a signed cookie bound to "<cookie tenant>"
    And its stored record is bound to "<record tenant>"
    When the visitor opens "https://springfield.pathable.com/"
    Then a fresh session is created only for validated tenant "springfield"
    And the previous record is neither changed nor reassigned
    And no state from the previous record reaches downstream handling

    Examples:
      | cookie tenant | record tenant |
      | shelbyville   | shelbyville   |
      | springfield   | shelbyville   |
      | shelbyville   | springfield   |

  @FR-002 @FR-008 @FR-011 @SC-002 @http
  Scenario Outline: A session cannot make an invalid tenant host usable
    Given the visitor's cookie state is "<cookie>"
    When the visitor opens "<url>"
    Then the existing access-denied outcome is returned without a redirect
    And no tenant session state is accepted
    And no session is created and no session cookie is issued

    Examples:
      | cookie                       | url                                |
      | absent                       | https://pathable.com/               |
      | valid Springfield session    | https://pathable.com/               |
      | absent                       | https://unknown.pathable.com/       |
      | valid Springfield session    | https://unknown.pathable.com/       |
      | absent                       | https://a.b.pathable.com/           |
      | valid Springfield session    | https://springfield.example/        |

  @FR-002 @SC-002 @http
  Scenario: Removing a tenant denies its existing session
    Given the visitor has a valid unexpired session for "springfield"
    And "springfield" is no longer configured as a known tenant
    When the visitor opens "https://springfield.pathable.com/"
    Then the existing access-denied outcome is returned without a redirect
    And no tenant session state is accepted
    And no session is created and no session cookie is issued

  @FR-005 @FR-008 @SC-004 @http @contract
  Scenario Outline: Storage failures cannot produce successful session setup
    Given the visitor's cookie state is "<cookie>"
    And session storage will fail during "<operation>"
    When the visitor opens "https://springfield.pathable.com/"
    Then the visitor receives a controlled service failure without normal tenant content
    And no successful new session cookie is issued
    And no process-local fallback session permits tenant processing

    Examples:
      | cookie                    | operation              |
      | valid Springfield session | reading the session    |
      | absent                    | writing a new session  |
      | unknown session id        | writing a replacement  |

  @FR-008 @SC-004 @http @contract
  Scenario Outline: Retry succeeds after storage recovers
    Given the visitor previously received a controlled session-storage failure
    And storage has recovered with "<record state>"
    When the visitor retries "https://springfield.pathable.com/"
    Then session setup has outcome "<outcome>"
    And the visitor receives the existing Springfield tenant page without additional action

    Examples:
      | record state                        | outcome                      |
      | the original unexpired record intact | original session reused     |
      | no usable session record             | fresh tenant session created |
