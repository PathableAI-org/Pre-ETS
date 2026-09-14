# Quickstart: Validate Tenant Resolution

**Status**: Implemented on 2026-09-14. Runtime is Node 24.21.0 and pnpm 12.4.1. Cucumber
runs from the repository root (`pnpm test:bdd:dry`, `pnpm test:bdd`), not the frontend
workspace. This increment is not deployment-ready: production ingress must still present
the original `Host` header. T031 (independent human walkthrough) remains pending.

Run commands from the repository root. Use Node from `.node-version` and pnpm from `package.json`.
Install with `pnpm install --frozen-lockfile`. No database, Compose, backend server, login, or real
tenant data is required. Stop each server before starting the next profile; they share the normal
frontend build directory.

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

Root scripts:

- Frontend `test:unit`: `vitest run --config vitest.config.ts` (23 tests passed)
- `test:bdd:dry`: `cucumber-js --config cucumber.mjs --dry-run` (52 scenarios / 480 steps discovered; no undefined steps)
- `test:bdd`: production partition then remaining (`@production` then `not @production`)

Recorded 2026-09-14 on Node 24.21.0 / pnpm 12.4.1 / Next.js 16.3.5:

| Gate                                                         | Result                                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `pnpm --filter @pathableai/pre-ets-frontend test:unit`       | 23 passed                                                                              |
| `pnpm test:bdd:dry`                                          | 52 scenarios discovered                                                                |
| Fresh `pnpm --filter @pathableai/pre-ets-frontend build`     | ~3.2s after a warm compile; first build ~5.4s                                          |
| Production Cucumber (`@production`)                          | 27 passed in 7.622s                                                                    |
| Remaining Cucumber (`not @production`)                       | 25 passed in 24.231s                                                                   |
| Full `pnpm test:bdd`                                         | 52 passed, 32.70s wall clock                                                           |
| Rebuild after development + `Host: springfield.pathable.com` | HTTP 200, `Cache-Control: private, no-store`, body contains `Tenant: Springfield Demo` |

HTTP/1.1 requests with no `Host` header are rejected by Node before Next (400). The missing-host
acceptance case sends HTTP/1.0 so the application can return 403. Next.js development overwrites
successful document `Cache-Control` to `no-cache, must-revalidate` for HMR; production and all
mapped 403/500/503 bodies serve `private, no-store`. Occupied test ports refuse reuse; each
scenario owns its process. Process reuse was not added (full suite is under a minute).

```sh
pnpm exec playwright install chromium
pnpm --filter @pathableai/pre-ets-frontend test:unit
pnpm test:bdd:dry
pnpm build
pnpm test:bdd
```

Playwright is used as a library inside Cucumber steps. Production HTTP requests connect to
loopback with Host headers. Production browser cases map `*.pathable.com` to loopback. Never
navigate to live production tenants. On CI, Quality runs Vitest; Build installs Chromium with
`pnpm exec playwright install --with-deps chromium` and runs `pnpm test:bdd` after `pnpm build`.

## 6. Repository gates and completion evidence

Recorded 2026-09-14 after lint fixes then formatting:

```sh
pnpm typecheck
pnpm build
pnpm lint
pnpm format:check
pnpm check:unused
```

All five passed. Feature tests: 23 Vitest cases and 52 Cucumber cases passed. Do not commit `.next`,
browser reports, test results, or local environment files. Passing type/lint/build checks alone is
not evidence that the workflows work; the partition results and production known-tenant request above
are. Ingress must still supply the original Host. This is not a deployment-readiness claim.

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
