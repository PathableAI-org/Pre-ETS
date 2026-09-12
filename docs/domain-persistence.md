# Session state and domain persistence

This note records the line between frontend session state and the backend
domain model. How Redis is keyed is described in
[session-state.md](./session-state.md). Tenant configuration (branding, copy,
broker connection) is a separate frontend-owned store, described in
[multi-tenancy.md](./multi-tenancy.md). It is not session state and it is not
domain data.

## Two persistences

The Next.js app may keep **session state**: in-progress UI, wizard answers, and
the authenticated user id. That state lives in Redis and is reached only
through the session id cookie. It is not a source of truth for the business.

The backend owns **domain persistence**. It is a stateless RESTful Effect v4
layer over the domain model. Local development provides that store as
Postgres in Compose, as described in [docker-compose.md](./docker-compose.md).

When something becomes a real instance of that model — a record that should
survive a new browser, a new session, or another user authorized to see it —
the frontend writes it through the backend. The backend does not read Redis,
does not use `openid-client`, and does not store session or form-draft
payloads. Token checks against the broker use
[`jose`](https://github.com/panva/jose) and the broker’s JWKS.

```text
session id → Redis          (UI / not-yet-domain)
HTTP API  → backend store   (domain instances)
```

A multi-step form is the usual example. Answers stay in the session record
between steps. Submitting the last step (or any earlier step that creates a
real entity) is an API call. After that call succeeds, the domain record is
the authority; the draft in Redis is leftover UI state and may be discarded.

## Ownership

Frontend modules may read and write session state freely. They must not persist
domain entities in Redis, in cookies, or in tenant configuration.

Backend modules persist and authorize domain entities. They must not grow a
parallel session store or treat “the frontend already validated this” as
durability.

The frontend may cache a domain record briefly for rendering. That cache is
not persistence. A later request loads the entity from the backend again, or
accepts that it is gone.

## When the line is crossed

State stays in Redis while it is still only meaningful to this browser session
and has no business identifier or lifecycle of its own.

It becomes a backend write when any of these are true:

- the object needs a durable identity
- another request, user, or process must be able to load it
- authorization or lifecycle rules apply to it

The session still supplies context for that write (tenant slug, authenticated
user id). The backend persists the entity; it does not persist the session.
