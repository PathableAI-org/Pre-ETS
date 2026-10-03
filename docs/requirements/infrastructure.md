# Infrastructure

## PREETS-INFRA-001

**Title:** Block test-route traffic at production ingress
**Classification:** Functional Requirement
**Owner / responsible boundary:** Production infrastructure ingress
**Lifecycle:** accepted
**Verification:** unverified

### Statement

Every production ingress must block all traffic to `/_test/*` before it reaches the frontend application,
regardless of route, HTTP method, or tenant host. The ingress response must not expose diagnostic configuration.

### Rationale and sources

Infrastructure owns production isolation of application diagnostics. Application availability does not establish
that external production access is blocked.

- Source: Functional Requirement.
- Decision: Maintainer approval on 2026-10-03 authorizes this replacement, preserving the approved behavior from
  2026-10-02 and 2026-10-03 except for the explicitly revised request scope and static selector clarification.

### Acceptance criteria

1. `GET /_test/tenant-config` on a valid configured tenant host is blocked through every production ingress.
2. Other routes and HTTP methods under `/_test/*` are also blocked before reaching the application.
3. Blocking responses do not expose tenant configuration, and application availability of diagnostics does not
   bypass ingress protection.

### Design constraints

- Production ingress rules block the entire `/_test/*` prefix; application-level environment gating is not the control.

### Open questions

None.

### Related requirements

- Replaces the ingress obligation in [PREETS-TENANT-002](tenant-resolution.md#preets-tenant-002).
- Protects [PREETS-TENANT-006](tenant-resolution.md#preets-tenant-006).

### Verification plan

Exercise every deployed production ingress with the diagnostic route on a valid tenant host plus other routes
and methods under `/_test/*`. Observe blocking and ingress/application evidence that requests do not reach the
frontend. Application-only tests and configuration review alone cannot establish executed ingress enforcement.

### Verification evidence

No reviewed, executed evidence has been recorded. This documentation change does not establish runtime behavior.
