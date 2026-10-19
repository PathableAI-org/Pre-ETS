# Browser tests

This directory keeps the Playwright config and the temporary tenant-directory
helper used by BDD. There are no `e2e/*.spec.ts` files.

The sign-in and idle-timeout browser specs left with the proxy that used to
resolve a tenant, start OIDC, and write session cookies. `pnpm test:e2e` has
no scenarios to run.

Frontend unit tests cover the pass-through proxy. The active requirements BDD suite
now observes `/` redirecting through tenant-dependent `/auth/login` to real Keycloak.
It stops at provider arrival: callback validation and authenticated sessions remain
incomplete. `/auth/callback` retains the authentication-return fallback, and
`/_test/tenant-config` returns the selected tenant JSON without authentication.
See [requirements BDD commands](../features/README.md) for provider setup and evidence limits.
