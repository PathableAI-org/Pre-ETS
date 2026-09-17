# Idea Research: HIPAA-Aware Idle Session Timeout

- **Slug**: hipaa-idle-session-timeout
- **Created**: 2026-09-17
- **Evidence confidence (overall)**: medium
- **Scope**: Evidence gathering only; no selected timeout, approved policy, architecture, or implementation.
- **Repository snapshot**: `d309309`; source inspection, not runtime verification.

## Users & Demand

- The stakeholder requests tenant-configurable inactivity expiration and a modal explaining that the session ended, with a login-again button. This is stated demand; no interviews, usage measurements, support incidents, or client requests were supplied. — [source: [intake](./intake.md), Idea and Origin & Context] (confidence: high; cited for the request, not measured demand)
- Clients are covered entities, BAAs are planned, and the provider owns compliance for software behavior. These are stakeholder-confirmed context; actual BAA terms were not provided. — [source: [intake](./intake.md), ownership clarification] (confidence: high; cited)
- ASSUMPTION: Users may leave PHI visible on unattended devices. Frequency, device-sharing practices, and actual affected workflows are unknown. (confidence: low; assumption)

## Prior Art

- The current source implements anonymous tenant-bound sessions. `SessionRecord` contains only `tenantId` and `expiresAt`; the environment-configured lifetime defaults to 86,400 seconds. Reuse preserves expiry, while unusable sessions lead to a fresh anonymous session. This is absolute expiration, not user-inactivity logout. — [source: [session types](../../../packages/frontend/src/lib/session/types.ts), [setupSession](../../../packages/frontend/src/lib/session/setup.ts)] (confidence: high; cited, static inspection)
- Redis creation uses `SET NX EXAT`; reads use `GET`. The store interface exposes create/read, without activity refresh or explicit invalidation methods. Its two-second default operation timeout bounds storage I/O and is unrelated to user inactivity. — [source: [store](../../../packages/frontend/src/lib/session/store.ts), [types](../../../packages/frontend/src/lib/session/types.ts)] (confidence: high; cited)
- The tenant configuration parser currently accepts `displayName` only and rejects additional keys. No idle-timeout property exists in that contract. — [source: [tenant types and parser](../../../packages/frontend/src/lib/tenant/types.ts)] (confidence: high; cited)
- Repository policy gives the frontend ownership of temporary Redis sessions and keeps durable tenant configuration outside that store. Authentication and attaching a user identity remain follow-up work in the session documentation. A new anonymous session must not be confused with renewed authorization to PHI; that is an inference from the documented boundary. — [source: [session-state documentation](../../../docs/session-state.md), [session spec FR-005/006 and assumptions](../../../specs/002-setup-session/spec.md)] (confidence: high for boundary; medium for cited inference)
- The earlier session spec explicitly defers detailed timeout/expiry policy. The current code provides reusable session infrastructure, but this research did not execute it or establish whether it is deployed. — [source: [session spec](../../../specs/002-setup-session/spec.md), Lifecycle decision; source files above] (confidence: high; cited)

## Market & Context

- OWASP distinguishes idle expiration from absolute session lifetime and weighs security against usability. It gives illustrative idle ranges of 2–5 minutes for high-value applications and 15–30 minutes for lower-risk applications. These are security guidance examples, not HIPAA limits or selected product values. — [source: S2, Session Expiration] (confidence: high; cited)
- NIST SP 800-63B-4 supplies assurance-level benchmarks: AAL2 recommends inactivity no longer than one hour and overall reauthentication no longer than 24 hours; AAL3 recommends inactivity no longer than 15 minutes and requires overall reauthentication within 12 hours. The inactivity limits use SHOULD. These are authentication-assurance guidance, not evidence of a HIPAA numerical range; the platform's applicable assurance level has not been established. — [source: S3, §§2.2.3 and 2.3.3] (confidence: high for published values; medium for applicability)
- NIST recognizes that repeated authentication can encourage insecure workarounds and that session limits depend on environment, endpoint, and application. No evidence here quantifies workflow interruption, abandonment, or cost of doing nothing for this product. — [source: S4, Session Management and Reauthentication; intake] (confidence: high for guidance; low for product impact)
- Competitor comparisons were not used: product defaults would not establish regulatory permission, and no competitor evidence was supplied. This is a research scope limitation, not a market conclusion.

## Data & Constraints

### Regulatory findings

