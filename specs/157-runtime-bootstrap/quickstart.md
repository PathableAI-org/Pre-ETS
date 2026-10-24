# Quickstart: Deterministic Application Bootstrap and Runtime Composition

**Plan**: [plan.md](plan.md)

**Feature verification**: [verification.md](verification.md)

**Status**: Planned procedure. No command in this file has been executed for this feature. Results belong in the
implementation record after they are actually run.

Module-contract tests and the manual feature matrix answer different claims. Do not treat a passing unit test as
V-001 through V-005, V-009, or V-010, and do not assert logs, spans, metrics, exporter calls, or telemetry
payloads in Vitest.

## Fatal-handling bound

The bound selected in [plan.md](plan.md) and [data-model.md](data-model.md):

| Budget                 | Limit          | What to measure                                                                           |
| ---------------------- | -------------- | ----------------------------------------------------------------------------------------- |
| Diagnostic attempt     | 1 second       | Inside the fatal handler. A stalled or failed write still ends.                           |
| Telemetry flush        | 3 seconds      | `shutdownTimeout` and `exportTimeoutMillis` only. This is not the process-exit deadline.  |
| Metric export interval | 5 seconds      | `PeriodicExportingMetricReader` `exportIntervalMillis`. Inside the inspection wait below. |
| Whole fatal handling   | **10 seconds** | From recognition of the required startup failure until `process.exit(1)`.                 |

Verification's process-exit bound is the 10 second deadline. The 3 second value is only the flush timeout
inside it. Case 5 passes only when process exit is within that 10 second deadline. The inspection wait for a
healthy collector is about 30 seconds. The metric reader exports every 5 seconds, so that wait includes a
periodic export. The 30 second wait is not the fatal bound, and the reader does not keep the 60000 millisecond
default.

When the stage sentence is present, measure from that line's timestamp to process exit. That interval must be
less than or equal to 10 seconds. When the diagnostic cannot be delivered, measure process spawn to exit with
OpenTelemetry disabled and Redis on a closed port. That interval must also be less than or equal to 10 seconds,
because initialization of the console logger is small and the fatal timer still starts at the acquisition
failure.

## Prerequisites

- Implementation revision identified by `git rev-parse HEAD`. Dependencies installed. This procedure does not
  claim those checks already passed.
- Repository Node from `.node-version` and pnpm from the repo root.
- Synthetic tenant fixture `fixtures/tenant-config/springfield.json` only. No PHI, production credentials,
  production collector headers, or real client records.
- Redis from Compose when a trial needs it: `docker compose up -d --wait redis`.
- Observability profile when a trial needs a collector: `docker compose --profile observability up -d otel-lgtm --wait`.
  Grafana is `http://127.0.0.1:3300`. OTLP HTTP is `http://127.0.0.1:4318`. Follow `docs/observability.md` for
  Tempo, Loki, and Prometheus queries. Anonymous Viewer may need the documented read-only token path. Do not
  copy tokens into the evidence record.
- A free local port if 3000 is taken. The app port is 3000 unless `--port` says otherwise.
- A shell that can record exit status and timestamps. Do not commit raw transcripts.

Move aside any `packages/frontend/.env`, `.env.local`, `.env.development`, `.env.production`, and
`.env.production.local` before a trial that must not inherit them. Restore those files during cleanup. Next.js
loads those files from the frontend package even when the shell environment is empty.

Base environment for a valid runtime, with `REPO` set to the repository root:

```sh
export TENANT_CONFIG_DIR="$REPO/fixtures/tenant-config"
export TENANT_RESOLUTION=static
export TENANT_STATIC_ALIAS=springfield
export REDIS_URL=redis://127.0.0.1:6379
export OIDC_ALLOW_INSECURE_LOOPBACK=true
export OIDC_CALLBACK_ORIGINS_JSON='{"springfield":"http://localhost:3000"}'
export OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
export OTEL_SERVICE_NAME=pre-ets-frontend
export NEXT_MANUAL_SIG_HANDLE=1
```

`NEXT_MANUAL_SIG_HANDLE=1` is set before `next start`. Installed `start-server.js` then does not register the
cleanup that calls `process.exit(143)` or `process.exit(130)`. The bootstrap listener is the signal handler
that finishes `dispose` and then exits.

