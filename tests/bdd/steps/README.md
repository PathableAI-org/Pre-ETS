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
pnpm test:bdd:idle
```

`test:bdd:dry` sets `CUCUMBER_SESSION=1`, `CUCUMBER_OIDC=1`, and `CUCUMBER_IDLE=1` and discovers every
scenario (tenant + session + OIDC + idle) without executing steps. `test:bdd` runs only the tenant suite: the
`@production` partition first, then `not @production`, writing distinct JSON reports under
`reports/`. Session, OIDC, and idle stubs stay out of that default path.

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

## Idle-session timeout

`idle.steps.ts` binds the idle feature files:

- `features/idle-session-expiration.feature` — `@contract` green via in-process harness
- `features/idle-session-recovery.feature` — `@contract` (and dual-tagged) green; pure `@browser`
  a11y / live-IdP steps intentionally Pending without a Playwright recovery world
- `features/tenant-idle-timeout-policy.feature` — `@contract` green via policy harness

`cucumber.mjs` loads idle features and steps only when `CUCUMBER_IDLE=1`. From the repository root:

```sh
pnpm test:bdd:idle
pnpm test:bdd:idle:contract
```

Default `pnpm test:bdd` omits idle so intentional `@browser` Pending does not fail unlabeled PR CI.
Release gates D-001 / D-005 / D-006 remain outside this suite.

## What to implement

All OIDC stubs raise `Pending:` errors. Replace each one with:

1. Application interaction (HTTP call, UI action, database query, provider fixture)
2. An assertion verifying the expected outcome

Implement one step at a time, re-running the suite after each.
