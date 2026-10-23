# Feature Verification Plan: Establish Distributed Application Sessions

**Feature specification**: [spec.md](spec.md)

**Delivery issue**: [#218 — Establish distributed application sessions](https://github.com/PathableAI-org/Pre-ETS/issues/218)

**Status**: Planned — no execution evidence is recorded by this document

## Authority and scope

This plan covers the S2-D construction increment authorized by issue #218 against current `origin/main` revision
`f43cbef2f426bf59cf2bade4cc2534231676b4cc`. Its accepted requirement sources are PREETS-SESSION-003 AC1–3
(session-establishment portion), PREETS-SESSION-006 AC1–2 (service/store portion), and PREETS-SESSION-008 AC2.
The reviewed originating slice is S2 at approved plan revision
`e206d165f0f30999220922f57a3f92549c15f4cc`; the live issue supplies the explicitly authorized S2-D boundary.

Evidence is limited to initial establishment/read behavior, the bounded callback reference consumer, and independent
clients of the real distributed store. It does not establish comprehensive protected-entry integration, complete
application-instance recognition, renewal/expiration races, explicit invalidation races, completed outage guarantees,
browser coordination, warning/recovery presentation, or provider-neutral freshness compatibility. Every procedure
below is planned until a later execution record identifies the exercised revision and actual observations.

## Claims and traceability

| ID | Claim to establish | Authoritative source | Meaningful violation | Required observation |
| --- | --- | --- | --- | --- |
| V-001 | A successfully validated callback establishes one application session bound to the validated user and authentication tenant and issues its host-only reference cookie. | PREETS-SESSION-003 AC1; issue #218 callback-to-session scope; Constitution Principle III | The callback succeeds but no usable session is created, the identity/tenant changes, or the cookie is scoped across hosts. | The bounded reference callback completes with one usable session whose read result matches the validated user and tenant and whose cookie has no Domain scope. |
| V-002 | Failed or rejected authentication establishes no authenticated application session or authenticated-session cookie. | PREETS-SESSION-003 AC2; issue #218 | A rejected callback leaves a usable record or cookie. | Rejected real callback outcomes leave no usable session reference or authenticated-session cookie. |
| V-003 | Initial session state includes an authoritative idle deadline derived from the effective tenant timeout and the associated effective warning policy. | PREETS-SESSION-008 AC2; issue #218 | The new session has no deadline, derives it from another policy, or loses the warning policy needed by consumers. | Reads expose the expected initial deadline and warning policy for each exercised accepted effective-policy case. |
| V-004 | Independent clients of the real distributed store read the same user, tenant, deadline, and warning policy without creator affinity. | PREETS-SESSION-006 AC1–2 service/store portion; issue #218 completion evidence | A second client cannot read the session or sees different consumer-visible state. | At least two independent clients read identical consumer-visible state from one established session. |
| V-005 | The public outcome distinguishes usable session, no usable session, and storage/service failure. | Issue #218 in-scope and completion evidence | A missing record and failed store read are indistinguishable, or failure appears usable. | Each controlled condition produces its specified distinct outcome. |
| V-006 | Absent, expired, and invalidated sessions expose no usable identity or policy; an exact cause is optional when not retained. | Issue #218 in-scope boundary | An unavailable session yields authenticated identity/policy or requires an invented tombstone contract. | Every unavailable-session case yields no usable identity/policy; cause is asserted only where the system already knows it. |
| V-007 | A storage failure during establishment or read fails closed and cannot become successful access, login, or silent session replacement. | Issue #218 in-scope boundary | A store failure issues a successful session cookie, creates a replacement, or returns usable identity. | Controlled store failure produces a service-failure result and no usable authenticated session. |
| V-008 | The cookie-facing contract is host-only and does not put provider tokens, credentials, or other secrets in browser-visible cookie content. | Issue #218 bounded contract/no-secrets scope; Constitution Principle III | Cookie scope crosses hosts or cookie content discloses a token, credential, or another secret. | The issued cookie has no Domain scope and inspected cookie content contains none of the prohibited secret values. |

## Automated behavioral evidence

| Claim IDs | Evidence boundary | Planned scenario or property | Why this boundary is meaningful | Known limits |
| --- | --- | --- | --- | --- |
| V-001, V-002, V-003 | Real provider/callback integration through the bounded reference consumer | Complete one real configured-provider callback and representative rejected callbacks; observe session/cookie creation only for success and compare initial policy/deadline with the effective tenant policy. | Establishes that trusted provider completion, callback consumption, session creation, and cookie issuance compose at the owned handoff. | Does not establish every provider, freshness clock tolerance, protected access, or application-wide callback presentation. |
| V-003 | Public session capability with accepted effective policies and a controlled clock | Exercise the accepted omitted/default, warning-disabled, and explicit valid timeout/warning combinations and compare the initial deadline and returned warning policy. | Isolates the initial-policy contract without conflating later renewal behavior. | Does not establish tenant-file validation (#215), renewal/current-policy adoption (#220), or browser warnings (#156). |
| V-004 | Real distributed-store integration with isolated keys and at least two independent clients | Establish state with client A and read with client B; compare user, tenant, deadline, and warning policy. | Exercises the real shared persistence boundary instead of a same-process map. | Does not establish independently running application-instance HTTP recognition, which belongs to #219/#154. |
| V-005, V-006 | Public session capability plus real-store integration | Observe usable, absent, expired, and invalidated states and assert that only usable state exposes identity/policy; assert a specific reason only when known. | Protects the consumer contract and fail-closed disclosure boundary. | Does not establish the later operations/races that cause expiry or invalidation (#220/#221). |
| V-005, V-007 | Real adapter with controlled connection loss or unavailable store | Exercise establishment and read while storage is unavailable and assert a distinct service-failure result with no cookie, usable identity, or replacement session. | A real transport/storage failure addresses uncertainty that a simulated missing record cannot. | Does not establish every outage mode, recovery sequence, or #221's completed outage guarantees. |
| V-001–V-007 | Requirements-backed application BDD at the bounded reference boundary | Use current-main requirement-ID tags and feature-level `@partial` to cover successful establishment, rejected authentication, independent reads, unavailable sessions, and store failure where the running reference boundary can observe them. | Gives durable stakeholder-readable application evidence for the authorized intermediate slice. | Scenario text and dry-run discovery are not execution evidence; internal service-only cases remain at their responsible boundary. |

## Agent-executable manual feature verification _(mandatory)_

### Purpose

Directly inspect the composed handoff from real browser authentication to the issued cookie and shared server-held
session state. This adds cookie-scope/content and cross-client composition observations that are not established by
service-only automated scenarios.

### Prerequisites

- A clean checkout at the exact revision under assessment.
- The repository's pinned Redis and Keycloak services running with readiness confirmed.
- The frontend/reference callback consumer running with synthetic tenant configuration, synthetic local user data,
  an owned session-key prefix, and an owned OIDC-transaction prefix.
- Playwright/browser control, HTTP response inspection, and a second independent client of the delivered public
  session capability.
- No production credentials, PHI, client data, or shared Redis keyspace.

### Procedure

1. Record the revision, environment, configured synthetic tenant alias, effective timeout/warning policy, owned key
   prefixes, and start time; confirm Redis and provider readiness.
2. In a fresh browser context, begin login and complete the real local-provider authentication through the bounded
   callback consumer.
3. Inspect the callback response and browser cookie store. Record that exactly one authenticated-session cookie was
   issued, that it is host-only (no Domain attribute), and that its value contains no provider token, credential, or
   other secret value used by the scenario.
4. Pass the issued session reference to a second independent client of the public session capability and record the
   returned user, tenant, authoritative deadline, and effective warning policy. Compare them with the validated login
   and configured policy without printing tokens, credentials, or other secrets.
5. In a separate fresh browser context, execute a rejected authentication return through the same reference boundary
   and record that no authenticated-session cookie or usable session results.
6. Remove only the scenario-owned session and OIDC-transaction keys, close browser contexts, stop processes started by
   the procedure, and record cleanup completion. Never use `FLUSHALL` against shared Redis.

### Expected observations

- The successful real callback produces one host-only cookie and one usable session whose user/tenant and
  initial policy state match the trusted callback and effective tenant policy (V-001, V-003, V-008).
- The independent client reads the same consumer-visible state without creator affinity (V-004).
- The rejected callback produces neither a usable authenticated session nor an authenticated-session cookie (V-002).

### Evidence to retain

- Exercised Git revision, date/time, environment/service versions, safe synthetic tenant/user labels, policy inputs,
  bounded actions, redacted cookie attributes/content assessment, second-client observations, rejected-flow outcome,
  cleanup result, pass/fail disposition, and explicit limitations.

## Operational observability verification

No operational observability claim is established by PREETS-SESSION-003, PREETS-SESSION-006, or
PREETS-SESSION-008 for this slice. The required distinction between no usable session and a storage/service failure is
a public behavioral outcome and is verified at that boundary. If temporary logs or traces are used to diagnose an
execution, inspect real exported data without retaining durable telemetry-output assertions, and record only safe,
non-secret observations and limitations.

## Environment and data controls

- Use only the repository's synthetic local tenant/provider fixtures and scenario-owned users, cookies, and key
  prefixes; do not use PHI or real client records.
- Keep provider credentials, tokens, callback parameters, cookie values, and session references out of committed
  artifacts and retained transcripts.
- Use pinned local Redis and Keycloak services for planned integration evidence. Local Keycloak results do not
  establish Microsoft, broker-chain, or universal provider compatibility.
- Create no second identity stack or process-memory substitute for real-store evidence.
- Clean up only owned keys and processes. Never flush a shared Redis database.
- Controlled store-failure evidence must restore the dependency afterward and record whether any later checks were
  skipped because readiness was not re-established.

## Evidence retention and reporting

Execution results must be recorded separately from this plan and identify the exact revision, environment and service
versions, safe inputs/actions, observed outcomes by claim ID, pass/fail result, cleanup, and limitations. Retained
evidence may reference scenario names and command output but must not include credentials, tokens, cookie values, PHI,
or other sensitive data. Issue closure, PR merge, generated scenarios, and dry-run discovery are not requirement
verification.

## Limitations and incomplete claims

- This feature does not establish comprehensive protected request use under PREETS-SESSION-003 AC3; #219/#154 own
  reference and application-wide consumption.
- Service/store evidence here is only the S2-D portion of PREETS-SESSION-006 AC1–2. Independently running application-
  instance recognition and later cross-instance lifecycle behavior remain outside this feature.
- Renewal/current-policy adoption, no-revival, and expiration-race guarantees remain with #220.
- Explicit invalidation operations/races and complete outage behavior remain with #221.
- Browser activity, warning, logout, recovery, and comprehensive entry-point behavior remain with #155–#158 and #154.
- Local Keycloak does not establish Microsoft or universal provider compatibility. Authentication-time comparison,
  clock tolerance, provider/broker support, and unsupported-provider behavior remain open B6/#158 gates.
- This plan does not claim executed behavior, accessibility outcomes, production ingress/deployment behavior, or
  operational monitoring coverage.

## Readiness review

- [x] Every feature claim maps to an authoritative source.
- [x] Successful, failure, rejection, security/privacy, accessibility, and operational outcomes are covered where applicable.
- [x] The manual feature procedure is non-empty, executable by an agent, and adds a distinct observation.
- [x] Environmental prerequisites, evidence retention, cleanup, and limitations are explicit.
- [x] Planned evidence is not described as executed or verified.
- [x] No implementation architecture is required to understand the feature claims.
