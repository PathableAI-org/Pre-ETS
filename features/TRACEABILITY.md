# BDD Traceability Matrix

Generated: 2026-09-17

Active specification: `specs/003-tenant-oidc-login/spec.md` (feature directory from `.specify/feature.json`).

Scope note: Requirements are taken only from **003-tenant-oidc-login**. Feature files under `features/` include prior 001/002 scenarios; those that do not assert 003 outcomes are listed as **orphaned relative to this spec** (they remain owned by earlier specs).

## Coverage Summary

| Metric             | Count | Percentage |
| ------------------ | ----- | ---------- |
| Total requirements | 22    | —          |
| Covered            | 21    | 95%        |
| Uncovered          | 1     | 5%         |
| Orphaned scenarios | 41    | —          |

## Requirements → Scenarios

| Req ID  | Description                                                                                                                                                        | Status    | Covering Scenarios                                                                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 | US1: Unauthenticated visitor reaches that tenant's provider login; no landing without auth                                                                         | Covered   | `tenant-oidc-login.feature`: A first visit reaches the resolved tenant's usable login page; An existing anonymous matching session still initiates login                                                                                |
| REQ-002 | US2: OIDC settings supplied via tenant config; fail safely when unusable                                                                                           | Covered   | `tenant-oidc-configuration.feature`: Required connection selection…; Detectable configuration defects…; Required client credentials remain server-only                                                                                  |
| REQ-003 | US3: Local Compose Keycloak demo for two synthetic tenants                                                                                                         | Covered   | `local-oidc-development.feature`: Documented setup reaches two local tenant login experiences; Explicit static development mode supports local login                                                                                    |
| REQ-004 | FR-001: Tenant config retains Display Name and required OIDC (`issuer`, `clientId`, `clientAuth`, connection when needed)                                          | Covered   | `tenant-oidc-configuration.feature`: Required connection selection…; Detectable configuration defects… (Display Name only…)                                                                                                             |
| REQ-005 | FR-002: Confidential credentials server-only; public needs no secret; missing confidential fails closed                                                            | Covered   | `tenant-oidc-configuration.feature`: Required client credentials remain server-only; Detectable configuration defects… (missing required server-only credential)                                                                        |
| REQ-006 | FR-003: Document `/` without auth initiates OIDC before application content (reuse or create)                                                                      | Covered   | `tenant-oidc-login.feature`: A first visit…; An existing anonymous matching session…; Creating tenant state during initiation…; also retargeted `session-continuity.feature` / `local-session-development.feature` initiate-login steps |
| REQ-007 | FR-004: Only resolved tenant config; unknown host / invalid login config → HTTP 403                                                                                | Covered   | `tenant-oidc-login.feature`: Unrecognized hosts…; Caller input cannot select…; `tenant-oidc-configuration.feature`: Detectable configuration defects…                                                                                   |
| REQ-008 | FR-005: Distinguish reuse vs create for lifecycle; neither suppresses initiation or grants landing                                                                 | Covered   | `tenant-oidc-login.feature`: An existing anonymous matching session…; Replacement sessions…; Creating tenant state…; A session capability refusal…                                                                                      |
| REQ-009 | FR-006: Auth code + PKCE, fresh state/nonce, protected tx; fail closed if tx cannot be established                                                                 | Covered   | `tenant-oidc-login.feature`: Initiation prepares a protected…; Failure to establish protected transaction…                                                                                                                              |
| REQ-010 | FR-007: Config refusal → extended HTTP 403 (not login-unavailable); metadata/tx → login-unavailable                                                                | Covered   | `tenant-oidc-configuration.feature`: Detectable configuration defects…; Unavailable required metadata…; `tenant-oidc-login.feature`: Failure to establish protected transaction…; Initiation failure responses omit pathable-session…   |
| REQ-011 | FR-008: App-owned failures understandable, a11y, keyboard next action; no secrets/cross-tenant                                                                     | Covered   | `tenant-oidc-configuration.feature`: App-owned failure guidance…; Any offered recovery control…; Detectable configuration defects…                                                                                                      |
| REQ-012 | FR-009: No cross-tenant selection; unauthenticated `/` must not SSR Display Name landing                                                                           | Covered   | `tenant-oidc-login.feature`: Overlapping visits…; An existing anonymous matching session…; `tenant-oidc-configuration.feature`: Reloading one tenant's settings…                                                                        |
| REQ-013 | FR-010: Compose includes Keycloak (pinned, loopback, host apps, preserve Redis)                                                                                    | Covered   | `local-oidc-development.feature`: Documented setup reaches two local tenant login experiences                                                                                                                                           |
| REQ-014 | FR-011: Local docs cover startup, provisioning, return URIs, reload, recovery; shared issuer                                                                       | Covered   | `local-oidc-development.feature`: Documented setup…; Browser and host application share…; Documented provider recovery…; A stopped provider…                                                                                            |
| REQ-015 | FR-012: ≥2 distinguishable local tenants + static localhost; no production accounts/secrets                                                                        | Covered   | `local-oidc-development.feature`: Documented setup…; Explicit static…; Host-associated local mode…; Local settings cannot bypass production…                                                                                            |
| REQ-016 | FR-013: Auto login only for document navigation; exclude assets, health, auth-flow routes                                                                          | Covered   | `tenant-oidc-login.feature`: Supporting requests do not enter automatic browser login                                                                                                                                                   |
| REQ-017 | SC-001: Both synthetic tenants reach intended login; zero chooser / cross-tenant                                                                                   | Covered   | `tenant-oidc-login.feature`: A first visit…; Overlapping visits…; `tenant-oidc-configuration.feature`: Reloading one tenant's settings…                                                                                                 |
| REQ-018 | SC-002: Unauthenticated document visits (incl. anonymous reuse) get no landing; invalid host/config → 403                                                          | Covered   | `tenant-oidc-login.feature`: An existing anonymous matching session…; Unrecognized hosts…; An anonymous reusable session with invalid login configuration…                                                                              |
| REQ-019 | SC-003: Config/tampering rejections block wrong destinations/access; zero credential exposure                                                                      | Covered   | `tenant-oidc-login.feature`: Caller input…; Initiation prepares…; Failure to establish…; `tenant-oidc-configuration.feature`: Detectable configuration defects…; Insecure destinations…                                                 |
| REQ-020 | SC-004: Documented local setup demos both tenants + static; stopped provider fails without loop                                                                    | Covered   | `local-oidc-development.feature`: Documented setup…; Explicit static…; A stopped provider…; Provider failure after redirection…                                                                                                         |
| REQ-021 | SC-005: App-owned failure UX usable with AT and keyboard; provider arrival = usable login controls                                                                 | Covered   | `tenant-oidc-configuration.feature`: App-owned failure guidance…; Any offered recovery control…; `tenant-oidc-login.feature`: A first visit… (operate provider login controls)                                                          |
| REQ-022 | SC-006: Reviewers can relate outcomes to evidence trail (`docs/authentication.md`, `docs/docker-compose.md`, session module) and mid-journey / P6 rollback mindset | Uncovered | None — process/documentation outcome; no Gherkin asserts evidence-trail or rollback wording                                                                                                                                             |

