# Validate the initiation increment

Run this guide after implementation. It is not evidence that these behaviors already work. Current source still
has a pass-through entry and callback fallback. Use synthetic data, an owned frontend process, and a unique Redis
prefix. Keep raw authorization/cookie/transaction captures temporary; record sanitized observations instead.

## Prerequisites and quality checks

From the repository root, install locked dependencies and build after the implementation introduces its two
frontend dependencies. Read [local services](../../docs/docker-compose.md) alongside actual `compose.yaml`;
historical login/session/cache descriptions in that guide are not current execution evidence.

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

Expect meaningful service properties and named failure/framework examples to pass, Gherkin bindings to be
discovered, and quality gates to pass. Discovery proves no runtime outcome. There are currently no active
real-Keycloak Playwright E2E journeys; `pnpm test:e2e` is not a substitute for this guide.

Prepare required Compose bootstrap/admin and Postgres passwords using the existing
[README instructions](../../README.md#local-external-services). Preserve any existing gitignored `.env`.
Compose resolves required variables for the whole model, even when starting a subset. Then:

```sh
docker compose up -d --wait redis keycloak
docker compose exec redis redis-cli ping
curl -sS -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:8080/realms/pre-ets/.well-known/openid-configuration
docker compose --profile observability up -d --wait otel-lgtm
```

Expect `PONG`, HTTP 200 discovery, and healthy services. The current tracked public clients require S256 and
register static Springfield `localhost:3000` plus tenant-specific `*.localhost:3000` callbacks. Do not reset a
shared realm/volume to import changes; inspect the running configuration if exact registrations differ.

## Static-mode browser and HTTP success

Use a fresh browser context. In one owned terminal, from the repository root:

```sh
preets216_prefix="preets:manual216:$(date +%Y%m%d%H%M%S):"
unset OTEL_SDK_DISABLED
TENANT_CONFIG_DIR="$PWD/fixtures/tenant-config" \
TENANT_RESOLUTION=static \
TENANT_STATIC_ALIAS=springfield \
OIDC_CALLBACK_ORIGINS_JSON='{"springfield":"http://localhost:3000"}' \
OIDC_ALLOW_INSECURE_LOOPBACK=true \
OIDC_TX_KEY_PREFIX="$preets216_prefix" \
REDIS_URL=redis://127.0.0.1:6379 \
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
pnpm --filter @pathableai/pre-ets-frontend exec next start --hostname 127.0.0.1 --port 3000
```

The new authentication environment settings are proposed by this plan and will only work after implementation.
`OTEL_SDK_DISABLED` must be absent, not the string `false`, for the current exporter setup. Do not run another
frontend on the same port or treat a pre-existing process as this revision.

1. Open `http://localhost:3000/`. Expect automatic navigation through `/auth/login` to the Keycloak login UI.
   There is no application login action or application credential form, and the welcome page is not exposed.
2. In Network, preserve the navigation chain: `/` → 307 `/auth/login` → 307 configured provider. The final
   authorization request uses `springfield-web`, exact `http://localhost:3000/auth/callback`, code/openid/S256,
   state/nonce and `max_age=0`. Record that these parameters exist; do not publish their secret correlation values.
3. In browser storage/response headers, distinguish the HttpOnly host-only `preets_oidc_tx` cookie from an
   application session cookie. Check callback path, Lax, bounded maximum age and local HTTP Secure exception.
   No authenticated identity/session exists yet. Public asset requests needed for the error page still succeed.
4. If desired, sign in using the tracked realm's synthetic demo user. Expect the current public callback fallback,
   not protected application access. Returning to `/` starts another initiation. Successful provider sign-in
   does not establish signed-token or freshness validation by this application.
5. An existing provider SSO session does not remove `max_age=0` from a new first-time application initiation.
   Observe the request; do not report verified freshness from the provider screen alone.

To inspect the two application responses independently without following the provider:

```sh
umask 077
preets216_capture=$(mktemp -d /tmp/preets216-capture.XXXXXX)
curl -sS -D "$preets216_capture/root.headers" -o /dev/null http://localhost:3000/
curl -sS -D "$preets216_capture/login.headers" -o /dev/null http://localhost:3000/auth/login
```

Inspect the captures locally for the outcomes above. The root response has the same-origin hop; only successful
login issuance sets the transaction cookie. The initiation handler uses `Cache-Control: private, no-store`.
Raw login headers contain correlation material and are temporary.

## Host-mode isolation and static Host independence

Stop only the owned frontend, then restart with the same common Redis/OTel settings and these mode settings:

```sh
TENANT_CONFIG_DIR="$PWD/fixtures/tenant-config" \
TENANT_RESOLUTION=host \
BASE_HOSTNAME=localhost:3000 \
OIDC_CALLBACK_ORIGINS_JSON='{"springfield":"http://springfield.localhost:3000","shelbyville":"http://shelbyville.localhost:3000"}' \
OIDC_ALLOW_INSECURE_LOOPBACK=true \
OIDC_TX_KEY_PREFIX="$preets216_prefix" \
REDIS_URL=redis://127.0.0.1:6379 \
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
pnpm --filter @pathableai/pre-ets-frontend exec next start --hostname 127.0.0.1 --port 3000
```

Open `http://springfield.localhost:3000/`, Shelbyville's corresponding URL, then Springfield again. Expect
`springfield-web`, `shelbyville-web`, `springfield-web` and their exact tenant-host callbacks; no cross-tenant
cookie Domain. This deliberately configures the literal base with its port so the current raw Host parser matches.
Normal `BASE_HOSTNAME=localhost` rejects these retained-port hosts; do not strip ports or change tenant validation.
If local browser resolution is unavailable, use the static browser flow and `curl --resolve` for host HTTP checks;
record the browser isolation gap rather than claiming it passed.

For static Host independence, restart in static Springfield mode and request `/auth/login` with Host values
`springfield.example.test`, `unknown.example.test` and `127.0.0.1`. All must select Springfield's integration and
the configured localhost callback origin. Repeat with conflicting forwarded-host/protocol and return-query input;
none may change the selected integration or callback authority. These HTTP observations do not demonstrate cookie
return on arbitrary static Host names; real browser authentication uses the canonical configured host.

## Public resources, failures, and real Redis

| Exercise                                                     | Expected HTTP/browser outcome                                                                     | Evidence limit                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Direct `/auth/callback` without a valid transaction          | Existing fallback, no initiation loop and no authenticated access                                 | Actual callback acceptance/rejection remains #217                                                                |
| Direct `/login-unavailable`                                  | Understandable public sign-in error with usable retry/navigation                                  | Check keyboard Tab/Enter, visible focus, heading/link names and AT reading if UI changes; no exact-copy snapshot |
| `/_test/tenant-config` under static/host modes               | Full independently expected selected JSON, no-store, no transaction or application session cookie | Safe application access does not establish production ingress blocking                                           |
| Existing `/_test` preview and needed safe assets             | Same environment availability as before, no new auth redirect                                     | Do not turn a development-only preview into a production endpoint                                                |
| Host-mode unknown tenant, malformed/unreadable selected file | Ordinary root missing-page presentation with HTTP 404, no fallback login                          | Retain the named BDD failure examples                                                                            |
| Unavailable configuration directory or missing static file   | Root HTTP 500, no fallback                                                                        | Distinct from invalid process config, which prevents startup                                                     |
| Missing selected alias in otherwise valid callback map       | `/auth/login` leads to public sign-in failure, no new transaction cookie                          | Diagnostics remain usable; no default callback or tenant substitution                                            |
| Provider discovery unavailable / metadata unsuitable         | Public sign-in failure, no protected access, no transaction cookie                                | Use an owned temporary tenant directory; do not alter shared tracked fixtures                                    |
| Redis unreachable / command fails                            | Bounded public sign-in failure without successful issuance                                        | Prefer an owned frontend with an unused loopback Redis port; do not stop shared Redis                            |

Actual HTTP requests without tenant/provider failures must not hang waiting for an offline queue. Test all failures
using owned temporary configuration and restart the owned frontend as needed; no global client/provider caches are
planned. Restore the baseline before the next observation.

For actual Redis semantics, use only the unique manual prefix printed by your shell variable. After a successful
initiation, inspect one owned record and its TTL with `redis-cli` through Compose. Verify version/tenant/client/
callback/correlation fields match the request, the verifier is server-only, and TTL is positive and no greater than
600 seconds. Re-initiate and confirm a new handle/record without overwriting the earlier attempt. Public diagnostic
requests alone add no transaction records. A temporary lower-level probe against the public issuance adapter can
use a deterministic duplicate handle to establish real conditional-write rejection; record its revision and delete
the probe afterward. Do not expose a test-only HTTP route or add a BDD store client to obtain this evidence.

Let TTL clean abandoned attempts or delete only keys provably owned by this prefix. Never flush Redis, scan shared
records for assertions, or retain raw record contents with verifier/cookie material as PR evidence. This is manual
adapter evidence; callback consumption/expiry enforcement remains unimplemented.

With Redis and Keycloak available, run actual requirements BDD:

```sh
pnpm test:bdd
pnpm test:bdd:checks
```

Expect both partial initiation/public-resource features and preserved tenant scenarios to pass with executable
bindings. The raw request helper does not follow provider redirects. The step for full initiation may follow only
the documented same-origin hop; it must compare provider/client against independent fixture expectations.

## Telemetry observations

Open `http://127.0.0.1:3300`. Use an existing authorized Grafana session; the local image's documented admin login
is available when needed. Anonymous Viewer cannot use Explore. In Explore → Tempo, select `pre-ets-frontend` and
the request time range. Allow roughly 30 seconds for batch export; inspect actual exported samples and application
stderr, not just local span creation. These are planned observations, not new durable telemetry requirements.

| Request / condition              | Expected exported trace and local log observations                                                                                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root success                     | Next request span with method, route and 307 where emitted; existing tenant read span(s); no session-created/authentication-success signal                                                                  |
| `/auth/login` success            | A separate HTTP request trace for the second hop, meaningful `AuthenticationService.begin` span and provider/transaction child boundaries if instrumented; successful preparation/issuance only             |
| Provider/storage failure         | Safe bounded failure category in the initiation span/local diagnostics; HTTP reflects the failure redirect, while the public error page can itself be 200; do not require HTTP 500 for this logical failure |
| Root tenant failure              | Existing tenant failure category and actual 404/500 status; no successful provider initiation or transaction issuance                                                                                       |
| Diagnostic/public callback/error | Corresponding HTTP trace and tenant context when used; no initiation operation for exceptions, no new session or callback-success claim                                                                     |

Accept Next's method keys `http.request.method` or `http.method`, route keys `http.route` or `next.route`, and
status keys `http.response.status_code` or `http.status_code`. Proposed Effect operation names are meaningful
boundaries, not a permanent assertion inventory. Check parent/child correlation within each HTTP request; root
and the later browser redirect request are separate traces unless propagation is actually demonstrated.

Inspect complete exported attributes/events/error descriptions, automatic URL attributes, and local logs for
Cookie/Authorization header values, transaction handles, state, nonce, verifier, raw Redis values, tokens,
credentials, full authorization/callback queries, and raw upstream errors. They must not leak. Use synthetic
markers in a temporary probe when needed. If automatic instrumentation captures sensitive URLs, fix/suppress the
unsafe capture at the existing instrumentation boundary before acceptance; do not add another exporter or retained
telemetry tests. The browser URL legitimately carries protocol correlation; exporting it in telemetry is separate.

There is one `@vercel/otel` exporter plus Effect's global bridge. Do not expect Keycloak/browser/backend spans,
exported application logs, metrics, or a cross-provider trace from the current traces-only setup. Collector failure
must not grant access or cause a successful application request to crash. Never assert that reaching Keycloak or
seeing an initiation span proves signed-token validation, fresh authentication, or session creation.

## Record results and clean up

Record implementation revision, config mode, sanitized origin/client expectations, browser actions/outcomes,
HTTP statuses, Redis TTL/conditional-write observations, exported trace IDs and safe outcome summaries, commands,
and limitations. Explicitly leave Microsoft/broker-chain compatibility, callback validation, freshness acceptance,
application sessions and production ingress outstanding.

Stop only owned frontend/probe processes; remove only the owned capture directory and temporary tenant fixtures.
Allow owned transaction records to expire. Leave pre-existing shared Compose services running; stop services only
if started solely for this verification and no other work depends on them. Do not commit generated output,
captures, temporary probes, or credentials.
