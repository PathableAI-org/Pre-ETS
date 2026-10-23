# Quickstart: Verify Distributed Application Sessions

This guide operationalizes [verification.md](verification.md) for the implementation described in
[plan.md](plan.md). Every result is planned until an execution record names the exact revision and observed outcome.

## Evidence map and order

| Order | Boundary                                            | Claims                                                | Retained result                                                    |
| ----- | --------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| 1     | Public `SessionService` scenarios                   | V-003, V-005, V-006 and fail-closed portions of V-007 | Test command/result and exercised revision                         |
| 2     | Independent real-Redis clients                      | V-003–V-007                                           | Integration command/result, Redis version, owned prefix, cleanup   |
| 3     | Callback adapter and real-provider composition      | V-001–V-003, V-007, V-008                             | Test/runtime result without cookie/token values                    |
| 4     | Requirements BDD regression                         | Current-main PREETS-SESSION-003 assertions only       | Runtime result and explicit partial limitation                     |
| 5     | Manual browser + second public client + live traces | V-001–V-004, V-008; complementary telemetry           | Redacted observation record with trace IDs, presence/equality only |
| 6     | Repository quality gates                            | Static/build quality, not runtime claims              | Command results                                                    |

Do not repeat the complete behavior matrix at every layer. A public-service fake does not prove Redis; Redis does not
prove provider/callback composition; telemetry does not prove the cookie or stored record.

## Prerequisites

- Clean checkout at the revision under assessment, with dependencies installed from the root lockfile.
- Node.js matching `.node-version`, pnpm 12.15.0, Docker Compose, and Chromium for browser/BDD work.
- Populated gitignored root `.env` as required by [Docker Compose](../../docs/docker-compose.md), including distinct
  generated Keycloak and Postgres passwords even when only Redis/Keycloak/observability are started.
- Gitignored `packages/frontend/.env.local` with the repository's synthetic tenant fixture, local Keycloak issuer,
  explicit callback origin, and loopback allowance. Use no real tenant, user, credential, PHI, or client data.
- A unique owned session prefix and OIDC transaction prefix for the run, for example
  `preets:manual:session:<random-uuid>:` and `preets:manual:oidc:<random-uuid>:`. Do not reuse a shared prefix.
- Current-main requirements baseline `f43cbef2f426bf59cf2bade4cc2534231676b4cc` for any requirements BDD review.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
docker compose --profile observability up -d --wait redis keycloak otel-lgtm
docker compose exec redis redis-cli ping
curl --fail http://127.0.0.1:8080/realms/pre-ets/.well-known/openid-configuration
```

Expect Redis `PONG`, HTTP 200 from discovery, Grafana at `http://127.0.0.1:3300`, and OTLP HTTP at
`http://127.0.0.1:4318`. Failure to establish readiness blocks runtime evidence; do not reinterpret an empty trace query
or failed dependency as a passing application result.

Configure the frontend run with the owned prefixes and tracing endpoint. `packages/frontend/.env.local` may hold these
gitignored values; restart the frontend after changes:

```dotenv
REDIS_URL=redis://127.0.0.1:6379
SESSION_KEY_PREFIX=preets:manual:session:<random-uuid>:
OIDC_TX_KEY_PREFIX=preets:manual:oidc:<random-uuid>:
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
OTEL_SERVICE_NAME=pre-ets-frontend
```

Leave `OTEL_SDK_DISABLED` unset. Never put the cookie/reference, provider token, or collector credential in a command,
shell history, test title, screenshot, chat, or retained transcript.

## 1. Public module evidence

After implementation, run the focused frontend suite:

```sh
pnpm --filter @pathableai/pre-ets-frontend test:unit -- session.test.ts
```

Required observations through `SessionService` only:

- Establishment returns issuer/subject identity, the same tenant, the controlled-clock deadline, and warning lead for
  omitted/default, warning-disabled, and explicit valid policies.
- Absent and malformed references return `NoUsableSession` without identity/policy and without touching Redis for a
  malformed value.
- At or after the stored deadline, a still-present strict record returns `NoUsableSession`.
- A deleted record (the observable result of invalidation when no cause is retained) returns `NoUsableSession`.
- Redis/codec failure returns `SessionServiceUnavailable`, never `NoUsableSession` or `UsableSession`.
- The current no-input `hasSession()` root compatibility operation remains false; no protected-entry claim is made.

