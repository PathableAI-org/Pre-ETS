# Problem Definition: Tenant Resolution

- **Slug**: tenant-resolution
- **Created**: 2026-09-13
- **Updated**: 2026-09-13 (rewritten after decide-blocking answers)
- **Inputs used**: intake.md, research.md, user input (answers to decide blocking questions)

## Problem Statement

The product cannot associate an incoming request with a tenant, so later billing, branding, isolation, and correct-data work have no request-level tenant to rely on. When association is required, a host that does not yield a known tenant must be refused (403) rather than silently served as someone else. Developers also need two local conditions that must not collapse into one: they must be able to turn production-like host association on, and they must be able to turn it off and still obtain current tenant configuration from static data they supply.

## Affected Users & Stakeholders

- **Users**: Business stakeholders (non-technical, as named in intake) — they cannot bill, brand, isolate, or aim users at the correct data until every request is associated with a tenant, and they cannot accept an unknown host being served as a tenant. Those outcomes are stated; no billing or tenant-branded product exists yet.
- **Users**: Frontend developers — they need production-like host association when that is the work, and they need to disable it and supply static tenant-configuration data when it is not (including when the work is about tenant configuration).
- **Users**: Pre-ETS operators and other end users — not yet affected in the running product; no tenant-aware workflow exists beyond a landing page.
- **Stakeholders**: [NEEDS CLARIFICATION: who owns or decides this request among the business and developer stakeholders]
- **Stakeholders**: Maintainers of the tenancy and constitution rules — they require exactly-one-tenant binding and fail-closed handling of unknown tenants. Production 403 on an unreadable or unknown slug serves that interest. A local “resolution off + static data” path is off the host by statement; it still must not look like a default tenant to later host-scoped work.
- **Stakeholders**: Owners of later authentication, session, and tenant-presentation work — those slices are specified as unable to start until a request is already bound to a tenant and configuration can be read.

## Goals

- A request under production-like association is either known to belong to exactly one tenant or refused; another tenant is never substituted.
- In production, a host that does not yield a slug, or a slug that is not among the known tenants, results in a 403.
- Later work that needs a tenant can use that determination and does not re-decide which tenant the request is for.
- Locally, a developer can enable production-like host association or disable it.
- When production-like association is disabled, current tenant configuration is static data the developer supplies, not a host-derived tenant.
- Current tenant configuration can be obtained without each consumer knowing how it is stored, and without deciding the eventual store or the full field list.

## Non-Goals

- Implementing billing, invoicing, or tenant commercial operations.
- Implementing backend domain authorization or isolating domain data in the API.
- Authenticating a user or brokering identity-provider login.
- Holding session, cookie, or in-progress UI state.
- Delivering Pre-ETS operator workflows or other end-user product flows.
- Choosing or building the durable persistence mechanism (including Compose/Postgres).
- Defining the full tenant-configuration shape (branding, copy, broker connection, and later fields).
- Onboarding real tenants or changing the written fail-closed / single-tenant-per-request rules.
- Proving or disproving the broader multi-tenancy strategy; this problem assumes that strategy as context.

## Success Metrics

- In production, an unreadable host slug or a slug not among known tenants yields HTTP 403; another tenant is never substituted. (qualitative / binary; baseline: no determination exists)
- Work that needs the current tenant or tenant configuration can obtain it without parsing the request URL again to decide tenancy and without knowing the store. (qualitative / binary; baseline: no consumer exists)
- A developer can enable production-like host association locally, or disable it and receive the static tenant-configuration data they supplied. (qualitative; baseline: unknown — stated want only)
- Time or incidents spent on missing request-to-tenant association or local host setup. (measurable if collected; baseline: unknown — no tickets or usage data)

## Cost of Inaction

If request-to-tenant association is never solved, the stated business outcomes (billing, branding, correct data, isolation) and the documented authentication, session, and tenant-presentation slices cannot start from a bound request, and unknown hosts cannot be refused. Current end users feel little of that: those workflows are not implemented. If only the local enable/disable and static-data path is left unsolved, developers can still use a tenant-shaped local host on paper, but work that is not about association stays coupled to host setup, and local practice can drift from later host-scoped login and session assumptions.

## Open Questions

- [NEEDS CLARIFICATION: is the requested “tenant id” the same as the unique tenant slug in `docs/multi-tenancy.md`, or a different identifier?]
- [NEEDS CLARIFICATION: is `{slug}.hostname` the same local pattern as the documented `{slug}.localhost`, or a different host scheme?]
- [NEEDS CLARIFICATION: what happens when production-like resolution is off and the static tenant-configuration data is missing?]
- [NEEDS CLARIFICATION: should production failure stay 403 as stated, or not-found as in `docs/multi-tenancy.md`?]
- [NEEDS CLARIFICATION: what Next.js convention or boundary is intended for separating host resolution from reading tenant configuration?]
- [NEEDS CLARIFICATION: who owns this request, and who decides among the business and developer stakeholders?]
- [NEEDS CLARIFICATION: which of billing, branding, correct data, and isolation must this increment actually enable, versus only make possible later?]
- [NEEDS CLARIFICATION: must this slice stay compatible with later host-only cookies and Keycloak redirect URIs on a tenant-shaped local host, or is login/session out of scope until a later change?]
- [NEEDS CLARIFICATION: is there observed evidence that missing request-to-tenant association or local host setup is currently costly?]
