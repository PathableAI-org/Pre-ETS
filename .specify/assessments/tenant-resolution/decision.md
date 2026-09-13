# Decision: Tenant Resolution

- **Slug**: tenant-resolution
- **Decided**: 2026-09-13
- **Verdict**: go
- **Artifacts reviewed**: intake.md, research.md, problem.md, concept.md
- **Supersedes**: the earlier `go` for Option A, and the later `needs-clarification` that blocked Option B on an unanswered `localhost` binding path

## Scorecard

| Criterion              | Rating   | Justification                                                                                                                                                                                                                                                                                    |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Problem validity       | adequate | Missing request-to-tenant association is real and blocks later work. Unknown hosts must be refused. The two local modes are a stated developer problem, not an observed one.                                                                                                                     |
| Evidence strength      | adequate | The gap, host-binding, and bind-vs-load split are cited in-repo. Production 403 and local enable/disable + static data are stated answers, not measured demand. Research confidence is medium.                                                                                                   |
| Value vs. inaction     | adequate | Doing nothing leaves later auth/session/tenant work and the stated business outcomes without a bound request, and unknown hosts cannot be refused. Current end users feel little cost.                                                                                                           |
| Feasibility / appetite | adequate | Option B is a small first-party slice if the store and field list stay out. Appetite is a budget, not a measured estimate.                                                                                                                                                                       |
| Strategic fit          | adequate | Production-like association matches constitution Principle III: unreadable or unknown slug is refused (403), not substituted. When local production-like resolution is off, configuration is static data and is not host binding. Residual conflict: strategy docs still say not-found, not 403. |
| Risk posture           | adequate | The previous block is answered: off-host static data is not a second host-binding path; on means the same 403 rules. Remaining risks (missing static data, later host-only cookies, `{slug}.hostname` vs `{slug}.localhost`) are named for specification, not ignored.                           |

## Verdict & Rationale

**Go** — specify Option B (split host association from configuration read), using the decide-blocking answers as the local and failure rules.

Problem, evidence, value, and appetite remain adequate. Strategic fit and risk are no longer weak: production-like association fail-closes with 403, and the local stand-in applies only when the developer has turned that association off. That is enough to leave discovery. A `needs-clarification` would still be honest if those answers had not been given. Option A still fails the local-off goal. Option C still leaves every later tenant-bound slice without a bound request.

Unknowns that remain (id vs slug, hostname vs localhost, missing static data, 403 vs documented not-found) belong on the specify handoff. They do not restore the isolation block.

## If needs-clarification

- **Blocking questions**: none for this verdict
- **Revisit stage**: n/a

## If go — Handoff to `/speckit-specify`

- **Problem**: The product cannot associate an incoming request with a tenant, so later billing, branding, isolation, and correct-data work have no request-level tenant; unknown hosts must be refused, and developers must be able to turn production-like association off and still read static tenant configuration.
- **Chosen approach**: Split host association from configuration read (concept Option B), with these rules: production-like association reads a slug from the host; if a slug cannot be read or is not among known tenants, the result is HTTP 403. Locally, the developer can enable or disable production-like resolution. When it is disabled, current tenant configuration is static data they provide, not a host-derived tenant. UI work obtains tenant and configuration through that split and does not know the durable store.
- **In scope / out of scope**: In: host association for documented tenant-shaped hosts; production 403 on unreadable or unknown slug; local enable/disable of production-like resolution; static tenant-configuration data when it is off; a single determination passed downstream; an extendable exposure of tenant plus configuration without choosing the store or full field list. Out: billing; backend domain isolation; login/session/cookies; operator workflows; Compose/Postgres or any durable store; branding, copy, broker connection, and other later fields; treating bare `localhost` as a production tenant host; a tenancy library.
- **Success metrics**: Production unreadable or unknown slug → 403, never another tenant. Consumers obtain current tenant or configuration without re-parsing the URL to decide tenancy and without knowing the store. A developer can enable production-like association locally, or disable it and receive the static data they supplied.
- **Carried-forward open questions**:
  - Confirm the identifier is the unique tenant slug in `docs/multi-tenancy.md`, not a second id.
  - Treat `{slug}.hostname` as the documented tenant-shaped local host (for example `{slug}.localhost`) unless specify is told they differ.
  - What happens when production-like resolution is off and the static data is missing.
  - Prefer the stated 403 over the strategy’s “not-found” wording, and record that conflict if the spec keeps 403.
  - Keep static records free of credentials and real client data.
  - Login and session stay out of this increment; they will later assume a tenant host when production-like association is on.
  - Billing, branding, correct data, and isolation are enabled later, not delivered here.
  - Ownership remains unnamed; treat both business fail-closed association and developer enable/disable as in-scope goals.