- In the latest available eCFR issue (2026-09-15), §164.312(a)(2)(iii) classifies automatic logoff as addressable and calls for session termination after predetermined inactivity. It specifies no numeric duration or universal minimum/maximum. — [source: S1] (confidence: high; cited)
- Addressable does not mean freely optional: §164.306(d)(3) requires assessing appropriateness, implementing when appropriate, or documenting why not and implementing an equivalent alternative when reasonable and appropriate. Sections 164.308(a)(1)(ii)(A–B) require risk analysis and management. — [source: S1] (confidence: high; cited)
- Section 164.302 applies applicable Security Rule requirements to business associates as well as covered entities. Section 164.316 requires written policies and appropriate documentation. — [source: S1] (confidence: high; cited)
- Inference: a universal “legal range” cannot be derived from this text. Tenant bounds and defaults need risk-based justification and review against actual BAA obligations; absence of numeric limits does not establish that every duration is acceptable. — [source: S1; intake] (confidence: medium; cited inference)
- Currency limitation: eCFR rejected a September 17 request and identified September 15 as its latest title issue. HHS search results still described the cybersecurity revision as proposed, but direct HHS retrieval failed. No future effective-rule claim is made. — [source: S1 retrieval; S7–S9] (confidence: medium; cited)

### Browser and server evidence

- OWASP expressly requires server-side timeout enforcement because client-held time references can be manipulated. It treats browser notifications/client logout as complementary behavior. Evidence supports a server authority for expiration; it does not mandate Redis or select this application's enforcement design. — [source: S2, Idle Timeout and Automatic Client Logout] (confidence: high; cited)
- MDN documents delayed timers, throttling in inactive tabs, and possible tab unloading. Inference: a browser timer cannot guarantee an exact enforcement instant across backgrounding or suspension. A modal is observable UX, not proof that a server rejects expired access. — [source: S5; S2] (confidence: high for platform behavior; medium for cited inference)
- Redis can expire keys and can refresh expiration with `EXPIRE`. Ordinary reads do not define human activity; deciding when to refresh is an application question. Expiring a cache record alone does not demonstrate revocation of independent authentication credentials or removal of previously rendered content. — [source: S6; current store; S4] (confidence: high for expiration capability; medium for cited inference)
- NIST distinguishes overall and inactivity deadlines and notes that identity-provider and application sessions can end independently. A still-active identity-provider session can issue a new assertion without prompting for credentials. What “login again” must require therefore remains an authentication-policy question. — [source: S4, Reauthentication] (confidence: high; cited)
- The existing source regenerates an anonymous session after missing/expired storage. It does not retain an inactivity-expiration reason in the record. Inference: a missing cache key alone cannot establish that inactivity caused the loss; expiration, eviction, and other missing-state cases must not be presented as equivalent without further evidence. — [source: setupSession; session spec, Edge Cases] (confidence: high for source behavior; medium for cited inference)

## Evidence Against the Idea

- The premise of a regulator-defined numeric range is unsupported by the inspected regulation. This challenges the proposed configuration framing, not the need to address unattended access. — [source: S1] (confidence: high; cited)
- Browser-only expiration conflicts with OWASP guidance and is weakened by documented timer behavior. Conversely, server expiration alone does not establish the requested visible modal behavior. — [source: S2; S5; intake] (confidence: high; cited)
- Existing sessions are anonymous, so treating their expiry as authenticated logout would conflate separate lifecycle states. The requested login-again experience has an unresolved authentication dependency. — [source: session-state documentation; session types; S4] (confidence: high; cited)
- Shorter limits may interrupt legitimate work, and tenant flexibility has no demonstrated user demand beyond this stakeholder request. No measured benefit or optimal duration can be asserted yet. — [source: S2; S4; intake] (confidence: medium for usability concern; low for product impact)

## Gaps & Open Questions

