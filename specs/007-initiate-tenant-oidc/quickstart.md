# Validate session-missing initiation

Run after implementation. These are expected observations, not executed evidence. The session-presence capability
always reports absence in this feature. Root redirects before request-tenant lookup; login resolves the tenant.
Redis, correlation cookies, callback consumption and actual stored sessions are outside this increment.

## Prerequisites and checks

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @pathableai/pre-ets-frontend test:unit
pnpm lint:gherkin
pnpm format:gherkin:check
pnpm test:bdd:dry
pnpm typecheck
pnpm build
pnpm lint
pnpm check:unused
pnpm format:check
pnpm check:changes
```

Expect consumer/protocol properties and named failure examples to pass. Dry discovery demonstrates parsing and
bindings, not browser/provider behavior. No Redis/persistence test should be required by the new capability.
The existing E2E directory has no active Keycloak journey; `pnpm test:e2e` provides no replacement evidence.

Preserve any existing gitignored root `.env`; supply required Compose credentials using the existing
[README](../../README.md#local-external-services). Compose resolves the whole model's variables even when only
Keycloak is started. Use actual `compose.yaml`, not historical prose claiming already-implemented login/sessions.

```sh
docker compose up -d --wait keycloak
curl --fail --retry 20 --retry-connrefused --retry-all-errors --retry-delay 1 --max-time 5 \
  -sS -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:8080/realms/pre-ets/.well-known/openid-configuration
docker compose --profile observability up -d --wait otel-lgtm
```

Expect HTTP 200 discovery and healthy requested services. Do not start or stop Redis for this feature or reset a
shared realm/volume. Inspect exact callback registrations if a previously initialized realm differs from the file.

## Static-mode browser success and empty session behavior

From the root, in one owned terminal (proposed new settings work only after implementation):

```sh
unset OTEL_SDK_DISABLED
TENANT_CONFIG_DIR="$PWD/fixtures/tenant-config" \
TENANT_RESOLUTION=static \
TENANT_STATIC_ALIAS=springfield \
OIDC_CALLBACK_ORIGINS_JSON='{"springfield":"http://localhost:3000"}' \
OIDC_ALLOW_INSECURE_LOOPBACK=true \
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
pnpm --filter @pathableai/pre-ets-frontend exec next start --hostname 127.0.0.1 --port 3000
```

Use a fresh/private browser and open `http://localhost:3000/`. Expect automatic navigation:

1. Root checks session presence and responds 307 to `/auth/login`, without a tenant read or protected welcome body.
2. Login resolves Springfield and responds 307 to its configured provider. There is no extra login control or
   application credential form. Inspect Network for selected client `springfield-web`, callback
   `http://localhost:3000/auth/callback`, code/openid/S256, state/nonce and `max_age=0`.
3. No application session or correlation cookie is issued by either application response. Keycloak can set its
   own provider cookies; those do not change the application's always-empty session result. Revisit `/` and
   observe the same delegation even with arbitrary/present browser cookies.
4. Optionally authenticate using the tracked realm's synthetic account. Return lands at the public callback
   fallback, never an authenticated application view. Context was not saved; no callback acceptance is supported.
   Reaching the provider, returning a code or existing SSO is not application freshness/session evidence.

Capture responses privately without following external redirects:

```sh
umask 077
preets216_capture=$(mktemp -d /tmp/preets216-capture.XXXXXX)
curl -sS -D "$preets216_capture/root.headers" -o /dev/null http://localhost:3000/
curl -sS -D "$preets216_capture/login.headers" -o /dev/null http://localhost:3000/auth/login
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H 'Cookie: untrusted=fabricated' http://localhost:3000/
```

Expect the two distinct 307 responses, dynamic no-store behavior, and no new application `Set-Cookie`. The fabricated
cookie does not create usable authentication. Raw provider redirect headers carry correlation data; keep them
local/temporary and record only sanitized outcomes.

## Host selection and tenant failure ordering

Stop only the owned frontend, then restart with the same common OTel/config settings and:

```sh
TENANT_CONFIG_DIR="$PWD/fixtures/tenant-config" \
TENANT_RESOLUTION=host \
BASE_HOSTNAME=localhost:3000 \
OIDC_CALLBACK_ORIGINS_JSON='{"springfield":"http://springfield.localhost:3000","shelbyville":"http://shelbyville.localhost:3000"}' \
OIDC_ALLOW_INSECURE_LOOPBACK=true \
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
pnpm --filter @pathableai/pre-ets-frontend exec next start --hostname 127.0.0.1 --port 3000
```

