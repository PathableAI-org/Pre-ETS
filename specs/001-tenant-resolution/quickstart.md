# Quickstart: Validate Tenant Resolution

**Status**: Planned validation guide. The tenant settings and test scripts below are not implemented yet. Run this
workflow after implementation; this planning pass has not demonstrated runtime success.

Run commands from the repository root. Use Node from `.node-version` and pnpm from `package.json` (currently 24.21.0
and 12.4.1). Install with `pnpm install --frozen-lockfile`. No database, Compose, backend server, login, or real tenant
data is required. Stop each server before starting the next profile; they share the normal frontend build directory.

## 1. Local host association

In one terminal, start the frontend with two synthetic known records:

```sh
TENANT_RESOLUTION=host \
TENANT_CONFIG_RECORDS_JSON='[{"slug":"springfield","config":{"displayName":"Springfield Demo"}},{"slug":"shelbyville","config":{"displayName":"Shelbyville Demo"}}]' \
pnpm dev:frontend
```

Open `http://springfield.localhost:3000/` and `http://shelbyville.localhost:3000/` in separate browser contexts.
Each landing page must show its own Display Name. Reload and make overlapping requests; neither may show the other
name. `.localhost` browser resolution should reach loopback; if unavailable in the chosen environment, use the HTTP
commands below to test association and record browser validation as incomplete rather than changing production DNS.

In another terminal, check actual refusal status:

```sh
curl --noproxy '*' -i http://127.0.0.1:3000/ -H 'Host: localhost:3000'
curl --noproxy '*' -i http://127.0.0.1:3000/ -H 'Host: unknown.localhost:3000'
curl --noproxy '*' -i http://127.0.0.1:3000/ -H 'Host: a.b.localhost:3000'
```

All three must return 403, not a redirect or successful landing page. Ports do not change tenant identity.
Check source/record validation and host edge cases against [the context contract](contracts/tenant-context.md).

## 2. Local static configuration and a changed name

Stop the host-mode server, then start:

```sh
TENANT_RESOLUTION=static \
TENANT_LOCAL_CONFIG_JSON='{"slug":"springfield","config":{"displayName":"Local Demo"}}' \
pnpm dev:frontend
```

Open `http://localhost:3000/`. Expect `Tenant: Local Demo`. Stop the server, change only the name, and restart:

```sh
TENANT_RESOLUTION=static \
TENANT_LOCAL_CONFIG_JSON='{"slug":"springfield","config":{"displayName":"Updated Local Demo"}}' \
pnpm dev:frontend
```

Reload the landing page. Expect `Tenant: Updated Local Demo`; the old name must not remain. This is the required
visible proof that the configuration read feeds the page. Developers may instead place these values in
`packages/frontend/.env.local`, using the planned `.env.example`; restart after editing. Keep that local file ignored.

Repeat with a valid name containing literal markup-like text such as `<Demo & Training>`: the page must show the text,
not interpret it as markup. Verify readable text with assistive technology and tab to the existing button with visible
focus. See [the landing-page contract](contracts/landing-page.md) for the complete experience criteria.

## 3. Visible local configuration failures

Stop the server and start with no usable static record:

```sh
TENANT_RESOLUTION=static TENANT_LOCAL_CONFIG_JSON='' pnpm dev:frontend
```

Opening `http://localhost:3000/` must produce a visible configuration error and status 500, directing the developer to
supply the record and restart. It must not display a tenant or use host data. Repeat with a record whose Display Name
is whitespace-only, and with malformed JSON. These intentionally failing cases also belong in Cucumber coverage; its server readiness check must allow an
intentional 500 response rather than wait for a successful page.

## 4. Production-build status and bypass checks

Stop the development server. Build using existing repository commands; build must not need tenant data:

```sh
pnpm build
```

Then run the built frontend with explicit synthetic records. Deliberately supply the static-mode setting to prove
it cannot disable production host association:

```sh
TENANT_RESOLUTION=static \
TENANT_LOCAL_CONFIG_JSON='{"slug":"local-demo","config":{"displayName":"Must Not Be Used"}}' \
TENANT_CONFIG_RECORDS_JSON='[{"slug":"springfield","config":{"displayName":"Springfield Demo"}},{"slug":"shelbyville","config":{"displayName":"Shelbyville Demo"}}]' \
pnpm start:frontend
```

All requests below connect only to loopback; the Host header exercises the production pattern without visiting an
external site:

```sh
curl --noproxy '*' -i http://127.0.0.1:3000/ -H 'Host: springfield.pathable.com'
curl --noproxy '*' -i http://127.0.0.1:3000/ -H 'Host: shelbyville.pathable.com'
curl --noproxy '*' -i http://127.0.0.1:3000/ -H 'Host: unknown.pathable.com'
curl --noproxy '*' -i http://127.0.0.1:3000/ -H 'Host: pathable.com'
curl --noproxy '*' -i http://127.0.0.1:3000/ -H 'Host: www.pathable.com'
curl --noproxy '*' -i http://127.0.0.1:3000/ -H 'Host: a.b.pathable.com'
curl --noproxy '*' -i http://127.0.0.1:3000/ -H 'Host: localhost:3000'
```

The first two return successful documents containing the matching Display Name. The remaining requests return 403,
with no tenant name or redirect. No result may use `Must Not Be Used`. Confirm success/refusal responses cannot be
shared-cacheable. Repeat known requests concurrently against this same process.