Do not set `OTEL_SDK_DISABLED`. Do not put secrets in `OIDC_CLIENT_SECRETS_JSON`; leave it unset so the existing
empty-map default applies. The home page's preserved unauthenticated outcome is a redirect to `/auth/login`.
Seeing that redirect means application code ran. During a pending acquisition it is a failed observation.

## Module evidence

Run from the repository root after implementation. These commands are planned, not results.

```sh
pnpm --filter @pathableai/pre-ets-frontend test:unit
pnpm --filter @pathableai/pre-ets-frontend test:integration
pnpm --filter @pathableai/pre-ets-frontend typecheck
```

Expected coverage, once those commands are actually run:

- Existing server-config and OTEL parser tests, plus the new signal-selection examples and the disabled-SDK
  property.
- `applicationLayer` tests: invalid process settings do not build infrastructure; a selected invalid protocol
  does not build infrastructure; a substitute Redis layer can serve a public service; a substitute `RedisError`
  is returned without `process.exit`.
- `Runtime.runPromise` before start rejects `StartupNotReady` and does not run the effect. `toNext` returns
  503 and does not call the handler.
- Existing tenant, authentication, session, and framework tests keep their current assertions.
- No test reads log text, spans, metrics, or exporters. `otel-http.test.ts` no longer asserts span attributes.

Preserved requirements BDD, only if implementation touches those flows, stays the command in
`features/README.md` with requirement-ID tags. A dry run is discovery only. Do not add bootstrap lifecycle
scenarios to requirements BDD.

The feature is not releasable until V-001 through V-010 pass. A deployed process that loses readiness or exits
because a collector is unreachable is a rollback.

## Manual feature verification

Record the revision, OS, Node, pnpm, Next.js version, fixture name, enabled signals, collector address class,
and host mode before changing services. The supported deployment form for this plan is the local production
server, `pnpm --filter @pathableai/pre-ets-frontend start`, after `pnpm --filter @pathableai/pre-ets-frontend build`.

### Case 1 — pending acquisition, then ready (V-001, V-003, V-008, V-009, V-010)

1. Start Redis and `otel-lgtm`. Build the frontend with the base environment.
2. Add an uncommitted latch around the production Redis acquire. `connect()` stays suspended until a release
   signal, then the real client runs against `REDIS_URL`. Do not insert a TCP proxy. The preserved
   `socketTimeout` of 5 seconds and node-redis `connectTimeout` of 5 seconds cannot provide this hold: once
   `connect()` starts, those timers fail acquisition. Do not commit the latch.
3. Start the production server with the base environment, including `REDIS_URL=redis://127.0.0.1:6379` and
   `NEXT_MANUAL_SIG_HANDLE=1`. Record the server pid.
4. While the latch is held, probe readiness and a business request:

```sh
kill -0 "$SERVER_PID"
curl -sS -D- --max-time 5 -o /dev/null http://127.0.0.1:3000/ || true
```

5. Pass condition while the latch is held: `kill -0` succeeds, stderr has not started a fatal exit (no
   `pre-ets-frontend: startup failed` sentence), and the business response is refused or 503. A redirect to
   `/auth/login` fails the trial. A refused connection or a 503 from a dead pid also fails the trial. Record
   which behavior `next start` actually showed. That record is the operator-visible host choice, not a settled
   product decision.
6. Release the latch. Remove the latch before any later case. The server may then become ready. Repeat the
   curl. The preserved outcome is a redirect to `/auth/login`. Readiness occurred only after the latch
   released and startup finished. Capture stderr and timestamps.
7. Signal inspection, after the same about-30-second wait. The metric reader interval is 5 seconds, so this
   wait includes a periodic export. In Grafana, find one frontend log in Loki, one startup or request trace in
   Tempo for service `pre-ets-frontend`, and one frontend metric in Prometheus for the same window. Retain
   datasource UIDs, a trace id, the log window, and the metric name. Confirm a local console diagnostic is
   also on stderr. Inspect one item of each signal for credentials, secrets, tokens, authorization headers,
   and tenant file contents. Retain identifiers, not payloads.
