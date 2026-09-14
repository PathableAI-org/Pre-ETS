# Research: Tenant Resolution

**Date**: 2026-09-13
**Scope**: Phase 0 decisions for [spec.md](spec.md), including the Display Name clarification.
**Status**: Research complete; implementation and runtime verification have not started.

## Repository evidence

- `package.json` and `.node-version` select pnpm 12.4.1 and Node 24.21.0; TypeScript is 6.0.3.
  The root README now matches pnpm 12.4.1; `package.json` remains the canonical package-manager version.
- `packages/frontend/package.json` has Next 16.3.5, React 19.3.0, and PathAble React 0.0.5.
  There is no test script, tenant module, database client, or authentication implementation.
- `packages/frontend/src/app/page.tsx` is a Server Component using PathAble layout, text, and button components.
  The Display Name addition needs no browser state or event handler.
- `.specify/memory/constitution.md` is version 1.0.0. Frontend owns tenant configuration; backend owns domain records.
- The installed PathAble `agent-guidance/pathable-react/SKILL.md`, its `references/server-and-client.md`,
  and public `Text` declarations support a presentational text addition without a client boundary.

## 1. Establish tenancy before rendering

**Decision**: Use `packages/frontend/src/proxy.ts` as the only host-binding entry point. Its orchestration calls
an independent host parser and configuration reader, then either forwards established identity or returns a direct
403/500/503 response. It applies to application HTTP requests, including HTML, RSC, prefetch, and asset requests;
do not add prefetch-header or file-extension bypasses. No new public endpoint is needed.

**Rationale**: Actual status is part of acceptance. Refusing before rendering avoids streamed content committing a
successful status. The parser itself never performs configuration access. Installed Next request-header forwarding
and direct-response support fit this split.

**Alternatives considered**: Page-only rejection risks late failure; `notFound()` violates the approved 403 outcome;
`forbidden()` remains experimental. A custom server introduces unnecessary infrastructure.

