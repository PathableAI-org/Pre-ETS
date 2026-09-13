# Idea Research: Tenant Resolution

- **Slug**: tenant-resolution
- **Created**: 2026-09-13
- **Updated**: 2026-09-13 (includes decide-blocking answers)
- **Evidence confidence (overall)**: medium

## Users & Demand

- Clarified stakeholders are both non-technical and technical. Business need (stated): associate every request with a tenant so the company can bill that tenant, apply branding/copy and other tenant-specific settings, show the correct data set, and found tenant isolation. Developer need (stated): after host-based resolution exists, local work must stay ergonomic — exercise `{slug}.hostname` when resolution is the work, or use `localhost` and a changeable local configuration fixture when it is not, including when the work is about tenant configuration rather than resolution. — [source: `.specify/assessments/tenant-resolution/intake.md`] (confidence: high, cited as stated want)
- Further stated failure and local rules: in production, a slug that cannot be read from the host, or that is not among the known tenants, is a 403. Locally, the developer can enable or disable production-like tenant resolution; when it is disabled, current tenant configuration is static data the developer provides. — [source: `.specify/assessments/tenant-resolution/intake.md`] (confidence: high, cited as stated want)
- Owner or decision-maker among those stakeholders is still unnamed. — [source: `.specify/assessments/tenant-resolution/intake.md`] (confidence: high, cited)
- No support tickets, interviews, usage metrics, or billing/branding incidents exist in this repository. — [source: absence across `docs/`, `README.md`, and `.specify/` besides this assessment] (confidence: high, cited as absence)
- No end-user Pre-ETS workflow yet depends on tenant association in running software. The frontend is an SSR landing page; “Client workflows beyond this landing page are not implemented yet.” — [source: `README.md`; `packages/frontend/src/app/page.tsx`] (confidence: high, cited)
- Branding and copy as tenant configuration are already in the written strategy (with broker connection). Billing as a consequence of request-to-tenant association is not described in those strategy notes. — [source: `docs/docker-compose.md`; `docs/authentication.md`; `.specify/assessments/tenant-resolution/intake.md`] (confidence: high, cited)
- Documented later slices still treat host → slug → configuration as a prerequisite: authentication starts only after a slug resolves to tenant configuration; session loading is `request URL → slug → tenant configuration`; login may render tenant chrome first. — [source: `docs/authentication.md`; `docs/session-state.md`] (confidence: high, cited)
- The constitution requires features to start from an identified user workflow. The clarified intake names business outcomes (billing, branding, isolation, correct data) and developer ergonomics, not a named Pre-ETS operator workflow. — [source: `.specify/memory/constitution.md` Principle I; `.specify/assessments/tenant-resolution/intake.md`] (confidence: high, cited)
- Local frontend start is `next dev` via `pnpm --filter @pathableai/pre-ets-frontend dev` / `pnpm dev:frontend`. Those docs do not name the bind host. — [source: `README.md`; `packages/frontend/package.json`] (confidence: high, cited)
- ASSUMPTION: the first people to feel missing request-to-tenant association in a running product would be operators or tenants who need distinct branding or data; the first people to feel the local split would be frontend developers. (confidence: low, assumption)

## Prior Art

- Intended internal design already specifies first-party modules (no tenancy library): bind host → unique **slug** → load frontend-owned tenant configuration. Only the binding step may parse the URL. It returns a slug or fails; it does not load configuration and does not fall through to a default tenant. Other modules depend only on the slug. — [source: `docs/multi-tenancy.md`] (confidence: high, cited)
- Documented local/other-environment binding is a swapped host pattern, example `{slug}.localhost`, after which the rest of the app still receives a slug. The clarified intake says `{slug}.hostname`. Whether those are the same scheme is unresolved. — [source: `docs/multi-tenancy.md`; `.specify/assessments/tenant-resolution/intake.md`] (confidence: high, cited)
- The strategy already splits “bind from host” from “load configuration.” The clarification asks to keep that split and to expose tenant plus tenant configuration to the UI through an interface, while deferring how persistence works and what the configuration fields are. — [source: `docs/multi-tenancy.md`; `.specify/assessments/tenant-resolution/intake.md`] (confidence: high, cited)
- Documented local persistence for configuration is Postgres from Compose, not fixtures. Compose “does not create tenants.” Tenant configuration includes branding, copy, and broker connection. The clarification explicitly postpones that store. — [source: `docs/multi-tenancy.md`; `docs/docker-compose.md`; `.specify/assessments/tenant-resolution/intake.md`] (confidence: high, cited)
- Those strategy notes are intended architecture. There is no Compose file, no Postgres client, no tenant-binding module, and no tenant-configuration reader in `packages/frontend`. — [source: `.specify/memory/constitution.md` Architecture Constraints; repository file tree for `packages/frontend` and absence of `docker-compose*.yml` / `compose*.yml`] (confidence: high, cited)
- An earlier assessment of this same slug recommended host-bound identifier only and treated bare `localhost` as a miss. That recommendation predates the clarification that `localhost` plus a local fixture must remain usable when the work is not resolution. — [source: `.specify/assessments/tenant-resolution/decision.md`; `.specify/assessments/tenant-resolution/intake.md`] (confidence: high, cited)
- Authentication and session notes assume a tenant host: OIDC callback on the same host the user hit; local Keycloak redirect URIs such as `http://springfield.localhost:3000/auth/callback`; session cookies host-only for the tenant host. — [source: `docs/authentication.md`; `docs/docker-compose.md`; `docs/session-state.md`] (confidence: high, cited)
- External competitor / open-source tenancy prior art was not gathered. Available fetch cannot pin the connected peer or expose it for re-validation against private/metadata ranges, so fetches were refused. — [source: research URL Trust Policy] (confidence: high, cited as gap)