Open Springfield, Shelbyville, then Springfield under `.localhost:3000`. Root always performs the same session
routing. Each subsequent login request selects its own client/callback with no cross-tenant substitution. This
literal base includes the port so current raw Host selection matches; do not strip ports or change tenant parsing.
If local browser resolution is unavailable, use static browser verification and `curl --resolve` for host HTTP;
record the browser isolation limitation.

| Condition                                            | Raw root response | Login response / browser outcome                                                |
| ---------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------- |
| Valid configured tenant                              | 307 `/auth/login` | 307 correct provider, no app/correlation cookie                                 |
| Host-mode unknown/out-of-pattern Host                | 307 `/auth/login` | Actual 404 and ordinary missing-page browser presentation; no provider fallback |
| Unreadable/malformed selected file                   | 307 `/auth/login` | Actual ordinary 404 in either mode                                              |
| Unavailable directory / missing static file          | 307 `/auth/login` | Actual 500 without fallback                                                     |
| Missing alias in valid callback map                  | 307 `/auth/login` | Public sign-in failure, no default callback/provider substitution               |
| Provider discovery unavailable / metadata unsuitable | 307 `/auth/login` | Bounded public sign-in failure; no protected content                            |

Use owned temporary tenant directories and restart the owned frontend for failure checks; never mutate shared
fixtures or stop another task's provider. A valid directory setting can point to an unavailable path, letting the
first-hop/session test distinguish request lookup ordering. Invalid process settings still prevent startup.

For static mode, request login with known/unknown/unresolvable Host values and forged forwarded-host/protocol or
return-query values: selection and callback origin remain the configured tenant's. Do not treat root 307 as proof
of static tenant selection; that assertion belongs to login/diagnostic work.

The provider deadline is a five-second bound on preparation after tenant resolution. Controlled public-service
tests must demonstrate cancellation of stalled discovery and distinguish timeout from caller interruption; ordinary
provider refusal can fail sooner. The local HTTP switch must still reject external HTTP destinations and discovery
redirects, rather than becoming a general TLS bypass. These tests observe preparation outcomes, not telemetry.

## Public routes and requirements BDD

Direct `/auth/callback` and `/login-unavailable` remain public without initiation loops. Callback fallback grants
no access. Check error/retry navigation with Tab/Enter, visible focus, accessible names and AT reading if UI changes.
Diagnostic `/_test/tenant-config` still returns complete independently expected JSON, no-store and actual 404/500,
with no login/session cookie. Existing preview environment gating and its explicit tenant checks remain intact.
Required safe assets still load without protected data.

After adding the planned executable partial features, run:

```sh
pnpm test:bdd
pnpm test:bdd:checks
```

The implementation must first update the BDD application environment: scenario-owned callback origins for both
tracked clients and `OIDC_ALLOW_INSECURE_LOOPBACK=true` for local Keycloak. Do not rely on the harness's old
`BDD_ALLOW_LOOPBACK_HTTP` or inherited machine OIDC settings. Its random physical Next port and logical
`example.test` Host do not change the callback map: use the existing registered
`http://springfield.localhost:3000` / `http://shelbyville.localhost:3000` origins. No callback listener is needed for
these initiation scenarios; stop at provider arrival. Missing-map cases supply their own explicit map.

For local successful-delegation BDD, start Keycloak and confirm realm discovery using the prerequisite commands
above before running the suite. Provider setup/readiness is outside product steps. Independently exercise root
routing, invalid tenants and diagnostics with provider unavailable: those outcomes must not become provider-dependent.

For nightly execution, the implementation must update the existing main-only workflow to start an owned ephemeral
Keycloak container from the Compose-pinned image, import the tracked realm after checkout, and wait for realm
discovery before requirements execution. Confirm bounded readiness failure yields useful diagnostics and that
cleanup runs even after failures. Keep the schedule, dispatch restrictions, Redis service, report preservation and
independent smoke behavior. A workflow run after implementation is needed to verify this setup; local passing
HTTP or dry discovery alone does not establish CI/provider readiness.

