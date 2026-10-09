# Authentication strategy

The Next.js proxy forwards `/` and `/auth/callback` to the application.

- `/` renders the welcome page.
- `/auth/callback` renders the authentication-return fallback.
- `GET /_test/tenant-config` is the live tenant-configuration read. See
  [multi-tenancy.md](./multi-tenancy.md).

Opening `/` shows that welcome page. Redis and Keycloak are not required for
these routes. The proxy forwards the incoming request headers and leaves
cookies and the response location unchanged.
