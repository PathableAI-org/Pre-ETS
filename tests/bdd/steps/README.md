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
```

`test:bdd:dry` sets `CUCUMBER_SESSION=1` and discovers every scenario (tenant + session) without
executing steps. `test:bdd` runs only the tenant suite: the `@production` partition first, then
`not @production`, writing distinct JSON reports under `reports/`. Session stubs stay out of that
default path.

## Bindings

Step definitions in `tenant.steps.ts` drive the owned Next.js test process, Playwright
page/HTTP requests, and injected contract helpers against `src/lib/tenant`. Assertions read typed evidence on
`TenantWorld`. Pending, undefined, and ambiguous steps must not be treated as passing.

## Session setup scaffold

`session.steps.ts` contains 76 parameterized TypeScript stubs for `002-setup-session`. They use the existing
root Cucumber layout rather than introducing a second step-definition directory. Each stub throws a
`Pending:` error; replace it with the required setup, interaction, or assertion one step at a time.
Quoted values use `{string}` parameters. Unused typed parameters are prefixed with `_` until implemented.

`cucumber.mjs` loads session features and stubs only when `CUCUMBER_SESSION=1`. Run the session scaffold
from the repository root:

```sh
pnpm test:bdd:session
```

Use `pnpm test:bdd:dry` to check combined discovery and `pnpm test:bdd` for the tenant acceptance suite.
Dry runs do not prove implementation; the session suite must fail until its bindings and implementation
are complete. Use real request/store integration for ordering, cookie protections, expiry, and failures;
do not add diagnostic UI. Keep per-scenario state isolated and preserve existing tenant bindings and
resource cleanup.

Scaffold validation matched every step across 94 expanded cases to exactly one definition (85 existing,
76 new). An isolated Cucumber run of the new bindings produced 42 expected failing scenarios and no undefined
steps. It used dependencies already installed in the main checkout because this worktree lacks its own
installed dependencies; application hooks and runtime behavior were not exercised.