8. Same process and shutdown, still case 1. Before starting this server, add an uncommitted response header
   `x-pre-ets-runtime-id` whose value is a constant created once when the runtime is installed. Issue two
   `GET /` requests with no restart. The header values match. Send `SIGTERM` to the server process. Pass only
   when `docker compose exec redis redis-cli CLIENT LIST` no longer shows that client while `kill -0` on the
   server pid still succeeds, and the process exits after that. The bootstrap handler finishes `dispose` and
   then exits. Next.js does not exit first because `NEXT_MANUAL_SIG_HANDLE=1` left its cleanup unregistered.
   Remove the header change before any later case. This is V-010. The 10 second fatal timer is not a reason to
   force this successful shutdown to exit 0. If dispose is still incomplete after 10 seconds, V-010 fails.

### Case 2 — disabled, unselected, and one signal off (V-003, V-004)

Stop the previous server. Repeat a production start for each environment below. Each must become ready, serve
the preserved `/auth/login` redirect, keep a local stderr diagnostic, and must not fail because of the
malformed unselected value.

- Disabled: base environment plus `OTEL_SDK_DISABLED=true`,
  `OTEL_EXPORTER_OTLP_ENDPOINT=http://not a url`, and `OTEL_EXPORTER_OTLP_PROTOCOL=grpc`.
- Unselected: base environment with `OTEL_EXPORTER_OTLP_ENDPOINT` and
  `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` unset, plus `OTEL_EXPORTER_OTLP_PROTOCOL=grpc`.
- One signal off: base environment, collector up, `OTEL_LOGS_EXPORTER=none`, and
  `OTEL_EXPORTER_OTLP_LOGS_PROTOCOL=grpc`. Tempo and Prometheus show the enabled signals for a request in the
  window. Loki is not required for this trial. Local stderr still has a console diagnostic.

### Case 3 — configuration failure (V-002, V-009)

Unset `TENANT_CONFIG_DIR`. Start the production server and capture stderr and the exit status. Pass: exit
status is nonzero, stderr contains `pre-ets-frontend: startup failed during configuration reason=config`, the
curl either cannot connect or does not receive the `/auth/login` redirect, and the transcript has no fixture
file body, secret, token, or header value.

### Case 4 — selected observability initialization failure (V-002, V-004, V-009)

Restore the base environment. Set `OTEL_EXPORTER_OTLP_PROTOCOL=grpc`. Leave the SDK enabled and the endpoint
set. Start Redis so a mistaken acquisition would be visible. Start the server. Pass: stderr contains
`pre-ets-frontend: startup failed during observability signal=traces reason=protocol`, exit status is nonzero,
and `redis-cli CLIENT LIST` does not show a client from this process. The sentence has no URL.

### Case 5 — acquisition failure and secondary failures (V-002, V-003, V-009)

Use the base environment with a valid selected endpoint. Point `REDIS_URL` at
`redis://probe:probe-secret@127.0.0.1:1` so acquisition fails and the client-error cause can carry userinfo.
Measure with the rule in the bound section. Verification's process-exit bound is the 10 second deadline. The
3 second value is only the flush timeout inside it.

- Trial A: `otel-lgtm` is up. Stderr contains
  `pre-ets-frontend: startup failed during application-acquisition reason=acquisition`. Exit is nonzero,
  within 10 seconds of that line. The process never serves the login redirect. Stderr also contains
  `pre-ets-frontend: redis client error` if the client emitted an error event, and it does not contain
  `probe-secret`, the URL userinfo, or headers. The `NodeRedis` error listener remains, so that event does
  not crash the process outside the fatal handler. Grafana may show the acquisition failure for the enabled
  signals; retain identifiers only. Resource release and flush are the disposal that happens before exit. A
  hang past 10 seconds fails.
- Trial B: repeat with stderr closed (`2>&-` or an equivalent failed write) and `OTEL_SDK_DISABLED=true` so
  the spawn-to-exit clock is the fatal bound. A stage sentence is not required. Exit is nonzero within 10
  seconds of spawn. Readiness is absent.
- Trial C: repeat Trial A with an uncommitted change that makes runtime disposal reject or never settle.
  Exit is nonzero within 10 seconds of the stage line. Revert the change before Trial D.
