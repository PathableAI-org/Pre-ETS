@partial
@preets-tenant-003
@preets-session-002
Feature: Tenant-selected authentication initiation
  Login preparation consumes the selected tenant in host and static modes.
  These scenarios do not establish authenticated tenant binding or all other
  tenant-dependent consumers; root's session redirect is not tenant evidence.

  Scenario: Host-mode login keeps interleaved tenant integrations distinct
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "localhost"
    When a visitor requests "/auth/login" at "springfield.localhost:3000"
    Then initiation uses the independently configured "springfield" tenant
    When a visitor requests "/auth/login" at "shelbyville.localhost:3000"
    Then initiation uses the independently configured "shelbyville" tenant
    When a visitor requests "/auth/login" at "springfield.localhost:3000"
    Then initiation uses the independently configured "springfield" tenant

  Scenario: Static-mode login uses the configured integration at its registered callback authority
    Given production tenant sites for Springfield and Shelbyville
    And static resolution selects Shelbyville
    And BASE_HOSTNAME is not configured
    When a visitor requests "/auth/login" at "shelbyville.localhost:3000"
    Then initiation uses the independently configured "shelbyville" tenant
