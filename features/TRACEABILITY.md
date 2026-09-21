# BDD Traceability Matrix

Generated: 2026-09-20

**Active specification**: `specs/004-idle-session-timeout/spec.md`\
**Scope note**: Coverage is evaluated against feature **004-idle-session-timeout**. Scenarios in prior features (001–003) are listed under [Out of scope for active feature](#out-of-scope-for-active-feature-004) rather than as product orphans.

## Coverage Summary

| Metric                                    | Count | Percentage |
| ----------------------------------------- | ----- | ---------- |
| Total requirements                        | 17    | —          |
| ✅ Covered (behavioral Gherkin)           | 13    | 76%        |
| 🛂 Release-gate / docs (not Cucumber)     | 4     | 24%        |
| ⚠️ Orphaned scenarios (idle features)     | 0     | —          |
| Out-of-scope scenarios (features 001–003) | 89    | —          |

Requirements counted: **FR-001–FR-012** and **SC-001–SC-005**. User-story acceptance scenarios are traced through the FR/SC rows (they share `@FR-*` / `@SC-*` tags on Gherkin).

**Matrix honesty**: Do not claim 100% FR/SC via Gherkin alone. REQ-011, REQ-012, REQ-013 (approval/rationale portion), and REQ-017 are D-001/D-005 governance gates covered by checklist artifacts when humans fill them — inventing `@docs` Cucumber would inflate the percentage without real evidence.

## Requirements → Scenarios

| Req ID           | Description                                                                                                                                                                                                                                  | Status | Covering Scenarios                                                                                                                                                                                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 (FR-001) | Tenant inactivity duration capped at 30 minutes; reject disablement and values above the ceiling                                                                                                                                             | ✅     | `tenant-idle-timeout-policy.feature`: Every whole minute in the permitted range is accepted; Invalid proposed settings preserve the existing choice                                                                                                                                                                                               |
| REQ-002 (FR-002) | Default 30 minutes when omitted; permit whole minutes 5–30 inclusive; reject fractional / &lt;5 / &gt;30 / disable / malformed without replacing a valid choice                                                                              | ✅     | `tenant-idle-timeout-policy.feature`: Omitted tenant choice uses the default; Every whole minute…; Invalid proposed settings…; Invalid stored configuration…                                                                                                                                                                                      |
| REQ-003 (FR-003) | Only approved authority may set policy; tenant-isolated; fixed at auth; changes apply to new sessions only; invalid explicit config fails at boundary                                                                                        | ✅     | `tenant-idle-timeout-policy.feature`: authority / cross-tenant / changes apply only to newly authenticated sessions / invalid stored config; `idle-session-expiration.feature`: Another tenant cannot change the active session's policy; `idle-session-recovery.feature`: Existing identity-provider sign-in… (new session under current policy) |
| REQ-004 (FR-004) | Authenticated access expires at idle deadline; protected ops denied independent of browser cooperation                                                                                                                                       | ✅     | `idle-session-expiration.feature`: Access ends exactly at the inactivity deadline; Browser execution cannot extend expired access; `idle-session-recovery.feature`: Resumed applications clear expired protected content…                                                                                                                         |
| REQ-005 (FR-005) | Qualifying deliberate interaction restarts idle; passive/automated does not; shared tabs share activity; independent sessions do not                                                                                                         | ✅     | `idle-session-expiration.feature`: Deliberate interaction…; Passive use and automated traffic…; Tabs sharing…; Independent sessions…; `idle-session-recovery.feature`: A second tab cannot retain expired temporary work                                                                                                                          |
| REQ-006 (FR-006) | Post-expiry activity cannot revive access; absolute lifetime preserved; deadline wins concurrent races                                                                                                                                       | ✅     | `idle-session-expiration.feature`: Activity at or after expiry…; Concurrent activity…; Idle renewal cannot extend absolute lifetime                                                                                                                                                                                                               |
| REQ-007 (FR-007) | Replacement anonymous session does not restore authenticated / protected access                                                                                                                                                              | ✅     | `idle-session-expiration.feature`: Replacement anonymous continuity does not restore authenticated access                                                                                                                                                                                                                                         |
| REQ-008 (FR-008) | Distinguish confirmed inactivity via explicit server cause; do not infer inactivity from missing/unavailable state alone                                                                                                                     | ✅     | `idle-session-expiration.feature`: Unusable authorization state fails closed…; `idle-session-recovery.feature`: Recovery does not invent an inactivity cause                                                                                                                                                                                      |
| REQ-009 (FR-009) | Running-app client revalidation discovers inactivity; clear protected UI; accessible modal with “Log in again”; client timing never authorizes access                                                                                        | ✅     | `idle-session-recovery.feature`: Expiration explains the interruption…; Keyboard users…; Assistive technology…; Resumed applications…                                                                                                                                                                                                             |
| REQ-010 (FR-010) | Login-again uses tenant journey; cancel/fail keeps access dead with retry; clear temporary data; durable records intact; multi-tab clear; IdP SSO may establish new session without restoring expired/temp data; no warning/countdown/extend | ✅     | `idle-session-recovery.feature`: Login again returns…; Existing identity-provider sign-in…; Unsuccessful login again…; Expiration explains…; A second tab…                                                                                                                                                                                        |
| REQ-011 (FR-011) | Provider MUST document justification/approval for every supported policy (including default) against client obligations; 30-minute ceiling described as product decision                                                                     | 🛂     | **Release-gate / docs** — not executable product behavior. Evidence: `specs/004-idle-session-timeout/checklists/` and D-001 policy memo when humans complete them (see `quickstart.md`)                                                                                                                                                           |
| REQ-012 (FR-012) | Acceptance evidence MUST cover listed areas; retention, tolerances, workflows, and thresholds MUST be agreed before claiming outcomes                                                                                                        | 🛂     | **Release-gate / docs** — D-005 process obligation; checklist artifacts when agreed, not Cucumber product scenarios                                                                                                                                                                                                                               |
| REQ-013 (SC-001) | Every supported duration and default have documented provider approval and rationale before release; 100% of choices respect ceiling; none disables expiration                                                                               | 🛂     | Behavioral ceiling/disable rejection is covered by policy scenarios; **documented approval / rationale** is a D-001 release-gate checklist, not Gherkin                                                                                                                                                                                           |
| REQ-014 (SC-002) | Zero protected operations using expired access succeed at/after idle deadline across agreed coverage                                                                                                                                         | ✅     | `idle-session-expiration.feature`: deadline / browser / revive / concurrent / absolute scenarios                                                                                                                                                                                                                                                  |
| REQ-015 (SC-003) | Keyboard and AT users can understand inactivity and operate login-again; zero false inactivity labels                                                                                                                                        | ✅     | `idle-session-recovery.feature`: Keyboard…; Assistive technology…; Recovery does not invent…                                                                                                                                                                                                                                                      |
| REQ-016 (SC-004) | Zero deviations from tenant-isolation, qualifying-activity, session-sharing, and policy-change rules                                                                                                                                         | ✅     | Expiration activity/isolation scenarios + `tenant-idle-timeout-policy.feature` policy-change / authority scenarios                                                                                                                                                                                                                                |
| REQ-017 (SC-005) | Every agreed representative workflow evaluated for interruption/unsaved-work loss against approved thresholds                                                                                                                                | 🛂     | Spec marks thresholds unresolved; **D-005 release-gate** when humans agree thresholds — do not invent Cucumber for missing thresholds                                                                                                                                                                                                             |

### User-story acceptance scenarios (mapped via FR tags)

| Story acceptance | Status | Primary scenarios                                                                                           |
| ---------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| US1 AS1–AS8      | ✅     | `idle-session-expiration.feature` (all scenarios)                                                           |
| US2 AS1–AS8      | ✅     | `idle-session-recovery.feature` (all scenarios; `@contract` harness + pure `@browser` Playwright partition) |
| US3 AS1–AS7      | ✅     | `tenant-idle-timeout-policy.feature` (all scenarios)                                                        |

## Orphaned Scenarios

Scenarios in idle feature files not traced to any 004 requirement:

| Feature File | Scenario Name | Notes                                                                                          |
| ------------ | ------------- | ---------------------------------------------------------------------------------------------- |
| —            | —             | None. All `idle-session-*` and `tenant-idle-timeout-policy` scenarios map to FR/SC rows above. |

## Out of scope for active feature 004

These scenarios belong to prior specifications (tenant resolution, session continuity, OIDC). They are **not** coverage gaps for 004:

| Feature file                                | Scenario count (approx.) |
| ------------------------------------------- | ------------------------ |
| `tenant-landing-page.feature`               | 10                       |
| `local-static-tenant-configuration.feature` | 6                        |
| `local-host-tenant-resolution.feature`      | 6                        |
| `session-continuity.feature`                | 9                        |
| `session-recovery.feature`                  | 6                        |
| `local-session-development.feature`         | 5                        |
| `tenant-oidc-login.feature`                 | 14                       |
| `tenant-oidc-configuration.feature`         | 9                        |
| `local-oidc-development.feature`            | 9                        |

## Suggested evidence for release-gate requirements

### REQ-011 (FR-011) / REQ-013 (SC-001): Documented policy approval

These are governance artifacts, not runtime behavior. Prefer checklist evidence over Cucumber:

- `specs/004-idle-session-timeout/checklists/` (or D-001 notes in `quickstart.md`)
- Record accountable approver and dated rationale for the default and every whole minute 5–30
- Record the 30-minute ceiling as a product decision, not a legal certification

Do **not** add `@docs` Cucumber solely to raise the coverage percentage.

### REQ-012 (FR-012) / REQ-017 (SC-005): Agreed acceptance evidence and workflow thresholds

Blocked on D-005 until humans agree protected-operation inventory, representative workflows, timing precision, interruption/data-loss thresholds, evidence retention, and evidence owner. Checklist artifacts when agreed — not invented Gherkin.

## Implementation note (execution layers)

`idle-session-recovery.feature` pure `@browser` scenarios (keyboard, AT, login-again, unsuccessful outcomes, cause-not-invented) run under `pnpm test:bdd:idle:browser` against live Next + Redis + mock IdP. Dual-tagged `@browser @contract` scenarios stay on the contract harness via `pnpm test:bdd:idle:contract`. Default `pnpm test:bdd` remains idle-free.
