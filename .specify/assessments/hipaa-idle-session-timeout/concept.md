# Concept: HIPAA-Aware Idle Session Timeout

- **Slug**: hipaa-idle-session-timeout
- **Created**: 2026-09-17
- **Recommended option**: Option B — Tenant choice within provider-approved bounds
- **User-selected direction (2026-09-17)**: Option B; maximum inactivity timeout of 30 minutes, with shorter tenant-configured durations permitted. Default, minimum, and increments remain open. This selection does not approve the proposed appetite or establish regulatory sufficiency.
- **Inputs**: [Problem definition](./problem.md), [research](./research.md), [intake](./intake.md)

## Options

Appetites below are provisional budget proposals, not delivery estimates or approved commitments. No staffing, deadline, or capacity evidence has been supplied. All build options depend on resolving the authentication gap identified in research; building a general authentication capability is outside these budgets.

### Option A — One shared inactivity policy

- **Sketch**: Apply one provider-approved inactivity duration to the initially supported tenant workflows. When inactivity ends authenticated access, users see an accessible session-ended modal explaining the cause and offering a login-again action. Expired access remains unusable even when the browser is suspended or manipulated. This is the smallest functional option because it offers one consistent behavior without tenant-specific duration choices. The duration still requires a documented risk justification; no value is selected here.
- **Appetite**: **small (days)** as a proposed scope ceiling only; feasibility is unknown until authentication and policy dependencies are resolved.
- **Trade-offs**: Simplifies policy explanation and the range of behaviors to validate. It sacrifices the tenant choice explicitly requested in intake and may not suit different client workflows or contractual requirements. Accepting this option would require an explicit scope change; it is not a substitute silently made for the requested feature. [Sources: intake; research, Market & Context; problem, Goals.]
- **Rabbit holes**: Exceptions that turn the single policy into a hidden policy engine; using this slice to introduce authentication; expanding recovery into general draft preservation or identity-provider administration.

### Option B — Tenant choice within provider-approved bounds

- **Sketch**: Allow a tenant's authorized representative to choose an inactivity duration within a documented range approved by the provider, with a justified default when no tenant choice exists. When that policy expires authenticated access, users receive the requested accessible modal explaining inactivity and a button to log in again. The expiration remains authoritative regardless of browser cooperation; the visible explanation helps users recover. The provider retains responsibility for the permitted choices and software behavior. The user-selected maximum is 30 minutes, and tenants may choose shorter durations. The default, minimum, permitted increments, who may choose them, and how choices are administered remain open. Disabling expiration or choosing a longer duration would contradict the selected maximum.
- **Appetite**: **medium (weeks)** as a provisional budget proposal for one bounded inactivity-policy capability; no delivery estimate is supported yet. Reassess the budget if prerequisite authentication or materially different workflow classes must be delivered with it.
- **Trade-offs**: Preserves the requested tenant flexibility while tying supported choices to the provider's responsibility. It expands the policy and validation burden compared with Option A: defaults, permitted choices, policy changes, and concurrent user contexts must have consistent outcomes. The research supports risk-based bounds, not a universal numerical “HIPAA-legal range.” Tenant demand beyond the stakeholder request and the usability of candidate durations remain unmeasured. [Sources: intake, ownership clarification; research, Regulatory findings and Evidence Against the Idea.]
- **Rabbit holes**: Per-user, per-role, per-device, or per-workflow overrides; arbitrary tenant exceptions; a new administration application; organization-wide identity-provider logout; adaptive risk scoring; guaranteed preservation of every unfinished workflow.

### Option C — Defer product behavior until policy and authentication are ready

- **Sketch**: Make no inactivity-behavior change now. Clarify client obligations, acceptable inactivity policy, and the prerequisite authentication experience before returning to the feature. Existing anonymous-session behavior remains the researched baseline, with no claim that it proves inactivity protection for authenticated PHI access. This is a sequencing alternative, not an assertion that doing nothing is safe for PHI use.
- **Appetite**: **small (days)** as a proposed budget for dependency and policy clarification only; subsequent delivery is unbudgeted. Availability of decision-makers and client documents is unknown.
- **Trade-offs**: Avoids committing to unsupported policy values or pretending anonymous expiration is authenticated logout. It delivers none of the requested tenant behavior or user recovery and leaves the problem definition's success measures unmet. Its acceptability depends on deployment exposure and timing, neither of which research established. [Sources: research, Prior Art; problem, Cost of Inaction.]
- **Rabbit holes**: Indefinite policy discovery, a broad HIPAA compliance program, or an identity-platform selection exercise. No purchased alternative was evaluated in research, so none is presented as a proven replacement.