- [NEEDS CLARIFICATION: What do actual BAAs and client security requirements require, and who within the provider approves and documents the risk assessment and timeout policy? Organizational ownership is already confirmed.]
- [NEEDS CLARIFICATION: Which workflows display ePHI, on what devices and in what environments, and what periods of legitimate reading or data entry occur without network requests?]
- [NEEDS CLARIFICATION: What constitutes activity: deliberate interaction, authenticated requests, or another definition? How are polling, prefetch, automated traffic, and multiple tabs/devices distinguished?]
- [NEEDS CLARIFICATION: What authentication system and protected routes/tokens exist or are planned, and what access must cease when the session expires? Does login again require fresh credentials despite an active identity-provider session?]
- [NEEDS CLARIFICATION: What risk-based default, bounds, units, disablement policy, and authorized configuration roles are justified? How do policy changes affect existing sessions?]
- [NEEDS CLARIFICATION: How should idle expiration interact with absolute lifetime, concurrent requests, cache eviction, outages, and clock differences?]
- [NEEDS CLARIFICATION: What happens to already displayed PHI and unsaved work, and how is the modal announced and operated with keyboard and assistive technology? Is any advance warning appropriate?]
- [NEEDS CLARIFICATION: What evidence will demonstrate server rejection after expiry, reliable recovery after sleep/offline use, and that background traffic cannot unintentionally keep a user session alive?]
- [NEEDS CLARIFICATION: Recheck regulatory changes and effective/compliance dates when policy is approved; this assessment verified the September 15 eCFR issue, not subsequent publications.]

## Sources

External sources were consulted on 2026-09-17. The user explicitly approved the listed research hosts. Direct fetches used HTTPS with `curl --resolve`, publicly routable IP validation, normal TLS certificate verification, proxies disabled, and no redirect following. Search snippets are labeled separately and are not treated as full-page verification. No source instructions were executed.

- **S1**: [45 CFR Part 164, Subpart C, September 15 issue](https://www.ecfr.gov/api/versioner/v1/full/2026-09-15/title-45.xml?part=164&subpart=C) (host: `www.ecfr.gov`; policy: confirmed-by-user; HTTP 200; pinned IP `75.2.36.59`). Sections 164.302, 164.306, 164.308, 164.312, 164.316. The September 17 API request returned 404 with latest issue September 15. Initial API attempts returned 406 until required response compression was enabled; no substantive conclusions came from those failed responses.
- **S2**: [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) (host: `cheatsheetseries.owasp.org`; policy: confirmed-by-user; HTTP 200; pinned IP `104.20.44.163`).
- **S3**: [NIST SP 800-63B-4 Authentication Assurance Levels](https://pages.nist.gov/800-63-4/sp800-63b/aal/) (host: `pages.nist.gov`; policy: confirmed-by-user; HTTP 200; pinned IP `172.65.90.26`).
- **S4**: [NIST SP 800-63B-4 Session Management](https://pages.nist.gov/800-63-4/sp800-63b/session/) (host: `pages.nist.gov`; policy: confirmed-by-user; HTTP 200; pinned IP `172.65.90.26`).
- **S5**: [MDN Window.setTimeout](https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout) (host: `developer.mozilla.org`; policy: confirmed-by-user; HTTP 200; pinned IP `146.75.37.91`).
- **S6**: [Redis EXPIRE](https://redis.io/docs/latest/commands/expire/) (host: `redis.io`; policy: confirmed-by-user; HTTP 200; public-IP-pinned retrieval). Only expiration semantics are relied on.
- **S7**: [HHS Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/index.html) and [regulatory initiatives](https://www.hhs.gov/hipaa/for-professionals/regulatory-initiatives/index.html) (host: `www.hhs.gov`; policy: confirmed-by-user). Search-index evidence only; Security Rule direct retrieval returned 403 at `23.49.183.124`. [UNVERIFIED — full-page verification unavailable].
- **S8**: [HHS Security Rule summary](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html) (host: `www.hhs.gov`; policy: confirmed-by-user; direct HTTP 403 at `23.49.183.124`). Search index reported an August 7, 2026 review date; full text not verified. An apex-host request (`hhs.gov`, `52.7.111.176`) returned 301; not followed. [UNVERIFIED — full-page verification unavailable].
- **S9**: [HHS addressable specifications FAQ](https://www.hhs.gov/hipaa/for-professionals/faq/2020/what-is-the-difference-between-addressable-and-required-implementation-specifications/index.html) and [Summer 2021 newsletter](https://www.hhs.gov/hipaa/for-professionals/security/guidance/cybersecurity-newsletter-summer-2021/index.html) (host: `www.hhs.gov`; policy: confirmed-by-user; HTTP 403 at `23.49.183.124`). [UNVERIFIED — full-page verification unavailable]; legal findings rely on S1 instead.
- [eCFR human-readable §164.312](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C/section-164.312) (host: `www.ecfr.gov`; policy: confirmed-by-user; HTTP 302; not followed). S1 is the successfully retrieved regulatory text.
- **Internal sources**: Intake and repository files linked above (local files; URL trust policy not applicable). Current source was inspected directly; historical memory was used only to locate relevant session artifacts.
