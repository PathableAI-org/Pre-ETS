# Feature Verification Plan: Protect Application Entry Points and Bind Tenant Authentication

**Feature specification**: [spec.md](spec.md)

**Delivery issue**: [#154 — Protect application entry points and bind tenant authentication](https://github.com/PathableAI-org/Pre-ETS/issues/154)

**Status**: Planned — no execution evidence is recorded by this document

## Authority and scope

This plan covers issue #154, delivery-plan slice S1, approved at `e206d165f0f30999220922f57a3f92549c15f4cc` with the
2026-10-17 B6 and ownership refinements present on `origin/main`. Accepted requirement text was read from
`origin/main` at `43215557c35380322d759d2918456e02c3a0c7b2`: PREETS-SESSION-001 AC1–3, PREETS-SESSION-002 AC1–3,
PREETS-SESSION-003 AC1–3, PREETS-SESSION-004 AC1–2, and PREETS-SESSION-005 AC1–4, qualified by PREETS-SESSION-013,
PREETS-SESSION-006, PREETS-SESSION-010 AC2, PREETS-TENANT-003–006, PREETS-SECURITY-001, and PREETS-INFRA-001.

Evidence may establish application-wide default protection, public exceptions, tenant binding, callback denial,
fresh-entry redirection, history protection, and — once permitted — real login and multi-instance recognition. It
may not establish provider freshness (#158), Server Action HTTP 401 recovery or the running-tab modal (#157),
cross-tab activity/logout/warning (#155/#156), production ingress blocking, or Microsoft compatibility. Success-path
claims V-007 and V-008, valid-session joining in V-014, the viewed-under-a-session precondition of V-015, and the
V-006 distinction between confirmed-fresh and unconfirmed returns (today every trusted return is denied) depend on
the B6 freshness confirmation owned by #158; until it functions,
they must be reported incomplete rather than satisfied with seeded records or fabricated confirmation.

## Claims and traceability

| ID    | Claim to establish                                                                                                                                | Authoritative source                                                               | Meaningful violation                                                                                                      | Required observation                                                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-001 | Every protected page, route handler, and Server Action, including `/`, denies protected content and effects to direct requests without a session. | SESSION-001 AC1; issue scope (direct requests)                                     | Any entry point returns protected content or performs a protected effect without a usable session.                        | For each inventoried entry point, an unauthenticated direct request yields no protected content and no effect.                                                                                                         |
| V-002 | A newly added, undesignated resource is protected by default.                                                                                     | SESSION-001 AC3; issue scope (new resources)                                       | A new page, handler, or action is reachable without a session unless someone opts it in.                                  | A temporary undesignated resource of each kind is denied without a session with no per-resource change.                                                                                                                |
| V-003 | The designated public resources are reachable without a session, no undesignated resource is public, and the diagnostic creates no session.       | SESSION-001 AC2; TENANT-006; INFRA-001                                             | A public resource is blocked, an undesignated resource is public, or the diagnostic issues a session.                     | Callback, sign-in error, `/_test/*`, recovery content, tenant login initiation, and safe assets are reachable; every other inventoried resource is protected; no session cookie or record results from the diagnostic. |
| V-004 | Publicly loadable assets contain no protected information.                                                                                        | SESSION-001 AC2                                                                    | An unauthenticated asset discloses protected content, identity, or tenant-private data.                                   | Assessment of every publicly loadable asset records no protected information.                                                                                                                                          |
| V-005 | A no-session protected page request with a resolvable tenant starts that tenant's OIDC flow with a fresh-authentication request.                  | SESSION-004 AC1; SESSION-002 AC2–3; SESSION-013 baseline                           | Protected content precedes login, another tenant's provider is used, the fresh request is omitted, or a local form shows. | The response leads to the resolved tenant's provider with the fresh-authentication request and no protected content or local credential form.                                                                          |
| V-006 | Failed, cancelled, rejected, forged, replayed, cross-tenant, and freshness-unconfirmed provider returns establish no session and explain failure. | SESSION-003 AC2; SESSION-001 AC2 (callback, sign-in error); SESSION-013 AC5        | Any such return yields a session, protected access, or an unexplained or detail-leaking failure.                          | No session is issued; protected access stays unavailable; the public sign-in error experience is shown without provider or storage details.                                                                            |
| V-007 | Successful, confirmed-fresh login establishes a session bound to the user and tenant, used by the next protected request.                         | SESSION-003 AC1, AC3; SESSION-002 AC1–3; SESSION-005 AC1                           | Login yields no session, a session for another tenant/user, or a later request that ignores the established identity.     | After real-provider login, a protected request shows the authenticated user and tenant. **Gated on #158.**                                                                                                             |
| V-008 | A session established through instance A is recognized through independently running instance B; renewal on A and expiry on B are honored.        | Issue observable increment and evidence progression; SESSION-006 AC2–3 (qualifier) | B requires affinity, reports different identity, ignores A's renewal, or serves content after B enforces expiry.          | Requests directed only to B observe A's identity; renewal through A extends access on B; expiry enforced on B ends access on A. **Gated on #158.**                                                                     |
| V-009 | A tenant mismatch is forbidden with HTTP 403 and an accessible forbidden experience at every protected entry point, without tenant substitution.  | SESSION-005 AC2–4                                                                  | A cross-tenant session gains access, receives a non-403 outcome, or the session tenant replaces the request tenant.       | HTTP 403 on pages, handlers, and the action; forbidden page for documents; no protected content or effect; request tenant unchanged.                                                                                   |
| V-010 | Request tenant resolution runs independently for every protected request, in both resolution modes.                                               | SESSION-005 AC1, AC3, AC4; TENANT-003                                              | A valid session skips or overrides tenant resolution, or binding depends on one resolution mode.                          | The same binding outcomes hold in host and static modes; a valid session never changes the selected tenant.                                                                                                            |
| V-011 | Accepted tenant 404/500 outcomes are preserved for public and protected requests.                                                                 | Issue scope; TENANT-004, TENANT-005; #118 mappings                                 | A tenant failure becomes a login redirect, 403, success, or a fallback tenant.                                            | Host-mode invalid/unknown hosts give 404; selected-configuration failures give their accepted 404/500; no fallback tenant.                                                                                             |
| V-012 | Malformed, forged, missing-record, expired, and invalidated references and session service failures fail closed without replacement sessions.     | SESSION-001 AC1; issue scope (forged context); shared-component handoff            | Any such condition grants access, performs an effect, or silently creates a session or login.                             | No protected content or effect; service failure is distinct from success and creates no replacement session.                                                                                                           |
| V-013 | The protected Server Action and browser consumer show observable side-effect denial without a domain workflow.                                    | Issue scope (protected Server Action)                                              | A denied invocation performs its effect, or denial is not observable.                                                     | An independent effect observation is unchanged after denied invocations through the consumer and directly.                                                                                                             |
| V-014 | A new tab with a valid session joins it; new-tab, refresh, and back/forward entry without a valid session start tenant OIDC directly.             | SESSION-004 AC1; SESSION-010 AC2 (qualifier)                                       | A valid session triggers a new login, or entry without one shows a session-expired page or protected content.             | Joining with no login; each fresh-entry path reaches the tenant provider, including after record removal.                                                                                                              |
| V-015 | Browser history does not restore usable protected content or actions under an expired session.                                                    | SESSION-004 AC1                                                                    | A restored page shows protected content or permits a protected action after expiry.                                       | Back/forward to a previously viewed protected page under an expired session yields no usable protected content or effect.                                                                                              |
| V-016 | Fresh entry does not replace running-tab expiration or Server Action recovery.                                                                    | SESSION-004 AC2                                                                    | Fresh-entry handling intercepts a protected Server Action or running tab with automatic OIDC.                             | A protected Server Action without a session does not start automatic OIDC. Final 401/modal composition is recorded as #157 work.                                                                                       |
| V-017 | Credentials stay server-side and out of tenant configuration and diagnostics.                                                                     | SESSION-002 AC1; SECURITY-001 AC1–2                                                | A credential or resolved secret appears in a tenant file, diagnostic response, or browser-visible response.               | Diagnostic and browser-visible responses contain only non-secret settings and lookup keys.                                                                                                                             |
| V-018 | Sign-in error, forbidden page, and protected-action consumer are keyboard-operable with visible focus and perceivable outcomes.                   | Constitution Principle IV; issue scope (forbidden presentation)                    | A control is unreachable by keyboard, focus is hidden, or an outcome cannot be perceived.                                 | Keyboard-only interaction reaches each control with visible focus and a perceivable result.                                                                                                                            |

## Automated behavioral evidence

| Claim IDs                  | Evidence boundary                                                    | Planned scenario or property                                                                                                                                                                                                                                      | Why this boundary is meaningful                                                                               | Known limits                                                                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-001, V-003, V-012        | Running application HTTP boundary over the entry-point inventory     | For every inventoried page, route handler, and Server Action, send direct requests with absent, malformed, forged, missing-record, expired, and invalidated references; assert no protected content/effect. Request each public resource and assert reachability. | Exercises the framework boundary where pages, handlers, and actions can each bypass protection independently. | A finite inventory does not prove the default for future resources; paired with V-002 and route-policy inspection.                                                                                       |
| V-002                      | Route-policy inspection plus a temporary undesignated resource probe | Inspect the route inventory (manual prerequisite) for public designations; add a temporary page, handler, and action without designation in a scratch build, request them without a session, then remove them.                                                    | Distinguishes default protection from enumerated protection.                                                  | A probe is removed after observation and is not a durable test; it shows the default mechanism at one revision.                                                                                          |
| V-003, V-017               | HTTP diagnostic and session-store observation                        | Request `GET /_test/tenant-config` without a session; assert no session cookie and no new owned session record; assert no-store and that the body contains lookup keys but no credentials.                                                                        | Directly observes the no-session-creation and secrecy obligations.                                            | Does not establish production ingress blocking or configuration-producer discipline.                                                                                                                     |
| V-005, V-006               | Real local OIDC provider and callback HTTP boundary                  | Initiate login per tenant; assert tenant-specific provider, fresh-authentication request, and no local form. Exercise failed, cancelled, crafted, replayed, cross-tenant, and freshness-unconfirmed returns; assert no session.                                   | Real provider and callback composition reveal tenant cross-wiring and session leakage a mock cannot.          | Local provider only; Microsoft/broker compatibility unexecuted. Does not decide freshness comparison or tolerance.                                                                                       |
| V-007, V-008               | Two independently running application instances, real provider/store | Log in through A; direct later requests only to B; assert identity. Renew through A, observe on B; expire on B, observe on A. **Execute only after #158 confirmation functions.**                                                                                 | Distinguishes true multi-instance application recognition from shared-client or same-process evidence.        | Gated; finite topology; does not establish every deployment arrangement.                                                                                                                                 |
| V-009, V-010, V-011        | Multi-tenant HTTP matrix in host and static modes                    | Pair a prepared tenant-A session with tenant-B requests on every entry-point kind; assert 403 and request-tenant preservation. Exercise invalid/unknown hosts and configuration failures; assert accepted 404/500 with no fallback.                               | Separates tenant-binding mismatch from tenant-resolution failure and detects substitution.                    | Prepared records are used only for denial/isolation; they do not establish login.                                                                                                                        |
| V-012                      | Controlled real-store outage after startup                           | Make the store unavailable for a read, request protected entry points and the action; assert fail-closed and no replacement session; restore readiness.                                                                                                           | A real dependency failure tests what a canned absence cannot.                                                 | Does not re-establish #221's complete outage guarantees.                                                                                                                                                 |
| V-013, V-016               | Browser-invoked protected Server Action with independent effect      | Invoke the action through its consumer and directly with no session and with a mismatched session; assert unchanged effect count and no automatic OIDC.                                                                                                           | Server Action dispatch differs from page/handler protection.                                                  | Does not establish #157's HTTP 401 recovery content.                                                                                                                                                     |
| V-014, V-015               | Browser context journeys                                             | With a valid session, open a new tab and assert joining. Expire or remove the record, then exercise new tab, refresh, and back/forward; assert tenant provider entry and no usable restored content.                                                              | Browser caching and history behave differently from direct HTTP requests.                                     | Valid-session joining and history restoration of a page viewed under a real session are gated on #158; prepared records cover only removed-record entry; expired-entry freshness verification is #158's. |
| V-001, V-005, V-009, V-014 | Requirements-backed BDD with feature-level `@partial`                | Tag scenarios with current-main `@preets-session-001`, `-002`, `-003`, `-004`, `-005` IDs only where assertions stay within those criteria; mark the feature `@partial` while #157/#158 composition remains.                                                      | Stakeholder-readable evidence through the running application.                                                | Issue-only claims (new-resource probe, service-failure vocabulary, inventory) are not BDD claims. Dry-run discovery is not execution.                                                                    |

Requirements-backed BDD scenarios must use requirement versions from current `origin/main`, carry requirement-ID
tags, and use feature-level `@partial` when the feature supplies only intermediate evidence. A dry run establishes
discovery only, not runtime behavior.

## Agent-executable manual feature verification _(mandatory)_

### Purpose

Directly observe, in a real browser and over raw HTTP, the composed default-protection boundary across the full
entry-point inventory, the experience a user sees on a cross-tenant session and on a failed sign-in, history
behavior after expiry, and public-asset content. These add rendered-experience, keyboard, history-cache, and
asset-content observations that automated status assertions do not supply. When the #158 gate is satisfied, the
procedure also observes a real login crossing from instance A to instance B.

### Prerequisites

- A clean checkout at the exact revision under assessment.
- An evidence inventory, prepared for this verification, of every page, route handler, and Server Action and of each
  explicit public designation; it is an evidence input for V-001–V-003, not a product deliverable.
- The repository's distributed session store and local OIDC provider running with readiness confirmed.
- Two independently running application instances, A and B, sharing synthetic tenant files and owned key prefixes.
- Two distinguishable synthetic tenants and a synthetic provider user; no production credentials, PHI, or client data.
- Browser automation (for example Playwright) and an HTTP client able to target A or B and replay a reference.
- A way to prepare synthetic session records for denial/isolation steps only.
- For gated steps 7b, 9, and 10: an approved, functioning B6 freshness confirmation. If absent, record those steps as
  incomplete.

### Procedure

1. Record revision, date/time, service versions, tenant aliases, instance endpoints, owned prefixes, and the B6
   freshness policy in force (or its absence). Prepare or refresh the route inventory against this revision.
2. With no session, request every inventoried protected page, route handler, and Server Action on instance A over raw
   HTTP. Record status, redirect destination, and whether any protected content or effect appears.
3. In a fresh browser context with no session, open `/` and one other protected page for tenant A. Record that the
   tenant-A provider sign-in appears with no protected content first and no local credential form. Stop at the
   provider.
4. With no session, request the callback, sign-in error page, tenant login initiation, `/_test/tenant-config`,
   recovery content, and the assets the browser loads for those pages. Record reachability, that no session cookie or
   record appears after the diagnostic, and review each public asset's content for protected information or secrets.
5. Submit a crafted callback without a matching attempt and a cancelled provider return. Using keyboard only, reach
   the sign-in error page's controls; record visible focus, the explanation, and absence of provider/storage details.
6. Prepare a synthetic tenant-A session and present it to tenant-B on a page, a route handler, and the protected
   action. Record HTTP 403, the rendered forbidden page with keyboard focus behavior, no protected content, and an
   unchanged action effect count.
7. (Ungated) Give the browser a prepared tenant-A session reference whose record is then removed or expired,
   without viewing protected content. Refresh a protected page and open a new tab on one. Record that each starts
   tenant-A sign-in directly rather than a session-expired page.
   7b. (Gated) After a real login, view a protected page, let the session expire or remove its record, then use
   back/forward and refresh. Record that no restored page permits protected use.
8. Invoke the protected action through its consumer with no session; record that no automatic provider redirect
   occurs and the effect count is unchanged.
9. (Gated) Log in through instance A with the real local provider. Direct the browser only to instance B and record
   the displayed user and tenant. Open a new tab and record that it joins without login.
10. (Gated) Renew through A and observe continued access on B; let expiry be enforced through B and observe denial
    through A.
11. Remove only owned session and transaction keys, close browser contexts, stop processes started here, and record
    cleanup. Never flush a shared store.

### Expected observations

- No inventoried protected entry point returns protected content or an effect without a session (V-001, V-012).
- No-session page entry reaches the tenant's own provider with no protected content or local form (V-005).
- Public resources are reachable; the diagnostic creates no session; public assets hold no protected data or
  secrets (V-003, V-004, V-017).
- Rejected callbacks issue no session and show an accessible explanation without internals (V-006, V-018).
- Cross-tenant use yields HTTP 403, an accessible forbidden page, and no effect (V-009, V-013, V-018).
- Refresh and new-tab entry after record removal start sign-in (V-014); when gated step 7b runs, history after
  expiry restores nothing usable (V-015).
- The protected action without a session does not start automatic sign-in (V-016).
- When gated steps run: B recognizes A's identity, a new tab joins, renewal and expiry are honored across instances
  (V-007, V-008, V-014).

### Evidence to retain

- Revision, environment, safe tenant aliases and user label, instance endpoints, freshness policy reference, bounded
  actions, statuses and redirect destinations, rendered outcome descriptions, keyboard/focus observations, effect
  counts, asset assessment summary, cleanup result, per-claim disposition, and limitations. Never cookie values,
  tokens, references, or store contents.

## Operational observability verification

No operational observability claim in this slice. PREETS-SESSION-001 through PREETS-SESSION-005 state that no
additional operational observability obligation is established. An empty log, trace, metric, Loki, or Prometheus
result is not evidence of correct enforcement. Temporary diagnostic probes used during implementation must be removed
before completion; do not retain durable tests of telemetry output or exporter behavior.

## Environment and data controls

- Synthetic tenants, users, and a safe synthetic action effect only; no PHI, production credentials, client records,
  or identifying partner names.
- Owned session and OIDC transaction key prefixes per execution; remove only owned keys; never flush a shared store.
- Do not retain cookie values, provider tokens, callback parameters, credentials, references, or record contents.
- Prepared session records are limited to denial and isolation steps; they never stand in for login.
- A store outage exercise must restore the dependency and readiness before later steps.
- The temporary undesignated-resource probe must be removed and must not be committed.
- Local-provider results do not establish Microsoft, broker-chain, or universal provider compatibility.

## Evidence retention and reporting

Execution results are recorded separately from this plan, in the feature's later evidence record, with revision,
environment, conditions, observations by claim ID, pass/fail/incomplete result, cleanup, and limitations. Issue
closure, merge, generated scenarios, dry runs, and static checks are not requirement verification.

## Limitations and incomplete claims

- V-007, V-008, the valid-session joining part of V-014, the viewed-under-a-session precondition of V-015 (step 7b),
  the confirmed-versus-unconfirmed distinction in V-006, and real-login matching-tenant admission (SESSION-005 AC1)
  remain incomplete until #158's B6 freshness confirmation permits live session establishment.
- Verified freshness for first-time and expired entry with existing provider SSO belongs to #158; SESSION-004 AC1
  remains incomplete until then.
- SESSION-004 AC2 recovery composition (Server Action HTTP 401 recovery content and running-tab modal) belongs to
  #157 and remains incomplete.
- Production ingress blocking of `/_test/*` and diagnostic configuration safety require separate evidence.
- Microsoft and broker-chain compatibility remain unexecuted.
- No procedure in this plan was executed during specification.

## Readiness review

- [x] Every feature claim maps to an authoritative source.
- [x] Successful, failure, rejection, security/privacy, accessibility, and operational outcomes are covered where applicable.
- [x] The manual feature procedure is non-empty, executable by an agent, and adds a distinct observation.
- [x] Environmental prerequisites, evidence retention, cleanup, and limitations are explicit.
- [x] Planned evidence is not described as executed or verified.
- [x] No implementation architecture is required to understand the feature claims.