Use the full existing suite's documented infrastructure prerequisites where still applicable; it does not make
Redis a new initiation dependency. Root-delegation scenarios carry SESSION-001/004; login selection/failure carries
its supported session/tenant IDs. Preserve actual status observations while following at most the one documented
same-origin hop. Do not globally change status-step meaning or add a test-only authentication bypass.

Existing browser interception forwards every URL to Next and `route.fetch` can follow redirects internally.
Update it where needed to preserve logical Host per application hop, let the browser follow navigation, and avoid
swallowing external provider navigation. Keep ordinary missing-page comparison and unrelated absent-path behavior.
No BDD step reads Redis/session stores or runs a mock provider. `@partial` does not skip undefined/failing steps.

## Expected logs and exported OTel data

Open `http://127.0.0.1:3300` with an authorized session. Anonymous Viewer cannot use Explore; use the local image's
documented login if needed. In Explore → Tempo select service `pre-ets-frontend` and the request time range;
allow approximately 30 seconds for batch export. Leave `OTEL_SDK_DISABLED` absent, not the string `false`.

| Observation                       | Expected evidence                                                                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw root request                  | Request method/route/307; session-presence miss operation if instrumented. No request-tenant read or provider-preparation operation in that request trace.     |
| Login success                     | Separate request trace with tenant read and meaningful `AuthenticationService.prepare` boundary; selected-provider request preparation only.                   |
| Invalid tenant login              | Actual login 404/500 and existing safe tenant failure category; no provider preparation success. Root's preceding trace remains 307 with no tenant read.       |
| Provider preparation failure      | Safe bounded category in the preparation span/local diagnostics; browser reaches public sign-in error. Do not require HTTP 500 for a handled provider failure. |
| Public diagnostics/callback/error | Their own HTTP observations and tenant reads only when the route needs them; no root session gate or automatic provider initiation.                            |

Bootstrap `Tenant resolution ready` is not a request-tenant lookup. Inspect actual per-request parent/child spans,
not aggregate process logs, when checking ordering. Proposed operation names describe useful boundaries, not a
permanent test inventory. Accept Next method keys `http.request.method`/`http.method`, route keys
`http.route`/`next.route`, and status keys `http.response.status_code`/`http.status_code` where emitted.
Root and redirected login are separate request traces unless actual propagation establishes otherwise.

There must be no Redis issuance/store activity, correlation-cookie issuance, session-created, authenticated-access,
callback-success or freshness-confirmed signal from this increment. Inspect local logs and complete exported
attributes/events/error descriptions, including automatic URL attributes, for unsafe Cookie/Authorization values,
state/nonce, PKCE verifier, full redirect/callback queries, tokens, credentials or raw upstream error payloads.
They must not leak. Fix unsafe automatic capture at the existing instrumentation boundary; do not add another
exporter or retained telemetry assertions. Browser protocol parameters and exported telemetry are distinct channels.

The existing setup exports Next Node traces through one Vercel exporter and Effect's global bridge. Do not expect
browser/Keycloak/backend spans, exported application logs, metrics or a cross-provider trace. A collector outage
must not grant access or crash an otherwise successful request. Verify observability with temporary/ad hoc probes
and real samples only; no durable in-memory logger/tracer tests.

## Record results and cleanup

Record implementation revision, mode, sanitized origin/client expectations, separate first-hop and login statuses,
browser outcomes, exported trace IDs and bounded safe failure summaries, commands and limitations. Leave Redis
transactions, callback validation, real session lookup/storage, positive-session tenant matching, verified freshness,
Microsoft/broker compatibility and production ingress explicitly outstanding.

Stop only owned processes; remove owned temporary captures/tenant fixtures/probes. Leave pre-existing Compose
services running. Do not commit generated output, raw protocol captures or credentials.

## Implementation baseline

Implementation branch: `007-initiate-tenant-oidc-impl`, stacked on PR #227 branch
`154-initiate-tenant-oidc` at `cb28548ad69868023bccc3148a25f994dbd7e726`.
On 2026-10-18, refreshed `origin/main` to `a47ec63`; the linked session, tenant and security
requirement directories and session context have no drift from planning baseline `9f83d3b`.
The specification quality checklist has 16 checked items and no unchecked items.
Installed the frozen dependency graph and only the planned `openid-client@6.8.8` addition;
pnpm supply-chain verification passed. Restored the unrelated package-manager edit to
`pnpm-workspace.yaml`. Existing Git/Docker/ESLint ignore policies cover generated artifacts;
private workspaces do not publish npm packages.