- Trial D: repeat with the collector replaced by a TCP listener on `127.0.0.1:14318` that accepts and never
  responds, and set `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:14318`. Export stalls. Exit is nonzero
  within 10 seconds of the stage line. Stop that listener afterward.

A finalizer that blocks until the OpenTelemetry 30 second default fails these trials.

### Case 6 — collector unreachable (V-005)

- Trial A: leave `otel-lgtm` stopped. Use the valid endpoint `http://127.0.0.1:4318` and a healthy Redis.
  Start the server. After the same about-30-second wait, pass: the process is still ready, `GET /` returns
  the login redirect, and stderr contains `pre-ets-frontend: telemetry delivery failed signal=traces`, the
  same sentence with `signal=metrics`, and the same sentence with `signal=logs`. Those sentences have no
  headers, URL userinfo, or exporter configuration. The process stays up.
- Trial B: start `otel-lgtm`, start a healthy server, confirm one exported signal, then
  `docker compose --profile observability stop otel-lgtm`. Issue another `GET /`. Pass: the process stays
  ready, the redirect is served, and stderr contains `pre-ets-frontend: telemetry delivery failed` with the
  signal name for each enabled signal that failed to deliver. The process does not exit.

### Case 7 — production server listener (V-001, V-008)

Repeat the case 1 latch on the local production server if case 1 was the only form. This plan does not claim
`next dev` or another deployment. Record that `next start` is the exercised host and which behavior it
actually showed: a blocked listener or HTTP 503. That record is the operator-visible host choice. It does not
settle whether a Server Component error page and a route-handler 503 must become one outcome.

### Isolated production builds (V-008)

Stop the frontend. Stop Redis and `otel-lgtm` for every build. Each command starts in a shell that does not
inherit the previous trial's variables, and with frontend env files moved aside. Run
`pnpm --filter @pathableai/pre-ets-frontend build`.

| Trial                      | Environment                                                                            | Pass                                            |
| -------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Services unavailable       | Absolute `TENANT_CONFIG_DIR`, static Springfield settings, Redis and collector stopped | Exit 0. No readiness message. Redis stays down. |
| Credentials absent         | `OIDC_CLIENT_SECRETS_JSON` unset, services stopped                                     | Exit 0                                          |
| Tenant directory absent    | `TENANT_CONFIG_DIR` unset, services stopped                                            | Exit 0                                          |
| Tenant directory malformed | `TENANT_CONFIG_DIR='%%%'` and `TENANT_RESOLUTION=not-a-mode`, services stopped         | Exit 0                                          |

A build that validates those settings, connects to Redis, or waits on the collector fails the trial.

## Evidence to retain

- Revision, time window, OS, Node, pnpm, Next.js, and service versions.
- Enabled and disabled signals, fixture name, and collector address class. No secret values and no tenant file
  body.
- For each case: commands, exit status, curl result, whether the listener blocked or returned 503, and the
  fatal elapsed time compared with 10 seconds.
- Safe stderr sentences that include the stage and reason, and the signal when the stage is observability.
  Grafana identifiers for the enabled successful signals. The delivery-failure sentences name the signal and
  do not include headers or URL userinfo.
- V-010 header match, Redis client absence while `kill -0` still succeeds, shutdown exit after that, and
  confirmation the probe was removed.
- Limitations: listener behavior actually seen, batch delay, and hosts that were not exercised.

## Cleanup

- Stop only the frontend, blackhole listener, Redis, and `otel-lgtm` instances this procedure started.
- Remove owned Redis keys if any trial wrote them. Do not flush Redis globally.
- Restore moved env files.
- Delete the Redis acquire latch, runtime-id header edit, cleanup-fault edit, timestamps, and captures from
  the worktree. `git status` must not show those probes.

## Limitations

- Local `otel-lgtm` does not represent every collector or network.
- The listener result is whatever `next start` on this Next.js version actually showed. Record that result.
  The route-handler 503 versus a Server Component error page is an operator-visible host choice, not a
  settled product decision. The in-process refusal is still required when a request arrives early.
- Build success does not prove runtime readiness. Composition tests do not prove a live Redis or collector.
- This procedure does not establish browser telemetry, backend telemetry, sampling policy, alerting, or
  service-level objectives.
