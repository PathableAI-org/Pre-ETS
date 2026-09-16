# Step Definitions

**Detected framework:** `@cucumber/cucumber` (TypeScript ESM at the repository root)

These bindings cover the platform as a whole. Root feature files are the Gherkin inputs, and
Cucumber loads support code through `cucumber.mjs`.

## Running scenarios

From the repository root:

```sh
pnpm test:bdd:dry
pnpm test:bdd
pnpm test:bdd:session
pnpm test:bdd:oidc
```

`test:bdd:dry` sets `CUCUMBER_SESSION=1` and `CUCUMBER_OIDC=1` and discovers every scenario
(tenant + session + OIDC) without executing steps. `test:bdd` runs only the tenant suite: the
`@production` partition first, then `not @production`, writing distinct JSON reports under
`reports/`. Session and OIDC stubs stay out of that default path.

## Bindings

Step definitions in `tenant.steps.ts` drive the owned Next.js test process, Playwright
page/HTTP requests, and injected contract helpers against `src/lib/tenant`. Assertions read typed
evidence on `TenantWorld`. Pending, undefined, and ambiguous steps must not be treated as
passing.

## Session setup scaffold

`session.steps.ts` contains parameterized TypeScript bindings for `002-setup-session`. They use
the existing root Cucumber layout rather than introducing a second step-definition directory.
Quoted values use `{string}` parameters.

`cucumber.mjs` loads session features and stubs only when `CUCUMBER_SESSION=1`. Run the session
suite from the repository root:

```sh
pnpm test:bdd:session
```

## OIDC login scaffold

`oidc.steps.ts` contains 139 parameterized TypeScript stubs for the OIDC feature files:

- `features/tenant-oidc-login.feature`
- `features/tenant-oidc-configuration.feature`
- `features/local-oidc-development.feature`

Each stub throws a `Pending:` error; replace it with the required setup, interaction, or
assertion one step at a time. Quoted values use `{string}` parameters. Unused typed parameters
are prefixed with `_` until implemented.

`cucumber.mjs` loads OIDC features and stubs only when `CUCUMBER_OIDC=1`. Run the OIDC scaffold
from the repository root:

```sh
pnpm test:bdd:oidc
```

Use `pnpm test:bdd:dry` to check combined discovery and `pnpm test:bdd` for the tenant
acceptance suite. Dry runs do not prove implementation; the OIDC suite must fail until its
bindings and implementation are complete.

## What to implement

All OIDC stubs raise `Pending:` errors. Replace each one with:

1. Application interaction (HTTP call, UI action, database query, provider fixture)
2. An assertion verifying the expected outcome

Implement one step at a time, re-running the suite after each.
