# Idea Intake: Tenant Resolution

- **Slug**: tenant-resolution
- **Created**: 2026-09-13
- **Updated**: 2026-09-13 (clarifications merged into the original capture)
- **Source**: pasted text (original request and later clarifications); repo path `docs/multi-tenancy.md`
- **Type**: new-capability

## Idea (as captured)

Pasted request (original):

> Our general tenancy strategy is described in docs/multi-tenancy.md . We want to have some module within the frontend that resolves to a tenant id and abstracts over the persistance layer. Over time we will add data fields to the return value of this persistance layer, but for now we want the initial id resolution and persistance abstraction setup. For local development, the HOST will usually be localhost and developers should not have to spoof that for features unrelated, so there should be some dev-friendly way to define the tenant the dev wants to be using locally and the persistence layer should return some easy-to-use fixture data

Pasted clarification:

> I want to clarify that this idea has a few different perspectives and stakeholder, some technical some non-technical. From a buisness perspective we need to be able to associate every request to a tenant. That is what allows us to bill specific tenants, allows tenants to customize branding and copy and other tenant-specific settings, allows users to interact with the correct data set, and lays the foundation for tenant-isolation. Our plan is to read the tenant id from the HOST of a request as described in docs/.
>
> This introduces the developers as a stakeholder because after this is implemented we still need an ergonomic way to run the serivce locally. Local devs should be able to test the {slug}.hostname resolution when that is relevant to their work, but they need to also be able to just start the server and go to localhost when their work doesn't depend on that. Sometimes they will work on a feature that's not about tenant resolution, but is about some tenant configuration. So there needs to be some separation of concerns that make sesnse in the nextjs conventions and ecosystem. Developers should be able to have a function that returns the current tenant configuration. In production, that will resolve to the stored data for that tenant, but when testing locally the dev needs to be able to easily to change the local tenant config fixture.
>
> This feature still kicks the can down the road about how the persistance should actual work and what the tenant configuration should be. It instead is about defining the interface that exposes the tenant and tenant config to the UI in a way that works for local development and is extendable for future features.

Pasted clarification (blocking questions from decide):

> In production if a slug cannot be read from the HOST or is not stored within the known tenants, that should result in a 403 error. Locally, we need a mechanism for the dev to either enable or disable prod-like tenant resolution. If disabled, then we need a way for the dev to provide static data that will be returned as tenant config data.

Related repository note (`docs/multi-tenancy.md`): the frontend identifies a tenant on an incoming request and loads that tenant’s configuration. The frontend owns tenant configuration; the Next.js app is the only reader of this data when rendering UI. Binding the host to a slug and loading configuration are first-party modules. Each tenant has a unique slug used to query tenant configuration. The UI binds a request to a tenant by reading the host of the request URL. Production hosts follow `{slug}.pathable.com`. Only the binding step may parse the URL; it returns a slug or fails and does not load configuration or fall through to a default tenant. Other environments may use a different host pattern (for example `{slug}.localhost`) by swapping only this binding step. The slug is then used to load tenant configuration from the frontend’s persistence layer. A missing or unknown slug, or a slug with no configuration row, is a not-found result.

## Restated

Every request should be associated with a tenant, read from the request host as described in `docs/`, so the business can bill, brand, isolate, and show the right data per tenant. The first cut is an interface that exposes the current tenant and tenant configuration to the UI—not the eventual store or the full configuration shape. In production, a host that does not yield a slug, or a slug that is not among the known tenants, is a 403. Locally, developers can turn production-like resolution on or off; when it is off, current tenant configuration is static data they provide.

## Origin & Context

- **Raised by**: The intake author, describing both non-technical business stakeholders (billing, branding/copy, correct data, isolation) and technical stakeholders (developers who run the service locally). [NEEDS CLARIFICATION: who owns or decides this request]
- **Trigger**: Need to associate every request with a tenant, plus the local-development consequence that host-based resolution must stay ergonomic when the work is not about resolution itself.

## First-Glance Unknowns

- [NEEDS CLARIFICATION: is the requested “tenant id” the same as the unique tenant slug in `docs/multi-tenancy.md`, or a different identifier?]
- [NEEDS CLARIFICATION: is `{slug}.hostname` the same local pattern as the documented `{slug}.localhost`, or a different host scheme?]
- [NEEDS CLARIFICATION: what happens when production-like resolution is off and the static tenant-configuration data is missing?]
- [NEEDS CLARIFICATION: what Next.js convention or boundary is intended for separating host resolution from reading tenant configuration?]
- [NEEDS CLARIFICATION: who owns this request, and who decides among the business and developer stakeholders?]
