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

## Bindings

Step definitions in `tenant.steps.ts` drive the owned Next.js test process, Playwright
page/HTTP requests, and injected contract helpers. Assertions read typed evidence on
`TenantWorld`. Pending, undefined, and ambiguous steps must not be treated as passing.
