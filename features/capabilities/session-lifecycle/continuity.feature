@application @redis
Feature: Anonymous sessions remain tenant-bound
  Rule: Session presence does not establish authenticated access
    Background:
      Given isolated application session storage

    @spec-002-FR-001 @spec-002-FR-003 @spec-002-FR-005
    Scenario: A first visit creates persisted anonymous continuity
      When application session setup handles a Springfield visit
      Then a new anonymous Springfield session is persisted with a signed cookie

    @spec-002-FR-004 @spec-002-FR-007
    Scenario: A returning visitor reuses the original lifetime
      Given a persisted anonymous Springfield session and its signed cookie
      When application session setup handles a Springfield visit
      Then the original session is reused without extending its absolute lifetime

    @spec-002-FR-003 @spec-002-FR-006 @spec-002-FR-007
    Scenario Outline: Unusable references are replaced without adopting caller state
      Given a Springfield session reference that is "<condition>"
      When application session setup handles a Springfield visit
      Then a new anonymous Springfield session is persisted with a signed cookie
      And the presented session identity is not adopted
      Examples:
        | condition           |
        | malformed           |
        | tampered            |
        | expired             |
        | missing record      |
        | malformed record    |
        | foreign cookie      |
        | foreign record      |

    @spec-002-FR-008
    Scenario: Storage failure cannot create usable continuity
      Given session writes will fail at the storage boundary
      When application session setup handles a Springfield visit
      Then session setup fails with 503 without a successful cookie
