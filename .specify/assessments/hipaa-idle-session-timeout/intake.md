# Idea Intake: HIPAA-Aware Idle Session Timeout

- **Slug**: hipaa-idle-session-timeout
- **Created**: 2026-09-17
- **Source**: Pasted text from the user in the Pre-ETS project conversation
- **Type**: compliance

## Idea (as captured)

> Our platform overlaps with PHI enough that it needs to be HIPAA aware from the start. HIPAA requires a session timeout when the user is idle. We need to research how long that is allowed to be from a regulator perspective and add a tenant configuration value that allows a tenant to set a timeout length within the legal range. When the user times out, they should see a modal that tells them their session has ended for inactivity and has a button to let them login again. We need to investigate whether the browser is enough to track this or whether this also should be enforced in the session store in the cache on the server side.

Ownership clarification from the user on 2026-09-17:

> I can clarify the ownership. We are will have our a BAA with our clients who are covered entities. Compliance with regard to software behavior is our obligation

## Restated

Investigate the regulatory requirements for inactivity-related session expiration and propose a tenant-configurable idle timeout whose permitted values reflect the findings. The requested experience is a modal explaining that the session ended for inactivity, with a button to log in again; the assessment must investigate browser tracking and server-side enforcement through the cached session store.

## Origin & Context

- **Raised by**: The user in the Pre-ETS project conversation.
- **Trigger**: The user reports that the platform overlaps with protected health information (PHI) and wants HIPAA awareness from the start.
- **Assessment identity**: The user confirmed the slug `hipaa-idle-session-timeout`.
- **Regulatory premise**: The statements about HIPAA requiring idle timeout and a legal range are captured stakeholder premises, not verified regulatory findings. This intake makes no determination of applicable requirements or allowed durations.
- **Client relationship**: The user states that clients are covered entities and that the platform provider will have business associate agreements (BAAs) with them.
- **Ownership**: The platform provider owns compliance with regard to software behavior, as clarified by the user. Tenant-configurable timeout behavior must be assessed within that responsibility.

## First-Glance Unknowns

- [NEEDS CLARIFICATION: Which specific HIPAA and BAA obligations govern the platform's software behavior and PHI handling in its stated relationship with covered-entity clients?]
- [NEEDS CLARIFICATION: What do current authoritative regulatory sources require for automatic logoff or inactivity timeout, and do they prescribe numerical minimum or maximum durations or require a context-dependent determination?]
- [NEEDS CLARIFICATION: If no universal legal duration range exists, what evidence and approval process should establish the platform's permitted tenant settings?]
- [NEEDS CLARIFICATION: What timeout units, default, permitted bounds, and configuration permissions are appropriate, and may a tenant disable the timeout?]
- [NEEDS CLARIFICATION: What counts as user activity, and how should background requests, multiple tabs, multiple devices, sleeping devices, and offline use affect inactivity tracking?]
- [NEEDS CLARIFICATION: Is browser-only tracking sufficient for the applicable requirements and threat model, or must inactivity expiration also be enforced server-side through the cached session store?]
- [NEEDS CLARIFICATION: How does idle expiration relate to the existing session lifecycle, authentication state, cache expiration, and any absolute session lifetime?]
- [NEEDS CLARIFICATION: What access and session state must end at timeout, and what should happen to already displayed PHI and unsaved work?]
- [NEEDS CLARIFICATION: How should the session-ended modal appear and behave accessibly, including focus, keyboard interaction, and the login-again destination?]
- [NEEDS CLARIFICATION: How should timeout-policy changes affect active sessions, and what evidence or audit records are needed to demonstrate enforcement?]

## Product Direction Clarification — 2026-09-17

> Yeah Option B is what we want to go with. I think we want a maximum timeout of 30 min and allow the tenant to configure a timeout shorter than that if they want.

The user selected Option B: tenant-configurable inactivity timeout with a maximum of 30 minutes and shorter tenant choices. This is a product policy direction; its risk-based justification remains pending. The default, minimum, and permitted increments are not yet selected. Earlier unknowns about the maximum and whether tenants may choose shorter durations are resolved by this clarification.