These scenarios may use deterministic test Layers and the Effect test clock. They must not assert logs, spans,
`session.id`, exporter payloads, or private helper calls.

## 2. Real Redis and independent-client evidence

Run the integration suite with the local Redis dependency ready:

```sh
REDIS_URL=redis://127.0.0.1:6379 pnpm --filter @pathableai/pre-ets-frontend test:integration -- session-redis.test.ts
```

The integration fixture must create a unique `SESSION_KEY_PREFIX`, construct at least two independently scoped
`NodeRedis`/`SessionService` runtimes, establish through A, and read through B. Compare only the public fields: issuer,
subject, tenant alias, deadline, and warning lead. It must also exercise missing/deleted/expired records and a controlled
unavailable-store condition, restore readiness afterward, and remove only owned keys in a finalizer.

Record the command, revision, Redis image/version, pass/fail, and cleanup. Do not retain the reference, raw Redis key,
record payload, or telemetry identifier. This evidence establishes the real adapter, not independently running Next
request recognition.

## 3. Callback and real-provider composition

Run callback adapter coverage with the ordinary frontend unit suite:

```sh
pnpm --filter @pathableai/pre-ets-frontend test:unit -- authentication-entry.test.ts
```

It must establish that session creation is invoked only for trusted completion, the policy belongs to the trusted
tenant, the cookie is written only after successful establishment, correlation clearing is preserved, and store/tenant
failure produces the existing private safe response with no session cookie.

Then run the retained real-provider callback/session composition evidence required by the implementation. The root
integration test reuses the repository's Keycloak browser/process harness, but its second independently scoped client
uses only the public `SessionService`; it must not import `lib/session/codec.ts` or `lib/session/store.ts`:

```sh
node --test tests/integration/session-callback-keycloak.test.ts
```

This test carries issue-level V-001/V-002/V-003/V-004/V-008 evidence without becoming a requirements BDD feature. Run
the BDD harness and scenarios separately for their bounded current-main assertions and fixture regressions:

```sh
pnpm test:bdd:checks
pnpm test:bdd
```

The BDD command is requirements evidence only for assertions actually backed by current-main requirement tags. Real
Keycloak execution may also be a fixture for separately recorded issue-level integration evidence, but scenario text,
`@partial`, or a dry run does not authorize V-005–V-007.

### Requirements BDD boundary

- Remove the superseded successful-callback assertion that no application session is created.
- Do not add BDD assertions about cookie shape, Redis clients, failure-vs-absence, exact expiry/invalidation causes, or
  `session.id`; those are not current-main PREETS-SESSION-003 promises.
- This slice exposes no protected read that can observe the bound user/tenant through the running product. Defer a new
  successful-establishment BDD claim to #219/#154 rather than creating a diagnostic endpoint.
- `@partial` describes incomplete coverage; it does not make issue #218 an approved requirements source.
- `pnpm test:bdd:dry` may confirm discovery, but it is not execution evidence.

## 4. Manual composed feature verification

### Start and record

1. Record the Git revision, date/time, Node/pnpm versions, Redis/Keycloak/otel-lgtm image versions, synthetic tenant and
   user labels, effective timeout/warning inputs, owned prefixes, and start time. Do not record secret values.
2. Start the frontend with OTLP export enabled:

```sh
pnpm dev:frontend
```

3. Use a fresh browser context at the registered synthetic callback authority. Complete login through the tracked local
   Keycloak realm (`demo`/`demo` is local synthetic data).

### Observe the callback and cookie

4. Inspect the successful `/auth/callback` response and browser cookie metadata without copying values into the retained
   record. Confirm:

   - response is the planned private/no-store successful callback outcome;
   - exactly one `pathable-session` cookie was issued;
   - `HttpOnly`, `SameSite=Lax`, `Path=/`, and no `Domain` are present;
   - `Secure` follows the explicit loopback rule;
   - cookie content does not equal or contain any controlled provider token, credential, identity claim, callback value,
     or later-observed telemetry identifier.

### Read through an independent public client