## Market & Context

- The running product has no tenant-aware alternative today: one landing page, no host binding, no tenant configuration read. — [source: `packages/frontend/src/app/page.tsx`; `packages/frontend/src/app/layout.tsx`] (confidence: high, cited)
- Documented alternative for local resolution without production hosts: `{slug}.localhost` by swapping only the binding step. Documented alternative for configuration data: Postgres from Compose. The clarification adds a third local path: bare `localhost` plus an easily changed configuration fixture, and says the store and field list are out of this increment. — [source: `docs/multi-tenancy.md`; `docs/docker-compose.md`; `.specify/assessments/tenant-resolution/intake.md`] (confidence: high, cited)
- Cost of doing nothing on request-to-tenant association: later authentication, session, tenant chrome, and the stated billing/branding/data/isolation outcomes cannot start from a bound request. Cost of doing nothing for current end users is low: those workflows are not implemented. Cost of doing nothing on the `localhost`/fixture path: developers who need tenant configuration without testing resolution still face host setup; the `{slug}.localhost` path on paper still exists. — [source: `docs/authentication.md`; `docs/session-state.md`; `README.md`; `.specify/assessments/tenant-resolution/intake.md`] (confidence: high, cited)
- ASSUMPTION: without a `localhost` fixture path, developers would use `/etc/hosts` or similar to reach `{slug}.localhost` even when the work is only about configuration. (confidence: low, assumption)

## Data & Constraints

- Identifier in the strategy is a unique **slug**, not inferred from path, query string, or headers other than the URL host. Intake language is “tenant id” read from HOST as described in `docs/`. Whether id and slug are the same is unresolved. — [source: `docs/multi-tenancy.md`; `.specify/assessments/tenant-resolution/intake.md`] (confidence: high, cited)
- Fail-closed rules in the strategy: unknown host, apex/`www`, extra labels, or a slug with no configuration row is not-found. The UI must not substitute another tenant’s configuration. Constitution Principle III: bind through a single trusted host-binding boundary; unknown tenants fail closed; downstream modules receive resolved tenant context and must not reinterpret the URL. The intake author later specified production failure as HTTP 403 when a slug cannot be read from the host or is not among known tenants. Those two outcomes (not-found vs 403) are not the same. — [source: `docs/multi-tenancy.md`; `.specify/memory/constitution.md` Principle III; `.specify/assessments/tenant-resolution/intake.md`] (confidence: high, cited)
- Local production-like resolution can be turned off; then current tenant configuration is static data the developer provides, not a host-derived slug. That answers “which tenant on `localhost`” as “whichever tenant the static data describes,” and it is explicitly not host binding. When production-like resolution is on, the same 403 rules as production apply. What happens if that static data is missing is still unanswered. — [source: `.specify/assessments/tenant-resolution/intake.md`] (confidence: high, cited as stated want)
- Frontend owns tenant configuration; Next.js is the only reader when rendering UI; persistence is an implementation detail, locally specified as Compose Postgres. The increment under assessment postpones that store and the configuration shape. — [source: `docs/multi-tenancy.md`; `docs/docker-compose.md`; `docs/domain-persistence.md`; `.specify/assessments/tenant-resolution/intake.md`] (confidence: high, cited)
- Constitution: credentials, tokens, and real client records must not be committed as fixtures or examples. Documented configuration includes broker connection data. — [source: `.specify/memory/constitution.md` Principle III; `docs/docker-compose.md`; `docs/authentication.md`] (confidence: high, cited)
- Session cookies are host-only. A session on `localhost` would not be the same host as a tenant host. Login/session are not this increment, but later slices assume a tenant host. — [source: `docs/session-state.md`; `.specify/assessments/tenant-resolution/intake.md`] (confidence: high, cited)
- Frontend stack present today: Next.js 16.3.5 App Router, React 19, `@pathableai/react`. No database, Redis, or OIDC client dependency is installed in `packages/frontend`. The clarification asks that the split “make sense in the Next.js conventions and ecosystem”; no further convention is named. — [source: `packages/frontend/package.json`; `.specify/assessments/tenant-resolution/intake.md`] (confidence: high, cited)
- No volume, tenant-count, billing, latency, or compliance metric for tenant resolution exists in-repo. — [source: absence across `docs/` and `README.md`] (confidence: high, cited as absence)

