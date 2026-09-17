# Problem Definition: HIPAA-Aware Idle Session Timeout

- **Slug**: hipaa-idle-session-timeout
- **Created**: 2026-09-17
- **Inputs used**: [intake.md](./intake.md), [research.md](./research.md), user ownership clarification

## Problem Statement

For users accessing PHI on behalf of covered-entity clients, the platform has no established, evidenced policy for when inactivity must end authenticated access or how users understand and recover from that interruption. As the provider prepares to operate under BAAs and owns compliance for software behavior, this gap prevents it from demonstrating appropriate protection against unattended access while accommodating legitimate tenant workflows. [Sources: intake, Origin & Context; research, Prior Art and Data & Constraints. Unattended exposure is a risk scenario, not a documented incident.]

## Affected Users & Stakeholders

- **Users accessing PHI in client workflows**: Need unattended access to end appropriately and need to understand when and why access has ended, including how to regain authorized access. Specific roles, devices, and workflows remain unverified. [Sources: intake, Idea; research, Users & Demand.]
- **Covered-entity clients**: Need platform behavior compatible with their obligations and operating context. Client-specific contractual requirements have not been supplied. [Sources: intake, ownership clarification; research, Users & Demand.]
- **Platform provider**: Owns compliance for software behavior and needs defensible policy and evidence that behavior conforms to it. This organizational ownership is confirmed; the individual decision-maker remains unidentified. [Sources: intake, ownership clarification; research, Regulatory findings.]

## Goals

- Establish a documented, risk-justified inactivity policy that accounts for applicable obligations and tenant contexts without treating a presumed universal legal duration as an established fact. [Source: research, Regulatory findings.]
- Ensure that authenticated access ends when the applicable inactivity policy requires, regardless of whether the user's browser is actively running or cooperating. [Source: research, Browser and server evidence.]
- Let users accurately understand that inactivity ended their access and regain access through the required authentication process, including users relying on keyboard or assistive technology. [Sources: intake, requested experience; research, Gaps & Open Questions.]
- Accommodate legitimate tenant workflows within the provider's compliance responsibility, with explicit treatment of inactivity, ongoing work, and policy changes. [Sources: intake, tenant flexibility; research, Market & Context and Gaps & Open Questions.]
- Produce reviewable evidence of both protection and usable recovery rather than equating anonymous session expiration with authenticated logout. [Source: research, Prior Art and Evidence Against the Idea.]

## Non-Goals

- Establishing or certifying the platform's overall HIPAA compliance; this assessment addresses inactivity-related access behavior only. [Scope boundary derived from intake.]
- Selecting a timeout duration, technical enforcement mechanism, user-interface design, or implementation plan at this definition stage. The requested modal and tenant setting remain recorded in intake for later shaping. [Assessment-stage boundary.]
- Designing a general authentication system or redesigning tenant resolution, domain persistence, and unrelated session infrastructure. The authentication behavior needed for expiration and recovery remains a dependency to clarify. [Scope boundary grounded in research, Prior Art.]
- Claiming protection against every form of PHI disclosure or continuous malicious activity; the problem concerns inactivity-related exposure. [Scope boundary grounded in research, Browser and server evidence.]

## Success Metrics

The following are proposed acceptance measures derived from the goals, not observed results or approved policy values. The subsequent user clarification selected a 30-minute maximum with shorter tenant choices (see intake and concept). Default, minimum, increments, timing tolerances, workflow coverage, and usability thresholds remain to be established before specification is complete.

- **Policy justification coverage**: Every supported tenant inactivity policy has a documented rationale and traceability to the applicable risk assessment and contractual requirements. Proposed target: 100% coverage. **Baseline**: No such policy evidence was identified in the assessment inputs; organizational documentation outside the repository is unknown. [Sources: research, Regulatory findings; intake.]
- **Expired-access rejection**: Zero successful protected operations using access that has expired under the agreed inactivity policy across the agreed acceptance scenarios, including inactive or suspended browsers. **Baseline**: Not measured; the researched session behavior is anonymous and does not establish this capability. [Source: research, Prior Art and Browser and server evidence.]
- **Accurate, accessible recovery**: In every agreed inactivity-expiration journey, users can identify the cause and complete the required path to regain authorized access, including keyboard and assistive-technology journeys; unrelated session failures are not mislabeled as inactivity. **Baseline**: No evaluated recovery journey in the supplied evidence. [Sources: intake; research, Browser and server evidence and Gaps & Open Questions.]
- **Policy consistency**: Zero deviations from the agreed inactivity and policy-change rules in the agreed multi-tab, multi-device, background-activity, and failure scenarios. **Baseline**: Not measured; those behavioral rules are unresolved. [Source: research, Gaps & Open Questions.]
- **Workflow impact**: Measure unintended interruption and unsaved-work loss during representative legitimate workflows. **Baseline**: Unknown. [NEEDS CLARIFICATION: Establish representative workflows and acceptable interruption/data-loss thresholds before claiming success.] [Source: research, Market & Context and Evidence Against the Idea.]

## Cost of Inaction

The researched baseline offers fixed-lifetime anonymous session continuity, but does not establish inactivity-based termination of authenticated access or a usable recovery experience. Without resolving the policy and behavior gap, the provider would lack evidence for this aspect of its stated software-compliance responsibility when PHI workflows are introduced. [Sources: research, Prior Art; intake, ownership clarification.]

Unattended access may leave PHI exposed, while an arbitrary limit may interrupt legitimate work. These are risk and usability concerns supported by the research, not measured product incidents; no financial loss, incident rate, deployment exposure, or quantified benefit has been established. [Sources: research, Users & Demand, Market & Context, and Evidence Against the Idea.]

## Open Questions

1. [NEEDS CLARIFICATION: Which actual BAA terms and client security requirements apply, and who within the provider approves and documents the risk assessment and inactivity policy? Organizational ownership is already confirmed.]
2. [NEEDS CLARIFICATION: Which user roles, PHI workflows, devices, and environments are in scope, including periods of legitimate reading or entry without network activity?]
3. [NEEDS CLARIFICATION: What counts as user activity, and what are the expected effects of background traffic, multiple tabs, and multiple devices?]
4. [NEEDS CLARIFICATION: Given the selected 30-minute maximum and shorter tenant choices, what default, minimum, and increments are justified, who may change policy, and when do changes affect active access?]
5. [NEEDS CLARIFICATION: Which authenticated access must end, and what authentication is required to regain it, including when a separate identity-provider session remains active?]
6. [NEEDS CLARIFICATION: How should inactivity interact with overall session lifetime, simultaneous activity, lost session state, outages, and differing clocks?]
7. [NEEDS CLARIFICATION: What outcomes are required for already displayed PHI and unsaved work, and how should users receive and act on an accessible explanation of expired access?]
8. [NEEDS CLARIFICATION: What scenario coverage, timing tolerance, evidence retention, and acceptable workflow-interruption or data-loss thresholds will establish success?]
9. [NEEDS CLARIFICATION: Have regulatory changes or relevant effective/compliance dates changed since the September 15, 2026 eCFR issue verified in research, when the policy reaches approval?]
