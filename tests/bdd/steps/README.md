# Step Definitions

**Detected framework:** `@cucumber/cucumber` (TypeScript ESM at the repository root)

These bindings cover the platform as a whole. Root `features/*.feature` files are the Gherkin
inputs, and Cucumber loads support code through `cucumber.mjs`.

## Running scenarios

From the repository root:

```sh
pnpm test:bdd:dry
pnpm test:bdd
```

`test:bdd:dry` discovers every scenario without executing steps. `test:bdd` runs the `@production`
partition first, then `not @production`, writing distinct JSON reports under `reports/`.

## What to implement

All stubs throw `Error` with a `Pending:` prefix. Replace each one with:

1. Application interaction (owned test process, Playwright page/HTTP request, or injected contract)
2. An assertion against the matching evidence on `TenantWorld`

Implement one step at a time, re-running dry discovery and then the relevant partition after each
change. Pending, undefined, and ambiguous steps must not be treated as passing.