## Evidence Against the Idea

- Billing, correct-dataset routing, and isolation are stated business outcomes of associating a request with a tenant. None of those systems exist yet; this increment also postpones the store and the configuration shape. The interface alone does not bill, isolate domain data, or customize branding. — [source: `.specify/assessments/tenant-resolution/intake.md`; `README.md`; `packages/frontend/src/app/page.tsx`] (confidence: high, cited)
- Turning off production-like resolution and returning developer-supplied static configuration is still a second path to “current tenant.” The strategy forbids falling through to a default tenant for request binding. The new rule keeps that path off the host, but it does not say what happens if the static data is missing, and it can still look like a default tenant to later login/session work that assumes a tenant host. — [source: `docs/multi-tenancy.md`; `.specify/memory/constitution.md` Principle III; `docs/session-state.md`; `.specify/assessments/tenant-resolution/intake.md`] (confidence: high, cited)
- Production failure is now specified as 403; the written strategy still calls the same class of miss not-found. Specify would have to resolve that conflict. — [source: `docs/multi-tenancy.md`; `.specify/assessments/tenant-resolution/intake.md`] (confidence: high, cited)
- `{slug}.hostname` is not the documented local pattern (`{slug}.localhost`). If they differ, local resolution testing and later Keycloak redirect URIs can diverge. — [source: `docs/multi-tenancy.md`; `docs/docker-compose.md`; `.specify/assessments/tenant-resolution/intake.md`] (confidence: high, cited)
- Auth and session notes assume the user lives on a tenant host. A first-class `localhost` configuration path can make this increment easy and make the next slices lie about host identity. — [source: `docs/authentication.md`; `docs/session-state.md`] (confidence: high, cited)
- “A function that returns the current tenant configuration” and “Next.js conventions” are solution-shaped and unspecified. Building an extendable interface before any second consumer or second store exists can violate constitution simplicity (abstractions must answer a current requirement). — [source: `.specify/assessments/tenant-resolution/intake.md`; `.specify/memory/constitution.md` Principle VI] (confidence: medium, cited)
- Demand evidence is still thin: stated business and developer wants, no observed incidents, no operator workflow in the running product. — [source: `.specify/assessments/tenant-resolution/intake.md`; `README.md`; `.specify/memory/constitution.md` Principle I] (confidence: medium, cited)
- No external prior art was checked. — [source: research URL Trust Policy] (confidence: high, cited as gap)

## Gaps & Open Questions

- [NEEDS CLARIFICATION: is the requested “tenant id” the same as the unique tenant slug in `docs/multi-tenancy.md`, or a different identifier?]
- [NEEDS CLARIFICATION: is `{slug}.hostname` the same local pattern as the documented `{slug}.localhost`, or a different host scheme?]
- [NEEDS CLARIFICATION: what happens when production-like resolution is off and the static tenant-configuration data is missing?]
- [NEEDS CLARIFICATION: should production failure stay 403 as stated, or not-found as in `docs/multi-tenancy.md`?]
- [NEEDS CLARIFICATION: what Next.js convention or boundary is intended for separating host resolution from reading tenant configuration?]
- [NEEDS CLARIFICATION: who owns this request, and who decides among the business and developer stakeholders?]
- [NEEDS CLARIFICATION: which of billing, branding, correct data, and isolation must this increment actually enable, versus only make possible later?]
- [NEEDS CLARIFICATION: must this slice stay compatible with later host-only cookies and Keycloak redirect URIs on a tenant-shaped local host, or is login/session out of scope until a later change?]
- [NEEDS CLARIFICATION: is there observed evidence that missing request-to-tenant association or local host setup is currently costly?]

## Sources

- repo path `docs/multi-tenancy.md` (host: none, policy: local file)
- repo path `docs/authentication.md` (host: none, policy: local file)
- repo path `docs/session-state.md` (host: none, policy: local file)
- repo path `docs/domain-persistence.md` (host: none, policy: local file)
- repo path `docs/docker-compose.md` (host: none, policy: local file)
- repo path `.specify/memory/constitution.md` (host: none, policy: local file)
- repo path `.specify/assessments/tenant-resolution/intake.md` (host: none, policy: local file)
- repo path `.specify/assessments/tenant-resolution/decision.md` (host: none, policy: local file; predates this rewrite)
- repo path `README.md` (host: none, policy: local file)
- repo path `packages/frontend/package.json` (host: none, policy: local file)
- repo path `packages/frontend/src/app/page.tsx` (host: none, policy: local file)
- repo path `packages/frontend/src/app/layout.tsx` (host: none, policy: local file)
- External web sources: none fetched. Available fetch cannot pin the connected peer or expose it for re-validation (auto-refused: connection-safety / DNS-rebinding policy).
