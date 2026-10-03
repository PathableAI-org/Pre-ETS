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

Use Copilot PR review as an initial check against repository review instructions: production ingress must block
all `/_test/*` routes and methods before forwarding, rule ordering must not permit a bypass, and application-level
environment gating must not replace ingress protection. These instructions are planned work. Copilot review is
advisory and does not establish deployed enforcement.

Before deployment, use HashiCorp Sentinel to check Terraform plans for the required blocking rules on every
production frontend ingress, including their precedence and coverage of all methods and paths under `/_test/*`.
Test the policy with compliant and deliberately noncompliant plans, including missing rules and bypassing rule
order. A passing policy establishes the checked plan's compliance, not runtime traffic behavior.

After deployment, run a dedicated Playwright API verification suite against every deployed production ingress.
Exercise `GET /_test/tenant-config` on a valid tenant host plus other routes and methods under `/_test/*`. Assert
the ingress's blocking response and absence of diagnostic configuration, supporting criteria 1 through 3. Correlate
probe requests with ingress evidence showing rejection before forwarding; a 404 alone could originate from the
application and cannot establish blocking. Include a permitted application request as a control so a generally
unreachable ingress cannot make the blocking checks pass.

The deployment process must run the Sentinel gate before applying infrastructure and mark deployment successful
only after the post-deployment ingress suite passes. Record policy and deployed-test results separately with their
revision, environment, exercised entry points, and limitations. Finite probes cover the exercised cases; policy
checks support broader route coverage. Neither application-only tests nor configuration review alone establish
executed production ingress enforcement. Tools and deployment gates described here are planned, not implemented.

### Verification evidence

No reviewed, executed evidence has been recorded. This documentation change does not establish runtime behavior.