Attempt competing tenant selectors:

```sh
curl --noproxy '*' -i 'http://127.0.0.1:3000/?tenant=shelbyville' \
  -H 'Host: springfield.pathable.com' \
  -H 'X-Forwarded-Host: shelbyville.pathable.com' \
  -H 'x-preets-tenant-slug: shelbyville' \
  -H 'x-preets-tenant-origin: local-static'
```

Expect Springfield's name. Repeat with `Host: unknown.pathable.com`; expect 403. Internal tenant headers must not
appear as application response headers. Production HTTP cases also cover RSC/prefetch variants so those request
forms cannot bypass the boundary. The browser/HTTP test suite supplies protocol-valid cases; malformed wire messages
rejected by Node before Next are documented separately from application 403 handling.

## 5. Automated feature verification

Implementation adds frontend scripts:

- `test:unit`: `vitest run --config vitest.config.ts`
- `test:bdd:dry`: `cucumber-js --config cucumber.mjs --dry-run`
- `test:bdd`: `cucumber-js --config cucumber.mjs --tags '@production' && cucumber-js --config cucumber.mjs --tags 'not @production'`

The Cucumber configuration loads root `features/*.feature` and frontend ESM TypeScript step/support files.
Scenario Given steps choose development/production, host/static mode, and synthetic records; there is no separate
`TENANT_E2E_PROFILE` setting. Cucumber hooks own server/browser cleanup. Execute scenarios serially, with isolated
World state and no existing-server reuse. Restart scenarios perform their own initial visit and restart rather than
relying on another scenario. The two disjoint partitions cover all 52 expanded cases, including lower-layer contract steps. Run production cases before development touches `.next`; fully terminate production processes before the second partition. Rebuild before every full suite, and never start production against output touched by development. Record both partition counts and full-suite wall-clock duration, with build duration separately. During scaffolding prove build → production cases → development cases → rebuild → production known-tenant request with the pinned Next version. See the plan for the assertion-layer matrix; pure return values never count as live-page evidence.

After the planned dependencies/scripts exist:

```sh
pnpm --filter @pathableai/pre-ets-frontend exec playwright install chromium
pnpm --filter @pathableai/pre-ets-frontend test:unit
pnpm --filter @pathableai/pre-ets-frontend test:bdd:dry
pnpm build
pnpm --filter @pathableai/pre-ets-frontend test:bdd
```

Dry-run checks scenario/step discovery; it does not prove behavior or replace the full suite. During scaffolding,
stubs must remain non-passing. Before completion, every example must execute successfully with no pending, undefined,
ambiguous, or skipped acceptance work presented as passed.

Playwright is used as a library inside Cucumber steps; no Playwright Test runner configuration is required. Production
HTTP requests connect to loopback with Host headers. Production browser cases require test-browser hostname mapping
to loopback; local browser cases use `.localhost`. Never navigate to live production tenants. Readiness uses bounded
process/listener checks and tolerates intentional 403/500 outcomes; teardown must also run after failed steps.
On CI install Chromium with `playwright install --with-deps chromium`, then run `test:bdd` after the production build.

Unit coverage must include the full contract matrix: mode defaults/invalid values, source failures/mismatches,
invalid Display Name, duplicate slug, same-name distinct tenants, no fallback, and exactly one binder invocation in
host resolution. Vitest uses a Node environment and discovers only `tests/unit/**/*.test.ts`; keep framework-only
modules out of these pure unit targets. Include `vitest.config.ts` and tests in normal strict typechecking, which
remains a separate gate. Cucumber support files are loaded by Cucumber, not Vitest.

## 6. Repository gates and completion evidence

Run the existing checks, plus the feature commands above:

```sh
pnpm typecheck
pnpm build
pnpm lint
pnpm format:check
pnpm check:unused
```

If fixes are needed, apply lint fixes before formatting. Before a commit, preserve the normal Husky/lint-staged
protections and single `check:changes` audit. Record actual test results and any unmet browser/deployment conditions.
Do not commit `.next`, browser reports, test results, or local environment files.

Success evidence includes matching landing-page names, actual rejection statuses, absence of cross-tenant names
under overlapping requests, updated static name after restart, and readable/keyboard-compatible presentation.
Passing type/lint/build checks alone is not evidence that these workflows work.

### Independent developer walkthrough (SC-003)

One developer follows sections 1–2 independently using the documented commands, then changes Display Name and restarts. Record actual outcomes below before completion; automation that directly supplies fixtures is insufficient. Correct unclear instructions and repeat affected steps. This record is pending, not a claim of validation already performed.

| Evidence                                                     | Result  |
| ------------------------------------------------------------ | ------- |
| Developer, date, OS, Node/pnpm versions                      | Pending |
| Host-mode setup: matching name and unknown/bare-host refusal | Pending |
| Static-mode setup: supplied name on localhost                | Pending |
| Changed Display Name and restart: updated visible name       | Pending |
| Instruction corrections and repeated-step results            | Pending |

Unsupported `TENANT_RESOLUTION` values retain host mode and report `invalid-mode` with accepted-mode guidance; use `host` or development-only `static`, then restart. Bare localhost still fails in host mode. Missing/invalid data in selected static mode remains a configuration error.
