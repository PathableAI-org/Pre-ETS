# Docker Compose for local development

This note records how local development runs **external** services. The Next.js
app and the Effect API stay on the host (`pnpm` in each workspace). Compose
does not run those processes.

The stack for now is an OIDC broker, Postgres, and Redis.

OIDC behavior is described in [authentication.md](./authentication.md). Session
state is described in [session-state.md](./session-state.md). Domain persistence
is described in [domain-persistence.md](./domain-persistence.md).

## What Compose provides

A root Compose file starts only services the apps talk to over the network:

- **Keycloak** — local OIDC broker for manual login testing
- **Postgres** — durable store for frontend tenant configuration and backend
  domain data
- **Redis** — frontend session store

Pin image tags. Do not use `latest`. Credentials and ports in this file are
for a machine-local developer environment only; they are not production
values.

Apps on the host reach the services at `127.0.0.1` (or `localhost`). Do not
put the Next.js or Effect processes in the same Compose file.

## Keycloak

Use the official image `quay.io/keycloak/keycloak` with `start-dev`. That
mode is one container, no TLS, and an embedded database. It is for local
manual testing only.

Publish the HTTP port on the loopback address (for example `127.0.0.1:8080`).
Set bootstrap admin credentials through environment variables
(`KC_BOOTSTRAP_ADMIN_USERNAME`, `KC_BOOTSTRAP_ADMIN_PASSWORD`).

After the container is up, create a realm, an OpenID Connect client for the
Next.js app (authorization code + PKCE), and at least one test user. Valid
redirect URIs must match the local tenant hosts from
[multi-tenancy.md](./multi-tenancy.md), for example
`http://springfield.localhost:3000/auth/callback`.

`openid-client` and backend token checks use the realm’s discovery document:

```text
http://127.0.0.1:8080/realms/<realm>/.well-known/openid-configuration
```

The issuer URL the browser uses must be the same URL the host-run apps use.
If an app later runs inside Compose as well, do not silently switch the
issuer to a Docker-only hostname the browser cannot open.

Realm JSON plus `--import-realm` can recreate the client and test users on
`compose up`. Until that exists, the admin console is enough.

This local broker stands in for Authentik or Keycloak in other environments.
Do not add a second local identity stack (Better Auth, Auth.js, a mock that
skips the browser login) for manual testing.

## Postgres

Use the official `postgres` image, again with a pinned major. Publish it on
loopback and set a local user, password, and default database through
environment variables.

One Postgres **container** is enough. Keep ownership clear with separate
databases (or schemas) in that instance:

- frontend-owned tenant configuration (branding, copy, broker connection)
- backend-owned domain records

The Next.js app is the only writer of tenant configuration. The Effect API is
the only writer of domain data. They do not share tables. Neither uses this
Postgres instance as a session store.

## Redis

Use the official `redis` image with a pinned major. Publish it on loopback
(for example `127.0.0.1:6379`). Local development does not need a password.

This container is the session key store described in
[session-state.md](./session-state.md). The Next.js app is the only client.
The Effect API does not connect to it. Do not persist domain records or
tenant configuration here.

## Running the apps against Compose

1. Start the external services with Compose.
2. Point local app configuration at the Keycloak discovery URL, the Redis
   URL, and the Postgres connection strings for the database each process
   owns.
3. Run the frontend and backend on the host with the workspace start scripts.

An unknown tenant host still fails closed. Compose does not create tenants;
it only provides the broker, the database, and the session store those
modules use.
