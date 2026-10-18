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
curl -sS -o /dev/null -w '%{http_code}\n' \
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