5. Use a second independently scoped Node process/runtime connected to the same Redis URL and prefix. A temporary probe
   may be created under `packages/frontend/tests/manual/` only for this run; it must import `SessionService` from
   `src/lib/session.ts`, provide a fresh `NodeRedis.layer`, accept the captured reference without echoing it, call
   `read`, and print only safe synthetic identity/tenant/deadline/warning comparisons. It must not import private session
   children, decode Redis directly, or print the reference/key/record/telemetry ID.
6. Run the probe through the installed frontend Vitest configuration, then delete it before completing the run:

```sh
pnpm --filter @pathableai/pre-ets-frontend exec vitest run tests/manual/session-read.probe.test.ts --config vitest.integration.config.ts
```

Confirm the second client returns `UsableSession` with the expected synthetic issuer/subject, exact tenant alias,
authoritative initial deadline, and effective warning lead. Record comparisons, not sensitive/raw values. The probe
and any local input file are temporary instrumentation and must not be committed.

### Rejection and fail-closed observation

7. In a separate fresh browser context, execute a rejected authentication return through the same boundary. Confirm no
   `pathable-session` cookie and no usable session result. Where safe, execute the controlled store-failure procedure
   from the real-adapter integration and confirm no cookie/replacement; restore Redis readiness before continuing.

## 5. Live OpenTelemetry verification

Allow up to approximately 30 seconds after each request for batch export. Use the repository's read-only Grafana MCP
when available:

1. Call `list_datasources`; select the returned Tempo UID (normally `tempo`).
2. Search traces with `{ resource.service.name = "pre-ets-frontend" }` over the recorded time window.
3. Fetch the successful callback trace and the traced second-client/reference read.
4. Inspect the session establishment/read spans and confirm:

   - the successful establishment span contains `session.id`;
   - the usable read span contains the same value;
   - the attribute is not equal to the cookie reference or derived Redis key and cannot retrieve/authenticate a session;
   - rejected authentication, no-usable reads, and failed establishment do not falsely carry a successful-session
     `session.id`;
   - span names, attributes, events, status descriptions, and exceptions contain no Cookie, Authorization, callback
     parameters, provider tokens, credentials, raw references/keys, or secret cause data;
   - normal request method, route template, and status/outcome attributes remain present when Next emits them.

If MCP is unavailable, sign into local Grafana and inspect Tempo as described in
[docs/observability.md](../../docs/observability.md). An empty result is inconclusive: confirm the endpoint, SDK-enable
state, service name, time range, collector readiness, and export delay. Do not query Loki/Prometheus as substitutes; the
frontend exports traces only.

Retain the revision, query, trace IDs, span names, and presence/equality/secrecy results. Do not retain the full
`session.id`. Passing telemetry supports correlation only; it does not prove a cookie, record, or usable public outcome.
No span/attribute/exporter assertion belongs in committed tests.

## 6. Cleanup

1. Have the public-client probe/finalizer remove the exact owned session record(s), or enumerate only the validated
   owned prefix and unlink each owned key. Never use `FLUSHALL` and never delete another prefix.
2. Remove the temporary probe and any gitignored input file; verify neither is staged or untracked.
3. Close browser contexts and stop the frontend.
4. Stop only services started for this run:

```sh
docker compose --profile observability stop otel-lgtm
docker compose stop keycloak redis
```

5. Record cleanup success and any skipped observation caused by readiness/export failure.

## 7. Repository quality gates

From the repository root, after feature-specific runtime evidence:

```sh
pnpm typecheck
pnpm build
pnpm lint
pnpm format:check
pnpm check:unused
```

Apply lint fixes before formatting if changes are required, then rerun both. Static/build gates do not establish the
session workflow. Do not add suppressions or commit generated output.

## Execution record template

```text
Revision:
Date/time and environment:
Node/pnpm and service image versions:
Safe synthetic tenant/user and effective policy:
Owned prefixes (names only; no keys/values):

V-001:
V-002:
V-003:
V-004:
V-005:
V-006:
V-007:
V-008:

Tempo query and trace IDs:
session.id presence/equality (value omitted):
Telemetry secrecy review:
Cleanup:
Commands and pass/fail:
Limitations/unexecuted claims:
```

Always state the principal limits: no comprehensive protected-entry use, no application-wide cross-instance HTTP
recognition, no renewal/invalidation race completion, no warning/recovery UI, no Microsoft/provider-neutral
compatibility proof, and no production ingress/SLO claim.