## Recommendation

The user selected **Option B — Tenant choice within provider-approved bounds** on 2026-09-17, with a maximum inactivity timeout of **30 minutes** and shorter tenant choices. This is the selected product direction, subject to documenting its risk-based justification and resolving the assumptions below before implementation. The formal assessment decision remains a separate next step. It best preserves the stakeholder's requested tenant configuration and session-ended/login-again experience while keeping software-compliance ownership with the provider. Option A is smaller but drops an explicit part of the request; Option C is a fallback if dependencies prevent responsible specification, rather than a completed response to the problem.

The concept connects directly to the proposed success measures in [problem.md](./problem.md): supported choices have a traceable justification; expired access cannot continue; users can understand and recover accessibly; and policy behavior stays consistent across the agreed activity and failure scenarios. Usability must still be evaluated against representative workflows. Those are intended outcomes, not verified capabilities or accepted numerical thresholds.

The concept boundary includes authoritative expiration and the browser-visible experience. Research supports server-side enforcement as a security constraint, but this assessment does not select cache operations, record structures, request flows, or an activity-tracking mechanism. A modal alone does not establish access termination, and a missing anonymous session does not establish an inactivity logout. [Source: research, Browser and server evidence.]

## Out of Scope (for the recommended option)

- Overall HIPAA certification or a general compliance program.
- Building a general authentication system, replacing identity providers, or redesigning tenancy and domain persistence; necessary expiration and reauthentication behavior remains a prerequisite to define.
- Per-user, per-role, per-device, or adaptive timeout policies and unrestricted tenant exceptions. Disabling expiration or permitting a duration above 30 minutes is outside the selected direction.
- A new self-service administration application. The ability to establish an authorized tenant choice is in scope; its administrative delivery surface is not selected here.
- General-purpose autosave, draft synchronization, or guaranteed recovery of all unsaved work. Safe treatment of displayed PHI and a clearly defined consequence for unsaved work remain required scope questions.
- Advance-warning/countdown or session-extension experiences in the initial concept. These are optional scope proposals, not rejected requirements; revisit if workflow evidence shows they are necessary for the agreed outcomes.
- Redesigning absolute session lifetime or organization-wide sign-out. Consistent interaction with existing lifetime rules and the required login-again behavior must still be defined.
- Detailed architecture, data models, APIs, implementation tasks, and selection of the still-unresolved default, minimum, and increments at this stage.

## Assumptions to Validate

1. **Policy justification is obtainable**: The provider can identify an accountable approver and obtain applicable BAA/client requirements and a risk assessment sufficient to justify defaults and permitted choices. Ownership and the 30-minute maximum with shorter tenant choices are confirmed; their documented risk-based justification and the accountable approver remain unresolved.
2. **A bounded tenant range is adequate**: Initial tenant workflows can be served by one shared interpretation of inactivity with a configurable duration no greater than 30 minutes, without per-role or per-device exceptions. This is an unverified simplification.
3. **Authentication dependencies can be resolved separately**: The platform can define what protected access expires and what login again requires without absorbing a general authentication implementation into this feature. Existing anonymous sessions do not prove this assumption.
4. **Activity can be defined consistently**: Deliberate use, long reading/entry periods, background traffic, multiple tabs/devices, and policy changes can have understandable rules. Specification must resolve those rules and their interaction with absolute expiration and failure cases.
5. **Authorized tenant choice has a workable delivery path**: A tenant can select a permitted value through an appropriate administrative process without requiring a new management application. The process and authority are unverified.
6. **The requested recovery experience is sufficient**: A session-ended modal and login-again action can meet accessible recovery needs with acceptable handling of displayed PHI and unsaved work. Warning requirements and acceptable interruption/data-loss thresholds remain to be established.
7. **The proposed budget is acceptable**: The user has not approved a medium appetite. Staffing, sequencing, and dependency readiness may require changing it before commitment.
8. **Evidence can establish the outcomes**: Agreed acceptance coverage and timing tolerances can demonstrate expired-access rejection, accurate cause reporting, accessible recovery, and policy consistency. Existing research did not run those checks.
9. **The regulatory basis remains applicable at approval**: The research's September 15, 2026 regulatory snapshot must be checked against relevant later changes when approving the policy; no numerical legal range or universal duration is assumed.

These assumptions carry forward the nine open questions in the problem definition. The user selection resolves the concept choice and maximum duration, but does not resolve the remaining questions or constitute a completed formal assessment gate.