**Sources**: [Next Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy),
[Next forbidden](https://nextjs.org/docs/app/api-reference/functions/forbidden);
installed `next/dist/server/web/spec-extension/response.js` and `next/dist/client/components/forbidden.js`.

## 2. Select one trusted host input

**Decision**: Read `Host` directly. Ignore forwarded-host, forwarded, path/query tenant selectors, and caller tenant
context headers. Production suffix is `pathable.com`; development suffix is `localhost`. Require one tenant label;
normalize ASCII host case, remove a valid numeric port, and reject malformed authorities, trailing dots, extra labels,
reserved `www`, and nonmatching suffixes. Slugs are canonical lowercase DNS labels.

**Rationale**: A configured server hostname can affect Next's constructed URL. Reading the chosen authority explicitly
avoids accidentally binding from another input. An ingress deployment must preserve or replace Host with the validated
original authority and prohibit access that bypasses that ingress policy. This is a deployment prerequisite, not new
proxy infrastructure in this slice.

**Alternatives considered**: Trusting the first available forwarded header gives callers another selector. Arbitrary
host-suffix configuration expands scope; two documented environment patterns suffice.

**Sources**: `docs/multi-tenancy.md`; installed `next/dist/server/lib/router-utils/resolve-routes.js` and
`next/dist/server/base-server.js`, inspected during boundary research.

## 3. Keep the first configuration source explicitly non-durable

**Decision**: Define one asynchronous `readTenantRecord(slug)` contract and a static implementation supplied by
server environment JSON. `TENANT_CONFIG_RECORDS_JSON` contains an array of records with separate `slug` and
`config: { displayName }`. An absent value means an empty known-tenant set, not a built-in tenant. Invalid JSON,
duplicate slugs, or malformed records are configuration errors. No durable provider is chosen or built.

**Rationale**: A configured source makes known/unknown behavior and the landing page demonstrable now, without
pretending production persistence exists. Consumers depend on the read contract. The same explicit synthetic records
can exercise a production build; they are not a fallback for unknown hosts.

**Alternatives considered**: A database contradicts scope. Hard-coded production demo tenants would silently add
known tenants. A provider registry, repository class hierarchy, and schema library are unnecessary for this shape.

**Sources**: Approved assessment decision and spec FR-005/FR-006; frontend ownership in the constitution.

## 4. Make local mode explicit and easy to reproduce

**Decision**: `TENANT_RESOLUTION=host|static`, default `host`. `static` is honored only under `NODE_ENV=development`.
In production, `static` cannot disable association: use production host rules and ignore the local record. Other
unrecognized mode values retain host association and emit the safe `invalid-mode` diagnostic; they never select local static data or cause a mode-only HTTP 500. Static mode uses `TENANT_LOCAL_CONFIG_JSON`, one record
of the same shape, and never consults the host to choose its tenant. Missing local data is a visible 500, not 403
or a default tenant. Read settings lazily at request time so build/type generation needs no tenant configuration.
Treat environment records as immutable for the process lifetime; restart after changes.

**Rationale**: Developers can put ordinary server-only variables in `packages/frontend/.env.local`, change Display Name,
and restart. No editor UI, fixture loader framework, host-file change, or database is required.

**Alternatives considered**: Implicit bypass on `localhost` makes failed binding become a default. Browser storage,
query strings, and public environment variables create competing tenant selection paths.

**Sources**: [Next environment variables](https://nextjs.org/docs/app/guides/environment-variables) documents project-root
`.env` loading and server-only variables. Here the Next project root is `packages/frontend`, not repository root.

## 5. Forward identity, then expose one server-only current-context accessor

**Decision**: Proxy removes all inbound `x-preets-tenant-*` headers and sets only slug and origin request headers.
`getCurrentTenant()` reads those headers, validates them, and reads matching configuration through the source contract.
It is a single exported React-cached Server Component accessor. `getCurrentTenantConfig()` delegates to it. No consumer
parses Host, calls the static provider directly, or stores a mutable global current tenant.

The proxy validates configuration before rendering to establish known-tenant/error status. The accessor's second
read is against the same immutable process configuration, validates slug equality, and is memoized within the render
request. This duplicates a small static lookup, not host determination. It must not be carried unexamined into a
future remote/durable provider; that feature must revisit snapshot consistency and read cost.

**Rationale**: Only a short canonical slug and a closed origin value cross the internal header boundary. Display Name
can contain Unicode and punctuation without header encoding or size constraints. The current slice has no source
writes, so this avoids a full configuration transport protocol.

**Alternatives considered**: Serializing configuration into headers adds encoding/size policy for no present need.
A process-global current tenant leaks across requests. Re-parsing Host in each consumer breaks single determination.

**Sources**: [React cache](https://react.dev/reference/react/cache) limits this memoization to server rendering and
resets it per request. [Next headers](https://nextjs.org/docs/app/api-reference/functions/headers) provides request access.
No persistent tenant-output cache is planned. Route handlers added later must receive explicit context instead of
assuming Server Component memoization works outside rendering.

## 6. Define the visible result and failure contract

**Decision**: Add a PathAble `Text` immediately after the existing landing-page heading, showing `Tenant: {Display Name}`
as an ordinary text child. Keep the existing heading and keyboard path. Display Name is the only configuration field;
slug remains identity. Reject missing/non-string/blank names; preserve valid text, including markup-like characters.
No HTML injection, name uniqueness, localization system, or branding editor is introduced.

Errors returned before rendering are plain UTF-8 text: 403 for invalid/unknown tenant, 500 for invalid settings/config,
and 503 for source unavailability. Production messages are generic; local static failures identify how to supply a
valid record. Internal logs distinguish categories without recording configuration payloads or raw headers.

**Rationale**: The name is the actual acceptance outcome, not a diagnostic dump. Plain-text refusal is sufficient for
this small slice and does not require a new error-page product experience.

**Alternatives considered**: A slug fallback masks missing configuration. A new client component, tenant switcher,
or custom visual component does not answer this requirement.

**Sources**: Spec clarification, FR-015/FR-016, and the installed PathAble guidance cited above.

## 7. Execute Gherkin with Cucumber and drive browsers with Playwright

**Decision**: The user's 2026-09-13 direction replaces the earlier Playwright Test runner choice with
frontend-owned `@cucumber/cucumber` plus the `playwright` library. Vitest is selected for pure lower-level
checks. Root Gherkin files are executed directly by Cucumber; browser/HTTP steps use Playwright, and contract steps
use injected pure modules. No parallel handwritten Playwright Test suite is introduced.

**Rationale**: The installed BDD scaffold selects Cucumber for a package.json project. Cucumber supplies the
step/scenario lifecycle; the browser library supplies interactions. Test support stays frontend-owned and ESM,
adapting the extension's generic CommonJS example. Cucumber uses Node ESM loading for erasable TypeScript support files, while Vitest transforms unit tests; strict typechecking covers both; compatibility must be demonstrated with the selected pinned versions during scaffolding.

Cucumber World holds per-scenario state. Hooks and scenario Given steps manage owned test servers, readiness,
restart, and cleanup; Playwright Test's webServer/fixture behavior is not available under this runner. Run scenarios
serially, preserving deliberate concurrency within isolation scenarios. A listener can be ready while intentionally
returning 403 or 500; bound readiness waits and check child-process failures. No arbitrary server reuse is allowed. Following critique E2, run the `@production` partition before `not @production`, using a fresh build before each full suite; development output is never reused to start production. Validate the build/production/development/rebuild lifecycle with the pinned runtime and record suite duration during scaffolding. The plan evidence matrix separates pure contract and response-adapter assertions from live-page results.

**Alternatives considered**: Keeping Gherkin as documentation loses the extension's executable workflow. Adding
Cucumber alongside duplicate Playwright Test scenarios doubles acceptance maintenance. The user selected Vitest for unit testing; retaining a parallel native Node test runner is unnecessary. Scaffold paths are adapted to the frontend workspace instead of adding root runtime dependencies.

**Sources**: Installed `.agents/skills/speckit-bdd-scaffold/SKILL.md`;
[Cucumber ESM support](https://github.com/cucumber/cucumber-js/blob/main/docs/esm.md),
[Cucumber World](https://github.com/cucumber/cucumber-js/blob/main/docs/support_files/world.md),
[Playwright library](https://playwright.dev/docs/library),
[Node 24 TypeScript](https://nodejs.org/docs/latest-v24.x/api/typescript.html).

## 8. Resolve governance and strategy discrepancies

**Decision**: Preserve the approved local static mode as a narrowly scoped development exception to the constitution's
literal every-request host-binding rule. Authorization is the user's recorded enable/disable answer in
`.specify/assessments/tenant-resolution/intake.md`, the approved Option B handoff, and the active specification.
The exception applies only to local configuration/landing-page development; it is not host binding, authentication,
a session guarantee, or permission to bypass production tenancy. Revisit/remove this exception when a later feature
requires host-bound authentication/session behavior in this mode. Record it in the implementation review; do not
silently amend the constitution in this planning command.

Synchronize `docs/multi-tenancy.md` from not-found to 403 and document the current static source/local modes. Align the
unknown-tenant sentence in `docs/authentication.md` without implementing login. In `docs/docker-compose.md` and
`docs/domain-persistence.md`, distinguish the future durable configuration strategy from this Display Name-only slice.

**Rationale**: The explicit scope decision resolves behavior; it must not be hidden by claiming local static data was
host-derived. Future store/session architecture remains intact.

**Alternatives considered**: Dropping static mode would reverse the approved decision. Generalizing the exception to
production would violate isolation. Implementing planned stores or auth now would exceed scope.

## Research completion

All design questions have decisions above. No unresolved clarification blocks Phase 1. Future durable storage,
actual deployment ingress configuration, authentication, and broader operational capacity are outside this slice;
the stated deployment trust prerequisites still require verification before deployment.

## 9. Use Vitest for lower-level tests

**Decision**: Per the user's latest instruction, replace the native Node unit-test runner with frontend-owned Vitest.
Use a dedicated `vitest.config.ts`, Node environment, explicit unit-test include, and a non-watch `vitest run` script.
Cucumber and Playwright retain their acceptance roles. No Vitest browser mode or DOM emulator is introduced.

**Rationale**: This follows the requested test-stack choice while keeping unit and acceptance discovery separate.
Maintain strict TypeScript checking independently of executing tests. Pin compatible tooling versions during setup.

**Alternatives considered**: Keeping native Node tests alongside Vitest duplicates the unit runner. Moving Gherkin
into Vitest would undo the adopted Cucumber workflow.

**Sources**: [Vitest guide](https://vitest.dev/guide/) and [configuration reference](https://vitest.dev/config/).

## Review refinements

The mode policy uses a pure selector returning effective mode and optional safe diagnostic metadata. Server-only settings emit that fixed record to stderr during lazy initialization; Cucumber captures the pure result and adapter tests capture the warning sink. No diagnostic travels through the page or HTTP response. See the context contract for the exact payload and initialization scope.

Implementation must add and pin `server-only` as a frontend runtime dependency before introducing the planned marker imports. Vitest, Cucumber, and Playwright remain frontend development dependencies. The root README now matches the manifest's pnpm version, and CI Chromium installation is explicitly scoped to the frontend workspace.
