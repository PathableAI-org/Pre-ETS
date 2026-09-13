# Concept: Tenant Resolution

- **Slug**: tenant-resolution
- **Created**: 2026-09-13
- **Updated**: 2026-09-13 (rewritten against the clarified problem)
- **Recommended option**: Split host association from configuration read

## Options

### Option A — Host-bound association only

- **Sketch**: Every request is judged from its host the way the tenancy strategy already describes: a tenant-shaped host yields exactly one identifier, and any other host—including bare `localhost`—is a visible miss. Locally, developers use a tenant-shaped local host (not a production host). Downstream work is handed that identifier and does not decide tenancy again. There is no separate `localhost` configuration stand-in.
- **Appetite**: small
- **Trade-offs**: Wins fail-closed association, a single determination, and alignment with the written host-binding rule. Sacrifices the clarified goal that developers can stay on `localhost` when the work is not association, including when it is about tenant configuration. Risk: configuration work stays coupled to host setup. Appetite is a budget, not a measured estimate.
- **Rabbit holes**: Teaching a tenant-shaped local host as if it were production; growing the miss path into a product experience; sneaking in a store “while we are here.”

### Option B — Split host association from configuration read

- **Sketch**: Host-based association and “what is the current tenant configuration?” are separate concerns. Association still happens only from a tenant-shaped host and can be exercised locally when that is the work. Reading current configuration is what UI work uses: in production-like settings it comes from stored data for the associated tenant; on `localhost` it comes from a local stand-in the developer can change without testing resolution. The increment defines that split and the extendable exposure of tenant plus configuration to the UI. It does not choose the durable store or the full field list. Bare `localhost` is not treated as a production tenant host.
- **Appetite**: small
- **Trade-offs**: Wins both clarified local modes, hides storage from UI consumers, and postpones persistence and field shape as requested. Sacrifices a single “the host is the only place tenancy is decided” story unless the `localhost` stand-in is clearly not a second binding path. Risk: `localhost` configuration becomes a default tenant, or later login/session assume a tenant host the developer never used. Appetite stays small only if the store and branding/billing work stay out.
- **Rabbit holes**: Inventing the fixture-edit mechanism; filling configuration with branding, copy, or broker secrets; building a persistence framework; making `localhost` look like a tenant host for cookies and redirects; turning the Next.js-convention question into a large structural rewrite.

### Option C — Do nothing now

- **Sketch**: Leave the landing page tenant-unaware. When a later, tenant-dependent user workflow is specified, associate requests and read configuration then. Until that time, anyone who needs a tenant-shaped local host uses the already-written other-environment host pattern by hand. No tenancy library is bought; the strategy already says this is first-party work.
- **Appetite**: none (no build)
- **Trade-offs**: Wins avoiding a thinly evidenced increment and avoiding a `localhost` path that later auth/session notes may contradict. Sacrifices the documented prerequisite and the stated business outcomes: nothing can bill, brand, isolate, or show the right data from a bound request. Current end users feel little cost because those workflows are not implemented.
- **Rabbit holes**: Informal, one-off tenant checks appearing in the next feature; the first user-facing workflow silently inventing its own binding and configuration-read rules.

## Recommendation

Recommend **Option B**. The clarified problem is not only “bind from host.” It is also “developers must use `localhost` when the work is not association, including configuration work,” and “UI work must obtain tenant and configuration without knowing the store.” Option A is the smallest fail-closed slice and was the previous recommendation, but it fails those clarified goals. Option C remains honest about thin demand and missing billing/branding systems, yet it leaves every later tenant-bound slice without a request-level tenant.

Option B only clears the bar if the `localhost` stand-in is not a second way to decide which tenant a request is for, and if this increment does not implement billing, isolation, or the eventual store. Those are assumptions to validate, not details to design here.

## Out of Scope (for the recommended option)

- Billing, invoicing, and tenant commercial operations.
- Backend domain authorization and domain-data isolation.
- Authenticating a user, brokering login, or holding session/cookie/UI state.
- Pre-ETS operator workflows and other end-user product flows.
- Choosing or building Compose/Postgres or any durable tenant-configuration store.
- Defining branding, copy, broker connection, or other later configuration fields.
- Treating bare `localhost` as a production tenant host, or rewriting fail-closed / single-tenant-per-request rules.
- Buying a tenancy library.

## Assumptions to Validate

- The identifier to associate is the unique tenant slug already named in the tenancy strategy, not a second id.
- `{slug}.hostname` in the intake is the same idea as the documented tenant-shaped local host (for example `{slug}.localhost`), not a new scheme.
- On `localhost`, “current tenant configuration” comes from a local stand-in and does not mean the host was parsed as a tenant.
- A developer can change that stand-in without a durable store, and the stand-in can stay free of credentials and real client data.
- Host association still fail-closes on unknown or non-tenant hosts; a missing stand-in is also a visible miss, not another tenant.
- Login and session may stay out of this increment even though they will later assume a tenant host.
- Billing, branding, correct data, and isolation are enabled later by this association, not delivered in this increment.
- Ownership is shared between business outcomes and developer ergonomics; neither side can drop the other’s goal without changing the problem.