## Orphaned Scenarios

Scenarios not traced to any **003** requirement (prior 001/002 ownership unless noted):

| Feature File                              | Scenario Name                                                     | Notes                                                                         |
| ----------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| tenant-landing-page.feature               | A known tenant address shows its configured name                  | 001 Display Name landing; superseded for unauthenticated `/` by 003           |
| tenant-landing-page.feature               | A disallowed or unknown host is refused                           | 001                                                                           |
| tenant-landing-page.feature               | An unreadable host reaching the application is refused            | 001                                                                           |
| tenant-landing-page.feature               | Competing caller values cannot select another tenant              | 001                                                                           |
| tenant-landing-page.feature               | Overlapping visits and reloads preserve each visitor's tenant     | 001                                                                           |
| tenant-landing-page.feature               | Multiple consumers use one established tenant determination       | 001                                                                           |
| tenant-landing-page.feature               | Replacing the configuration source preserves tenant selection     | 001                                                                           |
| tenant-landing-page.feature               | Configuration failures never become a different tenant            | 001                                                                           |
| tenant-landing-page.feature               | Equal Display Names do not merge tenant identities                | 001                                                                           |
| tenant-landing-page.feature               | A known tenant requires a usable Display Name                     | 001                                                                           |
| local-static-tenant-configuration.feature | (all scenarios)                                                   | 001 static Display Name                                                       |
| local-host-tenant-resolution.feature      | (all scenarios)                                                   | 001 host resolution                                                           |
| session-continuity.feature                | Returning visitor reuses a session after tenant validation        | 002; Then steps do not assert 003 login initiation                            |
| session-continuity.feature                | Repeated access within one request shares a single session        | 002                                                                           |
| session-continuity.feature                | Production cookie protects the session reference                  | 002 (cookie shape; tangential to FR-006 cookie claims)                        |
| session-continuity.feature                | Session lifetime is fixed and shared by cookie and record         | 002                                                                           |
| session-continuity.feature                | Session is replaced at its expiry boundary                        | 002 (replacement covered for 003 via OIDC “Replacement sessions…” instead)    |
| session-continuity.feature                | Resource fetching does not establish sessions                     | 002 (related to FR-013 but asserts session omission, not login exclusion)     |
| session-recovery.feature                  | Unusable session references start fresh sessions                  | 002 (OIDC file covers replacement+login)                                      |
| session-recovery.feature                  | Cross-tenant state cannot follow a session reference              | 002                                                                           |
| session-recovery.feature                  | A session cannot make an invalid tenant host usable               | 002                                                                           |
| session-recovery.feature                  | Removing a tenant denies its existing session                     | 002                                                                           |
| session-recovery.feature                  | Storage failures cannot produce successful session setup          | 002                                                                           |
| session-recovery.feature                  | Retry succeeds after storage recovers                             | Partially retargeted initiate step; core assertions remain 002 store recovery |
| local-session-development.feature         | Documented setup supports session creation and retrieval          | 002                                                                           |
| local-session-development.feature         | Stopping local Redis produces the specified failure               | 002                                                                           |
| local-session-development.feature         | Development settings cannot bypass production tenant restrictions | 002 / overlaps FR-012 production bypass via local-oidc scenarios              |

Retargeted session scenarios that **do** map to 003 (not orphaned): “First visit establishes…”, “Session survives a frontend restart”, “Refusing cookies…”, “Local tenant modes retain session continuity”, “Restarting local Redis permits a retry” (initiate-login Then steps → REQ-006 / REQ-008).

## Suggested Scenarios for Uncovered Requirements

### REQ-022: SC-006 evidence trail and rollback mindset

```gherkin
@tenant-oidc-login @SC-006 @contract
Scenario: Acceptance docs name the initiation evidence trail and rollback boundary
  Given the local OIDC development documentation is available
  When a reviewer consults the documented evidence trail for login initiation
  Then the trail cites authentication strategy, Docker Compose Keycloak, and the session module
  And the mid-journey claim is limited to provider-page arrival without authenticated landing
  And documented rollback guidance is to revert the login-entry path while Compose services may remain
```

Note: Implementation has since added OIDC **callback completion** on the branch; that behavior is **outside** the written 003 specification (explicit non-goal / deferred). Do not treat callback/authenticated landing as covered by this matrix until the active `spec.md` is updated or a follow-on feature directory owns those requirements.
