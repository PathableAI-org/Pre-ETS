# Browser tests

This directory keeps the Playwright config and the temporary tenant-directory
helper used by BDD. There are no `e2e/*.spec.ts` files.

The sign-in and idle-timeout browser specs left with the proxy that used to
resolve a tenant, start OIDC, and write session cookies. `pnpm test:e2e` has
no scenarios to run.

Frontend unit tests cover the pass-through proxy. With the frontend running,
open `/` for the welcome page, `/auth/callback` for the authentication-return
fallback, and `/_test/tenant-config` for the selected tenant JSON.