### Construction evidence

- Root adapter property failed before implementation in an unusable tenant world
  (seed `-621463101`); the eager layout returned tenant failure instead of delegation.
  The implemented root/layout and login adapters pass their three focused suites
  (10 tests/properties), including retained Proxy behavior.
- Preparation properties and named failures were written before the real Layer;
  the first run failed with the missing Layer. The implemented Layer passed 37
  service tests before later validation refinements. Controlled transport is
  construction evidence, separate from real provider execution.
- The full frontend suite passed 213 tests in 11 files. Chromium harness checks
  passed 2/2, including browser-native root/login 307s, logical Host preservation,
  and an actual external destination. The old interception strategy reproduced a
  DNS failure on a redirected app hop; the scoped browser proxy fixes that transport gap.
- `actionlint .github/workflows/ci-bdd.yml` passed. Locally exercised an owned fresh
  Keycloak startup/import/readiness sequence (ready on attempt 8), bounded failure
  for a missing realm, diagnostic logs and owned-container removal. Chromium is
  installed before the harness checks in CI because that regression uses a real browser.
- The changed-code audit passed with four inherited root-harness complexity warnings
  excluded by its existing gate. No new suppression or weakened gate was introduced.

All successful commands are local evidence at the evolving implementation tree,
not proof of a main-branch nightly run or downstream authentication completion.

### Production HTTP, browser and provider evidence

At the implementation tree on 2026-10-18 (Node `26.2.0`, pnpm `12.14.0`, production
Next build, tracked Keycloak `26.8.1` synthetic realm):

- Requirements execution passed **39 scenarios / 482 steps**, separately from dry
  discovery. Production preview safeguard passed **1 scenario / 7 steps**. Scoped
  requirements-BDD review against `origin/main` `a47ec6379` found no defects in
  requirement tags, partial limits, independent expectations or HTTP/browser boundaries.
- Host-mode raw A/B/A probes returned root **307 `/auth/login`**, then login **307**
  with the independent Springfield/Shelbyville/Springfield client and callback.
  Every provider request carried `max_age=0` and S256. Root and login were no-store
  and issued no application/correlation cookie, including with fabricated cookies.
- An invalid base Host retained root 307 then actual login 404. Existing BDD exercised
  both modes' actual 404/500 matrix and ordinary missing-page browser comparison.
  A separate unavailable-static-directory probe returned root 307 then login 500.
- Callback, sign-in error and full-JSON diagnostic probes returned 200, no-store,
  no redirect and no new cookie. BDD also passed these public routes while the
  tenant's provider was unavailable; existing preview gating passed independently.
- Static-mode probes used arbitrary/forged Host and forwarded authority and selected
  Springfield's configured client. With the collector endpoint unreachable, root
  and successful login still returned their expected 307s with no new cookie.
- Invalid explicit callback-map and boolean settings rejected runtime startup;
  synthetic sensitive input markers were absent from local startup logs.
- Ad hoc Chromium keyboard navigation reached the public “Try again” link with Tab,
  showed a solid 4px focus outline and followed Enter through root into login.
  The browser accessibility tree exposed the error heading and named retry link.
  **Actual screen-reader/assistive-technology execution remains unverified.** No public
  error presentation was changed; keyboard/tree observations do not establish AT behavior.

### Observability inspection and remediation

Real exported root trace `43d3bf9d9e787bd48a48255ea41788ae` contained no tenant or
provider work. Separate login trace `e8b6f9ee5c5e012c3eb31bf962f1eb01` contained tenant
loading, `AuthenticationService.prepare` and real provider discovery. Local logs
showed process tenant readiness; that was not classified as request lookup.

An initial real callback probe exposed synthetic callback code/state markers in
automatic `http.target` attributes (trace `69f037e4c390089b563bc9fa851d7ae5` and its
proxy trace). This is a failing privacy observation, not acceptable final evidence.
The implementation is correcting it at the existing instrumentation boundary and
must verify fresh exported traces before marking T033 complete. Raw captures stay
in owned temporary files and are removed after inspection; no telemetry tests are retained.

