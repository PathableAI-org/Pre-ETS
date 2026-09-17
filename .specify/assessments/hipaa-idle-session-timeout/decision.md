# Decision: HIPAA-Aware Idle Session Timeout

- **Slug**: hipaa-idle-session-timeout
- **Decided**: 2026-09-17
- **Verdict**: go
- **Artifacts reviewed**: [intake.md](./intake.md), [research.md](./research.md), [problem.md](./problem.md), [concept.md](./concept.md)
- **Gate scope**: Proceed to specification. This does not establish implementation readiness, approve a delivery budget, or certify compliance.

## Scorecard

| Criterion              | Rating   | Justification                                                                                                                                                                                                                                                                                                          |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Problem validity       | strong   | The provider explicitly owns software-behavior compliance for covered-entity clients, and the researched baseline does not establish authenticated inactivity expiration or recovery. See intake ownership clarification and research Prior Art.                                                                       |
| Evidence strength      | adequate | Research cites regulatory text and primary security/platform guidance, inspects existing session behavior, and distinguishes evidence from assumptions. Client contracts, user workflow observations, and runtime validation remain missing.                                                                           |
| Value vs. inaction     | adequate | Addressing the documented gap enables evidence of inactivity protection and understandable recovery; doing nothing leaves these outcomes unestablished. No quantified incident reduction or financial return is claimed. See problem Cost of Inaction.                                                                 |
| Feasibility / appetite | unknown  | Option B is bounded and supported by existing session infrastructure, but authentication readiness, staffing, and budget acceptance are unverified. The proposed medium appetite is not an estimate or commitment. See concept assumptions 3 and 7.                                                                    |
| Strategic fit          | strong   | The selected concept directly serves the user's stated goal of HIPAA-aware behavior from the start, with provider ownership and tenant flexibility. This rating is based on confirmed project goals, not an independent constitution review.                                                                           |
| Risk posture           | adequate | The concept addresses browser-only enforcement risk through authoritative expiration and limits tenant choices to the selected ceiling. Authentication scope, policy justification, and workflow impacts remain explicit dependencies to resolve in specification; implemented mitigations have not been demonstrated. |

## Verdict & Rationale

**Go: the idea is worth specifying.** Problem validity is strong, evidence strength is adequate, and Option B has both a shaped concept and an explicit user selection. The user-selected direction is a **maximum idle timeout of 30 minutes**, with tenants permitted to choose a shorter timeout. The requested experience remains an accessible modal explaining that inactivity ended the session, with a button to log in again. These decisions supersede the earlier open questions about concept choice and maximum duration.

The remaining uncertainty concerns the precise policy, acceptance boundaries, and dependency sequencing rather than whether the problem merits a specification. A specification can make those decisions and dependencies explicit without claiming that current anonymous session expiry already terminates authenticated access. Default, minimum, and increments must not be inferred from the selected maximum.

The unknown feasibility/appetite score is material: this gate makes no promise that the work fits within weeks or that authentication is already available. If defining the required protected-access and recovery behavior expands this into building a general authentication system, revisit shaping and budget rather than silently expanding the feature. Similarly, evidence that the selected ceiling is inappropriate for supported workflows or obligations requires revisiting policy before implementation.

Research did not establish a universal numeric HIPAA timeout range. The 30-minute ceiling is the user's product direction, with documented risk-based justification still pending. The decision relies on the dated evidence and limitations recorded in research; it does not claim a new regulatory review or establish that every shorter timeout is appropriate.

## Handoff to `$speckit-specify`

- **Problem**: The provider needs an evidenced policy and behavior that end authenticated access after inactivity while allowing legitimate tenant workflows and understandable, accessible recovery.
- **Chosen approach**: Option B — tenant choice within provider-approved bounds. Maximum idle timeout: 30 minutes. Tenants may choose shorter durations. Disabling expiration or permitting a longer timeout is outside the selected concept.
- **In scope**: Tenant-specific inactivity duration within the selected ceiling; a justified default and supported lower bounds to resolve; authoritative expiration independent of browser cooperation; accurate inactivity-expiration explanation in an accessible modal; login-again action; defined interactions with existing lifetime rules, tenant policy changes, and relevant activity/failure scenarios; evidence for the agreed outcomes.
- **Out of scope**: General authentication implementation or identity-provider replacement; overall HIPAA certification; redesign of tenancy/domain persistence; per-role, per-user, per-device, or adaptive policies; a new administration application; general autosave/draft synchronization; organization-wide sign-out. An advance-warning or extension experience is not part of the initial concept unless workflow evidence justifies revisiting scope.
- **Success metrics**: Traceable justification for every supported policy; zero successful protected operations through expired access in agreed scenarios; accurate and accessible recovery in every agreed journey; no deviations from agreed activity/policy-change rules; measured workflow interruption and unsaved-work loss against thresholds still to be agreed. These are proposed acceptance measures, not completed results.

### Carried-forward open questions

1. **Policy and accountability**: What BAA/client requirements and risk assessment justify the permitted durations, and who within the provider approves the policy? Provider organizational ownership is already confirmed.
2. **Configuration semantics**: What are the default, minimum, units/increments, authority to change a tenant's value, and effective timing of changes? The maximum is 30 minutes; a 30-minute default has not been selected.
3. **Activity and user context**: What counts as deliberate activity, including reading/entry without requests, polling, prefetch, multiple tabs, and multiple devices? Which user workflows and environments are supported initially?
4. **Authentication dependency**: Which protected access must cease, and what does login again require when an identity-provider session may remain active? Identify prerequisite authentication work separately from this feature.
5. **Lifecycle and failures**: How does inactivity interact with absolute expiration, concurrent activity, missing/evicted state, outages, clock differences, and sleep/offline recovery? A missing session must not automatically be labeled an inactivity expiration.
6. **User recovery**: What happens to already displayed PHI and unsaved work, and what accessible announcement, focus, keyboard, and login-again behavior establishes successful recovery?
7. **Validation and operational evidence**: What scenario coverage, timing tolerances, evidence retention, and acceptable interruption/data-loss thresholds prove the outcomes?
8. **Budget and sequencing**: Is the proposed medium appetite acceptable once dependencies are understood, or does the concept need to be narrowed or resequenced?
9. **Regulatory currency**: Before approving the policy, check relevant changes and effective/compliance dates beyond the September 15, 2026 regulatory issue used by research.

These questions must remain visible during specification and clarification. Decisions that determine acceptance behavior must be resolved before dependent implementation; the handoff does not select an architecture, cache strategy, data model, or API.

### Suggested specification input

Specify tenant-configurable idle-session expiration using the assessment at `.specify/assessments/hipaa-idle-session-timeout/`. Follow the user-selected Option B: a maximum inactivity timeout of 30 minutes with shorter tenant choices. End authenticated access authoritatively, explain inactivity expiration in an accessible modal, and provide a login-again action. Preserve the provider's software-compliance ownership, the scope boundaries and proposed success metrics above, and distinguish the product ceiling from its pending risk-based justification. Carry forward unresolved defaults, minimum/increments, activity semantics, authentication dependencies, recovery behavior, and policy-change rules for explicit clarification rather than inventing them.