A later static-mode Chromium journey with an arbitrary logical Host and a fabricated
application cookie reached the real Keycloak username form (HTTP 200), selected
`springfield-web`, retained the configured callback and `max_age=0`, and left only
the supplied fabricated application cookie. It created no new application cookie.
The strengthened final frontend suite passed **214 tests / 11 files**; 41 are
public preparation service tests. Independent review found and corrected two test
sensitivity gaps: deterministic expectations now cover every A/B/A challenge/state/
nonce, and rejected issuer/missing-map cases observe zero provider requests with
otherwise matching discovery fixtures.

### Final exported-telemetry result

After the privacy processor was added before the existing Vercel automatic processors,
rebuilt and restarted the owned production app. Fresh known trace IDs:

| Request                                        | Trace ID                           | Actual result                                                                  |
| ---------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| Callback/proxy with synthetic code/state query | `21621621621621621621621621621621` | 200; all three `http.target` attributes contain only `/auth/callback`          |
| Login with synthetic query                     | `21621621621621621621621621621622` | 307; tenant loading/preparation/discovery preserved; target only `/auth/login` |
| Root/proxy with synthetic query/headers        | `21621621621621621621621621621623` | 307; no tenant/provider work; targets only `/`                                 |
| Invalid-tenant login with synthetic query      | `21621621621621621621621621621624` | 404; preparation failure remains denied; target only `/auth/login`             |

Inspected complete exported attributes/events/error data for these traces: no synthetic
code/state/cookie/Authorization probe markers or protocol query values remained.
Span names and routing/error categories remained useful. One Vercel exporter/global
Effect bridge is retained; no telemetry tests or second exporter were added. The
previous collector-outage probe still demonstrates export failure does not grant access
or prevent the expected routing outcome. No session/callback/freshness-success signal
was claimed or observed.

The final unused-code/audit commands report two informational type-only dependency
recommendations for `@opentelemetry/api` and `@opentelemetry/sdk-trace-base`. Investigated
installed `@effect/opentelemetry` metadata: both are its existing runtime peers, so they
remain production dependencies. No dependency movement or warning suppression is needed.

### Remaining completion gates

- T022 remains unchecked because actual screen-reader execution was not performed;
  keyboard/focus/accessibility-tree evidence is recorded separately above.
- On 2026-10-19, the maintainer explicitly approved `allowInsecureRequests`.
  The frontend ESLint configuration allows only that named `openid-client` export,
  only in `src/lib/authentication/provider.ts`; the rule remains an error elsewhere.
  The explicit loopback-only transport checks remain in force. Full lint now passes.
- The implementation is being published as a draft PR stacked on #227. No issue is
  closed, requirement verification changed, or main-only workflow execution claimed.
  Nightly execution remains pending until this reaches main.

FR-001/002/003/005/009 and SC-001/002/003/005 have bounded service, production HTTP
and real-provider evidence above. FR-004/006 and SC-004 have public-resource/diagnostic
and safe-telemetry evidence. FR-007 has denial and keyboard evidence with the stated
AT limitation. FR-008 retains the existing sanitized tenant and Keycloak fixtures and
explicit #217 save-before-redirect plus callback-recovery handoff. All downstream
session, callback acceptance, signed-token freshness, Microsoft/broker and comprehensive
application enforcement gaps remain open.

Final post-remediation execution again passed 39 requirements scenarios / 482 steps,
1 smoke scenario / 7 steps and full root/workspace typechecking. Removed the owned
frontend processes, Keycloak/LGTM containers and raw temporary protocol/trace captures;
pre-existing services were preserved. Restored the unrelated pnpm workspace edit after
the final package-manager command. Following the maintainer's approval, the optional
`speckit.git.commit` post-hook is used with normal pre-commit protections to publish
the implementation draft above #227. The sole remaining implementation checklist task
is T022 (35/36 complete); actual screen-reader execution remains unverified.

### Draft publication validation (2026-10-19)

The publication change adds only the approved API-specific ESLint allowance and updates
this evidence/task record. Authentication behavior and loopback validation are unchanged.
Lint, typecheck, build, all 214 frontend tests, unused-code, formatting, actionlint and
the changed-code audit passed again before publication. Inspected the effective ESLint
configuration to verify that the allowance applies only to the named export in the
provider adapter and the rule remains enforced elsewhere. The real-provider/HTTP/
browser/telemetry results above remain the executed 2026-10-18 evidence for this
implementation.
