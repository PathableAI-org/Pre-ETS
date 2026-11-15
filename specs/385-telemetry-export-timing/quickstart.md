# Quickstart: Validate Configurable Telemetry Export Timing

This guide turns the approved [verification plan](verification.md) into steps an agent can run against a pushed
slice. It is the planned execution mapping. Results are appended under [Execution results](#execution-results) by
`pnpm verify:render --write`, never written by hand. Signals and queries are in
[contracts/telemetry.md](contracts/telemetry.md); module contracts are in [contracts/modules.md](contracts/modules.md).

## Claim and boundary map

Each claim is observed once, at the boundary that can establish it. "Receiver" means the temporary local receiver
described below. Limitation IDs are those of [plan.md](plan.md#phase-7--implementation-slices) (`L-n`) and of
`verification.md`, whose bullets the request numbers `VL-1` (the local stack's own delay) to `VL-7`.

| Claims | Feature evidence (this guide)                                                                                                                                                                               | Supporting module evidence           | Slice(s)    | Limits                 |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------- | ---------------------- |
| V-001  | §A: five requests three seconds apart; each trace export reaches the receiver within 1 s of its response                                                                                                    | —                                    | A           | VL-2 sample            |
| V-002  | §A: the same five requests; each log export reaches the receiver within 1 s                                                                                                                                 | —                                    | A           | VL-2 sample            |
| V-003  | §A: T-002 by the run and T-001 by the sent trace ID found within 10 s through the forwarding receiver; §F: the same from the documentation                                                                  | —                                    | A (part), F | VL-1 stack delay       |
| V-004  | §B: export request within 1 s of each interaction (Playwright); T-003 read by the RSC request's trace ID within 10 s                                                                                        | —                                    | B           | VL-1                   |
| V-005  | §A: 20-request burst gives fewer than 20 trace exports, as at the base revision, and in development with `batch`                                                                                            | —                                    | A           | Local production build |
| V-006  | §B: at least five browser records within 1 s give fewer export requests than records                                                                                                                        | —                                    | B           | —                      |
| V-007  | §A: one development-mode start with no setting shows the V-001 observation                                                                                                                                  | Config examples and property (A)     | A           | —                      |
| V-008  | §A: one real start per case exits with an error naming the setting and serves no request                                                                                                                    | Config property, OTEL on and off (A) | A           | —                      |
| V-009  | §A: telemetry off with each value; zero receiver requests; the protected document has no tracing configuration                                                                                              | —                                    | A           | VL-3 absence           |
| V-010  | §F: each workflow states its mode; each suite's CI command sends zero requests to the stack's address                                                                                                       | —                                    | F           | VL-3 absence           |
| V-011  | §D: a tagged BDD run through the command; T-002 by the run's identifier and T-001 by a returned record's trace ID found within 10 s                                                                         | —                                    | D           | VL-1                   |
| V-012  | §E: one unit and one integration selection under the wall clock. Unit: T-004 by a log record's trace ID within 10 s of the return. Integration: T-004 by search within 10 s after the reported search delay | —                                    | E           | VL-1; L-3; L-5         |
| V-013  | §D (BDD selection) and §E (unit and integration): identical per-test results across three runs; each run ends                                                                                               | The suites themselves                | D (part), E | VL-2 selection; L-4    |
| V-014  | §D: two concurrent runs selected apart by T-001; the off switch gives zero requests                                                                                                                         | `tests/tooling/test-run.test.ts` (D) | D           | —                      |
| V-015  | §C: under each timing, a request less than 1 s before `SIGTERM`; its trace and log export are at the receiver                                                                                               | —                                    | C           | L-1                    |
| V-016  | §D (BDD) and §E (unit, integration): under each timing the last test's records are at the receiver at return                                                                                                | —                                    | D (part), E | —                      |
| V-017  | §B: the record of an interaction that navigates at once is found (T-003), under each timing                                                                                                                 | —                                    | B           | L-2                    |
| V-018  | §C: fixed journey with the receiver refusing matches the journey with it reachable; `SIGTERM` ends the process                                                                                              | —                                    | C           | L-4                    |
| V-019  | §A (server) and §B (browser): equal name and attribute sets under both timings; header present; no duplicate                                                                                                | —                                    | A (part), B | VL-2                   |
| V-020  | §A (server) and §B (browser): no probe value or forbidden class in any exported field under immediate timing                                                                                                | —                                    | A (part), B | VL-3                   |
| V-021  | §A: two metric intervals under each timing; the same export times and counts                                                                                                                                | —                                    | A           | —                      |
| V-022  | §B: the received document holds the four values and the timing, with headers configured; none when off                                                                                                      | Browser-settings example (B)         | B           | —                      |
| V-023  | §F: a fresh worktree and the documentation alone give V-001 and V-003; the modes are stated once                                                                                                            | —                                    | F           | —                      |

## Prerequisites

- A worktree owned by the verifier, detached at the requested SHA, with `pre-ets-setup deps` (or
  `pnpm install --frozen-lockfile` and `pnpm exec playwright install chromium`) and
  `pnpm --filter @pathableai/pre-ets-frontend build`.
- For §A step 5 only, a second worktree at the base revision (`origin/main` when the stack was opened), built the
  same way.
- The local services: `docker compose --profile observability up -d --wait redis keycloak otel-lgtm`, and the
  read-only Grafana MCP server from `.mcp.json`.
- A run UUID per run (`uuidgen`), the SHA, and a free application port. The standard environment, written `ENV`
  below, with `$PORT`, `$SHA`, and `$RUN` set:

  ```sh
  NEXT_TELEMETRY_DISABLED=1 TENANT_RESOLUTION=static TENANT_STATIC_ALIAS=springfield \
  TENANT_CONFIG_DIR="$PWD/fixtures/tenant-config" OIDC_ALLOW_INSECURE_LOOPBACK=true \
  OIDC_CALLBACK_ORIGINS_JSON="{\"springfield\":\"http://springfield.localhost:$PORT\"}" \
  SESSION_KEY_PREFIX="preets:verify:$RUN:" OIDC_TX_KEY_PREFIX="preets:verify:$RUN:tx:" \
  OTEL_SERVICE_NAME=pre-ets-frontend OTEL_SERVICE_VERSION="$SHA" \
  OTEL_RESOURCE_ATTRIBUTES="service.version=$SHA,service.instance.id=$RUN" LOG_LEVEL=Debug
  ```

- Start a production build with `ENV … pnpm --filter @pathableai/pre-ets-frontend start -H 127.0.0.1 -p "$PORT"`
  and wait for `Ready in`. Start development mode with the `dev` script and the same variables. Each step names
  the telemetry settings it adds.
- Stop a server in an orderly way by sending `SIGTERM` to the Node process that listens on `$PORT`, for example
  `kill -TERM "$(lsof -ti "tcp:$PORT" -sTCP:LISTEN)"`. Signalling `pnpm` is not an orderly stop of the server.
- A session for the browser steps: sign in as a synthetic `springfield` user through the local Keycloak realm, as
  the requirements BDD steps do. If the identity provider cannot establish one, the browser steps are `blocked`.
- Probe values for the run: a query value and a fragment, both distinctive synthetic strings, and a synthetic
  collector header value. None is copied into a report.

## Receiver

The temporary receiver is a verification aid, kept outside the repository and removed at cleanup. It listens on
loopback only, for example `127.0.0.1:14318`, and for each request appends one line: arrival time in milliseconds,
method, path, body size, and whether the synthetic header name is present. It never stores a header value or a
body. It has three modes:

- **answer**: reply `200` with an empty JSON object and CORS headers that allow any origin and header.
- **forward**: also send the same body and content type to `http://127.0.0.1:4318` at the same path, so one run
  gives both arrival times and queryable records.
- **refuse**: do not listen, so connections are refused.

Point a process at it with `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:14318/`. A request count for a step is
the number of lines whose arrival time falls inside that step, by path (`/v1/traces`, `/v1/logs`, `/v1/metrics`).
Startup itself exports a few records; exclude lines that arrived before the step began.

## Module evidence

Run at the requested SHA and record the commands and results. These are module tests, cited by the map above and
not repeated as feature evidence.

```sh
pnpm --filter @pathableai/pre-ets-frontend-services test tests/lib/config.test.ts   # V-007, V-008 (from slice A)
pnpm test:tooling                                                                    # V-014 (from slice D)
```

## §A — Server export timing

Receiver in **forward** mode unless a step says otherwise. Endpoint: the receiver.

1. **Immediate (V-001, V-002, V-003).** Start the production build with `TELEMETRY_EXPORT_TIMING=immediate`. Send
   five requests three seconds apart to `/login`, each with its own generated `traceparent` header. For each,
   record the time from the response to its last `/v1/traces` line and to its `/v1/logs` line. Expected: every one
   within 1 second, and before the next request. Right after each response read the trace by the trace ID of the
   `traceparent` sent (T-001) and run the T-002 query, and record the time until the records are found. Expected:
   within 10 seconds.
2. **Default by mode (V-007).** Start development mode with no `TELEMETRY_EXPORT_TIMING`. Send one request and
   record the step 1 timing. Expected: within 1 second.
3. **Refusal (V-008).** Start the production build with `TELEMETRY_EXPORT_TIMING=Batch`, then again with
   `OTEL_SDK_DISABLED=true TELEMETRY_EXPORT_TIMING=now`. Expected each time: the process exits with code 1, the
   startup log names `TELEMETRY_EXPORT_TIMING`, and a request to the port is refused.
4. **Telemetry off (V-009).** Receiver in **answer** mode. Start the production build with
   `OTEL_SDK_DISABLED=true`, once with each timing value. Send five requests, sign in, and load a protected
   document. Expected: zero receiver lines, and the document has no `preets-browser-tracing` and no `traceparent`
   meta element.
5. **Batch (V-005).** Receiver in **answer** mode. Start the production build with no `TELEMETRY_EXPORT_TIMING`.
   Send 20 requests within 1 second, wait 10 seconds, and count `/v1/traces` lines. Repeat in the base-revision
   worktree, and in development mode at the requested SHA with `TELEMETRY_EXPORT_TIMING=batch`. Expected: fewer than
   20 each time, and the same order of magnitude as the base revision.
6. **Metrics (V-021).** Under each timing, serve one request every ten seconds for two metric intervals (a little
   over two minutes). Record the `/v1/metrics` arrival times and count. Expected: the same count under both
   timings, at the existing 60-second interval, two requests per interval.
7. **Same content, server (V-019, part; V-020, part).** Add
   `OTEL_EXPORTER_OTLP_HEADERS="X-Preets-Probe=<synthetic value>"`. Run one fixed journey once under each timing
   with its own run UUID: `/login`, a followed link that carries the probe query value and fragment, sign-in, one
   protected page, and Log out. From Tempo and Loki collect, for the server records of each run, the set of span
   names, attribute names, resource attribute names, and log messages. Expected: the two sets are equal, no span
   ID appears twice in a run, and every receiver line of both runs shows the header present on the same paths.
   Search every exported field of the immediate run for the probe values, any `?` query, any fragment, `host.*`,
   `os.*`, and `process.*` attributes, and each forbidden data class. Expected: none. Record only where a match
   was found, never the value.

## §B — Browser export timing

Add `BROWSER_TRACING_ENABLED=true` and the synthetic `OTEL_EXPORTER_OTLP_HEADERS`. Endpoint: the local stack
(`http://127.0.0.1:4318/`), because the page exports straight to it; Playwright records the page's requests to that
origin with their times. Turn the harness's own `traceparent` injection off and wait for
`<html data-preets-browser-tracing="started">` before each sampled step. Sample one interaction of a kind at a
time, at least five seconds apart.

1. **Configuration (V-022).** Under `immediate`, load a protected document and read the `preets-browser-tracing`
   meta content from the received HTML. Expected: exactly `endpoint`, `serviceName`, `serviceVersion`,
   `serviceInstanceId`, and `exportTiming` with the value `immediate`; no header name or value. Restart with
   `batch` and expect `batch`. Restart without `BROWSER_TRACING_ENABLED` and expect no such element.
2. **Immediate (V-004).** Under `immediate`, perform five router navigations between the protected fixture pages.
   For each, record the time from the click to the page's `POST …/v1/traces` request that follows it, and take the
   trace ID from the `traceparent` header of the RSC request the navigation sends, which Playwright records. Read
   that trace (T-003) and record the time until it holds the `Router.transition` record. Expected: the request
   within 1 second, the record within 10 seconds, and no 30-second wait.
3. **Navigating interaction (V-017).** Let the session expire, activate Log in on the expiration modal, and query
   T-003 for `Interaction.login`. Expected: found. Repeat under `batch`.
4. **Batch (V-006).** Under `batch`, make at least five browser records within 1 second (five quick focus moves
   between marked targets) and count the page's export requests during the next 40 seconds. Expected: fewer
   requests than records.
5. **Same content, browser (V-019, V-020).** Run the §A step 7 journey under each timing with browser tracing on.
   Compare the browser records' name, attribute, and resource attribute sets, check for duplicates, and search
   every field of the immediate run's browser records as in §A step 7. Expected: equal sets, only the documented
   record names and allow-listed attributes, `url.path` without query or fragment, and no forbidden value. Also
   expected under `immediate`: no export request whose body holds no span.

## §C — Orderly exit and an unreachable collector

1. **Delivery at exit (V-015).** Receiver in **answer** mode. Under each timing, start the production build
   through the `start` script, send one request to `/login`, and send `SIGTERM` less than 1 second after the
   response. Expected: the receiver holds that request's `/v1/traces` and `/v1/logs` lines, the process has ended,
   and its exit code is 0.
2. **Unreachable collector (V-018).** Receiver in **refuse** mode, `TELEMETRY_EXPORT_TIMING=immediate`, browser
   tracing on with the endpoint naming the refused address. Run the §A step 7 journey through the browser and
   record each response status and visible outcome. Expected: the same as with a reachable collector. Then send
   `SIGTERM`. Expected: the process ends within 10 seconds.
3. **Requirements BDD still stops its processes.** Run
   `OTEL_SDK_DISABLED=true pnpm test:bdd:tags "@preets-session-005 or @preets-session-013"` and record the result.
   Expected: the scenarios pass and no "Owned process did not exit" error appears.

## §D — Test runs through the one command

Start from a shell that holds no `OTEL_*`, `TELEMETRY_EXPORT_TIMING`, `TEST_TELEMETRY`, or
`BROWSER_TRACING_ENABLED` variable. Use one tagged selection throughout, for example `"@preets-session-005"`.

1. **Command alone (V-011).** Run `pnpm test:telemetry pnpm test:bdd:tags "<tag>"` and note the run identifier it
   prints. Keep `LOG_LEVEL=Debug` in the environment, which the owned application needs to emit T-002. As soon as
   the command returns, run the T-002 query with that identifier and read the trace of one returned record by its
   trace ID (T-001). Expected: the owned application's log records and that trace's server span are found within
   10 seconds.
2. **Explicit settings win (V-014).** Start two runs at the same time, each with its own `OTEL_SERVICE_VERSION`
   and `OTEL_RESOURCE_ATTRIBUTES="service.version=…,service.instance.id=…"`. Expected: each prints its supplied
   identifier, and a T-001 query for one run returns no record of the other.
3. **Off switch wins (V-014).** Receiver in **answer** mode. Run the selection through the command with
   `OTEL_EXPORTER_OTLP_ENDPOINT` naming the receiver and `OTEL_SDK_DISABLED=true`. Expected: the run passes and the
   receiver has zero lines.
4. **Results unchanged (V-013, part).** Run the selection three ways: `OTEL_SDK_DISABLED=true pnpm test:bdd:tags`,
   through the command, and through the command with the endpoint naming a refused address. Expected: identical
   per-scenario results, and every run ends.
5. **Delivered at return (V-016, part).** With the endpoint naming the receiver in **answer** mode, run the
   selection through the command once with no timing and once with `TELEMETRY_EXPORT_TIMING=batch`. Expected: when
   the command returns, the receiver holds `/v1/traces` lines that arrived after the last scenario's requests.

## §E — Unit and integration suites

Same clean shell. Redis must be running.

1. **Unit and integration export (V-012).** Run
   `pnpm test:telemetry pnpm --filter @pathableai/pre-ets-frontend-services test tests/unit/authentication-entry.test.ts`
   and
   `pnpm test:telemetry pnpm --filter @pathableai/pre-ets-frontend-services test:integration tests/integration/session-redis.test.ts`.
   Both selections run the sampled programs under the wall clock, so their records carry the time of the run
   ([L-5](plan.md#phase-7--implementation-slices)). The first is the unit selection of the steps below. Before the
   integration run, read the trace store's reported search delay as [Telemetry queries](#telemetry-queries)
   describes and record it. As soon as each command returns, run the T-004 queries with the printed identifier and
   record the time from the return until the records are found.
   - **Unit.** The log query returns the run's `Tenant configuration request failed` records. Fetch the trace of
     one record by its trace ID. Expected: the log record and a trace that holds
     `TenantConfigService.getConfigFromAlias` with the run's `service.instance.id`, within 10 seconds. The trace
     search later lists `SessionService.establish` for the run as well; that search is not timed.
   - **Integration.** The suite emits no log record, so the verifier holds no trace ID and only the trace search
     reaches its records. Repeat the T-004 search until it lists `SessionService.establish` spans of the run.
     Expected: within 10 seconds after the reported search delay, counted from the command's return, which is
     within 40 seconds for the 30-second delay of [probe P7](research.md#probes). The delay does not count against
     the 10 seconds. Report the delay, that no log record gave a trace ID, and the observed time. Found later, or
     with no delay the verifier can read from the trace store, the result is `not established` (VL-1); see
     [review note 7](plan.md#review-notes). In P7 the search listed the spans 28 to 31 seconds after the command
     returned. The suite's `readAt` and `refreshAt` programs run under a fixed clock and are not sampled (L-5).
2. **Results unchanged (V-013).** Run each selection three ways: the plain script, through the command, and through
   the command with the endpoint naming a refused address. Compare per-test results by test name. Also run
   `pnpm test:telemetry pnpm --filter @pathableai/pre-ets-frontend test:unit` and
   `pnpm test:telemetry pnpm --filter @pathableai/pre-ets-domain test` once. Expected: identical results, every run
   ends, and the last two export nothing.
3. **Delivered at return (V-016).** With the endpoint naming the receiver in **answer** mode, run the unit
   selection through the command under each timing. Expected: the receiver holds the run's `/v1/traces` and
   `/v1/logs` lines when the command returns.
4. **No switch, no telemetry (V-010, supporting).** With `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME`
   naming the receiver but without the command, run the unit selection. Expected: zero receiver lines.

## §F — CI, documentation, and the full procedure

1. **CI mode (V-010).** Read `ci-quality.yml`, `ci-build.yml`, and `ci-bdd.yml` at the SHA and record the line
   where each sets its telemetry mode. The receiver must listen on the address the test command would use,
   `127.0.0.1:4318`. If this session started the local stack, stop only its collector for this step
   (`docker compose --profile observability stop otel-lgtm`) and start it again afterwards. A stack shared with
   another session must not be stopped; report the step `blocked` there. With the receiver in **answer** mode on
   that address, the workflow's environment (`CI=true`, `OTEL_SDK_DISABLED=true`), and no collector endpoint, run
   each suite's CI command: `pnpm --filter @pathableai/pre-ets-frontend-services test`,
   `pnpm --filter @pathableai/pre-ets-frontend test:unit`, `pnpm --filter @pathableai/pre-ets-domain test`,
   `pnpm --filter @pathableai/pre-ets-backend test`, and one tagged BDD selection. Expected: each starts and
   passes, and the receiver has zero lines.
2. **Documentation alone (V-023, V-003).** In a fresh worktree, follow only `README.md`, `docs/docker-compose.md`,
   `docs/observability.md`, and `docs/engineering/verification-harness.md` to start the local stack and a
   production build as the harness documents. Repeat §A step 1 with the endpoint the documentation gives. Record
   any step the documentation did not supply. Expected: the V-001 and V-003 observations hold.
3. **One owner (V-023).** Record the heading in `docs/observability.md` that states the three modes. Search
   `docs/`, `features/README.md`, the verifier skill, and `packages/frontend/.env.example` for another statement of
   the modes or a batch-interval wait before a trace or log query. Expected: links to the section, and no such
   wait.
4. **Full procedure.** Run §A to §E once more at this SHA, so the final report covers every claim at the revision
   that closes the issue.

## Telemetry queries

Run through the Grafana MCP server, with `RUN` as defined in
[contracts/telemetry.md](contracts/telemetry.md#signals) and the run's time range.

```text
T-001  get_tempo_trace with the trace ID of the traceparent sent (§A, §F) or of a T-002 record of the run (§D); the trace holds a server span with RUN and telemetry.sdk.language = "nodejs"
T-001  { RUN && resource.telemetry.sdk.language = "nodejs" && kind = server }      a search that selects a run (§D step 2); not timed
T-002  {service_name="pre-ets-frontend", service_instance_id="<run-uuid>"} |= "Reading tenant configuration" | service_version="<sha>"
T-003  get_tempo_trace with the trace ID from the traceparent of the RSC request a navigation sends (§B step 2); the trace holds a Router.transition span with RUN and telemetry.sdk.language = "webjs"
T-003  { RUN && resource.telemetry.sdk.language = "webjs" && name = "Interaction.login" }      a search (§B step 3); not timed
T-004  {service_name="pre-ets-frontend", service_instance_id="<run-uuid>"} |= "Tenant configuration request failed"      then get_tempo_trace with the record's trace ID
T-004  { resource.service.instance.id = "<run-uuid>" && name = "SessionService.establish" }      a search; the only reach for the integration selection (§E step 1)
Delay  GET http://127.0.0.1:3300/api/datasources/proxy/uid/tempo/status/config      read live_store.max_trace_live and live_store.max_block_duration
Sets   { RUN } | select(name, resource.service.name)      then get_tempo_trace for each trace to list attribute names
```

An empty result is inconclusive until the receiver or Playwright shows that the export request left. The 10-second
bound applies to a record reached directly: a log record selected by the run, or a trace read by a trace ID the
verifier holds or takes from such a log record. A record of that kind that left within 1 second but is found later
than 10 seconds makes the claim `not established` under VL-1. A trace search lists a span only after the trace
store's own search delay, about 30 seconds after receipt in [probe P7](research.md#probes); a read by trace ID does
not wait for that, and a search does not replace a direct read where one exists.

Only the integration selection of §E is reached by search alone. Its records are found within 10 seconds after the
reported search delay, counted from the command's return, and the delay does not count against the 10 seconds. The
reported delay comes from the trace store's effective configuration, which the `Delay` request reads through the
Tempo datasource of the local stack's Grafana; the request is a read and changes nothing. Under `live_store` the
configuration reports `max_trace_live` and `max_block_duration`. Both were `30s` in P7, where the observed search
delay matched them, and the reported delay is the larger of the two. Record both values with the observation. If
the request fails or the configuration holds neither value, there is no reported delay and the search-only
observation is `not established` under VL-1. A record made under a test clock or a fixed clock left its process but
is not shown in the run's time range (L-5).

## Cleanup

Stop every application instance and the receiver. Delete Redis keys under `preets:verify:<run-uuid>:`. Remove the
extra worktrees, the receiver's files, and any Playwright output. Leave the shared local stack running unless this
run started it. Check that the repository worktree holds no probe file.

## Execution results

No slice has been executed. Results are appended here by `pnpm verify:render --write`.

### Slice A — `508687aad52551267d82870aaaac5bebffc0a323` (2026-11-15)

Generated from the verification note on `508687a` (`refs/notes/verification`). Do not edit by hand.

**Run:** `e3de6656-b5d4-4fd7-8e99-e8940c9ba4a9`, 2026-11-15T17:23:00Z to 2026-11-15T17:52:30Z.

**Conditions:** Verifier worktree detached at 508687a; base worktree at 6ac824b (plan branch tip, removed at cleanup) for the V-005 comparison. Production builds started with the frontend `start` script on 127.0.0.1:3410 (and :3000 for sign-in steps, the realm's registered redirect port); development mode with the `dev` script on :3410. Quickstart standard ENV (static springfield tenant, LOG_LEVEL=Debug, OTEL_SERVICE_NAME=pre-ets-frontend, OTEL_SERVICE_VERSION=<SHA>, OTEL_RESOURCE_ATTRIBUTES=service.version=<SHA>,service.instance.id=<per-start run UUID>, SESSION_KEY_PREFIX and OIDC_TX_KEY_PREFIX under preets:verify:<run>:). OTEL_EXPORTER_OTLP_ENDPOINT named a temporary loopback receiver on 127.0.0.1:14318 (forward mode to the local otel-lgtm on :4318, or answer mode), which logged arrival time, path, size, and synthetic-header presence only. Local stack started by this session with pre-ets-setup services: redis, keycloak (pre-ets realm, synthetic demo user), postgres, otel-lgtm. Queries through the Grafana MCP server (tempo, loki) and the same Grafana datasource proxy for scripted timing polls. Every query filtered by service.version and service.instance.id. One synthetic X-Preets-Probe collector header for step 7; value never recorded. Per-start run UUIDs: step 1 38779505-70c1-48aa-b261-7c2366c3014b; step 2 5c66dfcd-78c4-4028-a8bf-21ea12222210; step 4 ccdb6c37-2a31-4640-afdf-cb3c385081fa (immediate), 7467fce5-9e98-4bb5-8d78-9ad2340ab672 (batch); step 5 6041c60a-aed7-45f4-a21e-c3b411805800 (HEAD), 7c14fe9c-e773-4926-a032-f9b1f342d5b3 (base), 05a68a7d-03db-4739-b7c4-8a77b762d6e3 (dev batch); step 6 547d64f7-6255-4894-8c26-93618443432d (immediate), 7abf0540-b8d3-4a93-aa12-845492fcf967 (batch); step 7 fc8b4f5c-8ed0-4d3c-b9bb-58a0f6916a6c (immediate), 0d248c7d-ed59-415a-9e21-4038130d7119 (batch).

| Claim                                                                     | Result      | Observation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-001                                                                     | established | For each of the 5 requests the receiver got 7 /v1/traces exports between that request and the next; the last one arrived at most 5 ms after the response (range 3-5 ms), well before the next request. Conditions: Run 38779505-70c1-48aa-b261-7c2366c3014b. Sample of 5 requests to one route (VL-2).. Evidence: traces `42d8ad899c2fd7a32b663e78cbb338d1`, `3fdc0aa9b0ec69c5b0f9be154d32fcb2`, `e75f4214654db7cf6a8084c0d8710c83`, `b0b8614a15fbfe28b9bdf0515675f5db`, `3b2b4d647b0fec1a35b6717cd615cc17`; quickstart §A step 1: production build, TELEMETRY_EXPORT_TIMING=immediate, receiver in forward mode, five GET /login requests 3 s apart each with its own traceparent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| V-002                                                                     | established | Each of the 5 actions produced exactly one /v1/logs export, arriving 5-188 ms after the request started (188 ms on the first, cold request; 5-8 ms afterwards), i.e. before the response ended. Conditions: Run 38779505-70c1-48aa-b261-7c2366c3014b, LOG_LEVEL=Debug. Sample of 5 (VL-2).. Evidence: traces `42d8ad899c2fd7a32b663e78cbb338d1`, `3fdc0aa9b0ec69c5b0f9be154d32fcb2`, `e75f4214654db7cf6a8084c0d8710c83`, `b0b8614a15fbfe28b9bdf0515675f5db`, `3b2b4d647b0fec1a35b6717cd615cc17`; quickstart §A step 1, same five requests; each emits the debug log 'Reading tenant configuration'.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| V-003 (environment from this guide; the harness documentation lands in F) | established | Each request's trace was found 7-277 ms after its response and its log record 13-284 ms after; the MCP T-001 query returns a server span for all 5 trace IDs and T-002 returns 5 log lines carrying those trace IDs. Conditions: Partial per plan: environment from this guide (quickstart ENV, receiver forwarding to the local stack); the documentation-only path lands in slice F.. Evidence: traces `42d8ad899c2fd7a32b663e78cbb338d1`, `3fdc0aa9b0ec69c5b0f9be154d32fcb2`, `e75f4214654db7cf6a8084c0d8710c83`, `b0b8614a15fbfe28b9bdf0515675f5db`, `3b2b4d647b0fec1a35b6717cd615cc17`; queries `T-001 { resource.service.version = "508687aad52551267d82870aaaac5bebffc0a323" && resource.service.instance.id = "38779505-70c1-48aa-b261-7c2366c3014b" && resource.telemetry.sdk.language = "nodejs" && kind = server } (and per-trace lookup by trace:id)`; `T-002 {service_name="pre-ets-frontend", service_instance_id="38779505-70c1-48aa-b261-7c2366c3014b"} \|= "Reading tenant configuration" \| service_version="508687aad52551267d82870aaaac5bebffc0a323"`; quickstart §A step 1; after each response, polled the trace store by trace ID and the log store with the T-002 query every 250 ms.                                        |
| V-005                                                                     | established | Production, no setting, at HEAD: burst of 20 in 862 ms gave 1 /v1/traces export (at +5.2 s). Base revision, same burst (861 ms): 1 export (at +5.3 s). Development mode with batch: burst in 866 ms gave 1 export (at +5.0 s). Conditions: Runs 6041c60a-aed7-45f4-a21e-c3b411805800, 7c14fe9c-e773-4926-a032-f9b1f342d5b3, 05a68a7d-03db-4739-b7c4-8a77b762d6e3. Local production build (VL-4).. Evidence: quickstart §A step 5: receiver in answer mode; 20 GET /login within 1 s, trace exports counted over the next 10 s; repeated at base 6ac824b and in development mode with TELEMETRY_EXPORT_TIMING=batch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| V-007                                                                     | established | Config test file passes, 91/91. Development start with no setting: 7 /v1/traces exports, the last 9 ms after the response; one /v1/logs export 15 ms after the request started; trace queryable after 281 ms. Conditions: Run 5c66dfcd-78c4-4028-a8bf-21ea12222210 (dev, after a warm-up compile request). Production default observed under V-005.. Evidence: traces `d5346776e1c92872b06f20ae82077f4f`; Module evidence: pnpm --filter @pathableai/pre-ets-frontend-services test tests/lib/config.test.ts (91 passed). quickstart §A step 2: development mode, no TELEMETRY_EXPORT_TIMING, one request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| V-008                                                                     | established | Both starts exit with code 1 and log 'Failed to load server config' with a ConfigError 'Expected "immediate" \| "batch" at ["TELEMETRY_EXPORT_TIMING"]'; the supplied value is not echoed. Connections to the port were refused 3 s and 10 s after start, no next-server process remained, and a probe that requested /login every 20 ms from launch to exit got no HTTP response (179 refused connections, one socket closed without a response). Receiver lines: 0. Conditions: Next prints 'Ready in' before instrumentation loads the config, then the process exits about 4 s after launch without serving a request.. Evidence: Module evidence: config.test.ts (91 passed). quickstart §A step 3: production starts with TELEMETRY_EXPORT_TIMING=Batch (telemetry on) and with OTEL_SDK_DISABLED=true TELEMETRY_EXPORT_TIMING=now.                                                                                                                                                                                                                                                                                                                                                                                                            |
| V-009                                                                     | established | Under both values: 0 receiver lines; the protected document (status 200 after sign-in) has no preets-browser-tracing meta element, no traceparent meta element, and no data-preets-browser-tracing marker. Conditions: Runs ccdb6c37-2a31-4640-afdf-cb3c385081fa, 7467fce5-9e98-4bb5-8d78-9ad2340ab672. Absence for these runs only (VL-3).. Evidence: quickstart §A step 4: receiver in answer mode as the endpoint, OTEL_SDK_DISABLED=true with BROWSER_TRACING_ENABLED=true, once with immediate and once with batch; 5 GET /login, sign-in as the synthetic demo user, load /coordination/roster.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| V-021                                                                     | established | Immediate: 4 /v1/metrics exports at +60.21, +60.21, +120.21, +120.21 s after ready (2 per interval, gap 59.99 s). Batch: 4 exports at +60.18, +60.18, +120.17, +120.18 s (2 per interval, gap 59.99 s). Trace exports in the same windows: 113 immediate, 14 batch. Conditions: Runs 547d64f7-6255-4894-8c26-93618443432d, 7abf0540-b8d3-4a93-aa12-845492fcf967. Two metric readers (Node SDK and Effect bridge), each one export per interval.. Evidence: quickstart §A step 6: one request every 10 s for about 141 s under each timing, receiver in answer mode.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| V-019 (server records)                                                    | established | Server records under each timing: 41 traces, 144 spans, 41 span names, 48 attribute names, 6 resource attribute names, 14 log records with 2 messages and the same 18 log label/metadata names. The span-name, attribute-name, resource-attribute and log-message sets are equal. 0 duplicated span IDs in either run. Receiver: 158 export requests (immediate) and 3 (batch), all to /v1/traces and /v1/logs on the same endpoint, every one with the synthetic header present. Conditions: Runs fc8b4f5c-8ed0-4d3c-b9bb-58a0f6916a6c (immediate), 0d248c7d-ed59-415a-9e21-4038130d7119 (batch). Server records only; browser records are slice B. The journey's sign-out request left the page on /coordination/roster under both timings.. Evidence: queries `{ resource.service.version = "508687aad52551267d82870aaaac5bebffc0a323" && resource.service.instance.id = "<run>" } then each trace by ID`; `{service_name="pre-ets-frontend", service_instance_id="<run>"}`; quickstart §A step 7: production build, synthetic X-Preets-Probe collector header, receiver in forward mode; journey /login, followed link carrying a probe query value and fragment, sign-in, /coordination/roster, Log out; once per timing with its own run UUID. |
| V-020 (server records)                                                    | established | No exported field held the probe query value, the probe fragment, the collector header value, the run's application cookie values, or the OIDC callback's code and state. No url/http/target/route attribute held '?' or '#' (http.url and http.target present without query). Resource attributes are exactly service.name, service.version, service.instance.id, telemetry.sdk.language, telemetry.sdk.name, telemetry.sdk.version; no host.*, os.*, or process.* attribute anywhere. session.id is present, the documented opaque telemetry ID; it did not match any cookie value. Conditions: Server records only (slice B covers browser records). Absence for the seeded probes and the values captured in this run (VL-3). For a reviewer: client.address, network.peer.address and user_agent.original appear on HTTP server spans, identically under both timings; they are not named in the forbidden classes, the slice does not change them, and they were not compared with the base revision.. Evidence: queries `Same collection as V-019, every span attribute, event attribute, span name, resource attribute, log line, label and structured metadata value`; quickstart §A step 7, immediate run (batch run inspected too).       |

**Telemetry rows:** T-001 present (Server span for all 5 sampled trace IDs of run 38779505-70c1-48aa-b261-7c2366c3014b, continuing the verifier's traceparent; filterable by service.version and service.instance.id.); T-002 present (5 'Reading tenant configuration' debug lines for run 38779505-70c1-48aa-b261-7c2366c3014b, service_version in structured metadata, each carrying its request's trace ID.).

**Forbidden data observed:** none.

**Escalation:** none.

**Cleanup:** complete.

### Slice B — `5c7c296bf858e9423b47275753e372747bf41242` (2026-11-15)

Generated from the verification note on `5c7c296` (`refs/notes/verification`). Do not edit by hand.

**Run:** `4a2821df-9a73-4977-a0a4-40bd3e1afaa9`, 2026-11-15T22:25:00Z to 2026-11-15T22:50:15Z.

**Conditions:** Verifier worktree detached at 5c7c296, pnpm install --frozen-lockfile, frontend production build. Production server via the frontend `start` script on 127.0.0.1:3000 (the realm's registered redirect port) with the quickstart standard ENV (static springfield tenant, LOG_LEVEL=Debug, OTEL_SERVICE_NAME=pre-ets-frontend, OTEL_SERVICE_VERSION=<SHA>, OTEL_RESOURCE_ATTRIBUTES=service.version=<SHA>,service.instance.id=<per-start run UUID>, session and OIDC key prefixes under preets:verify:<run>:), BROWSER_TRACING_ENABLED=true except where noted, and a synthetic OTEL_EXPORTER_OTLP_HEADERS X-Preets-Probe value that is not recorded. Endpoint: the local otel-lgtm collector at http://127.0.0.1:4318/ for steps 1-4; for step 5, a temporary loopback receiver on 127.0.0.1:14318 forwarding to it, which logged arrival time, path, size, and whether the synthetic header and an Origin were present. The page exported straight to that endpoint; Playwright (Chromium) recorded its POSTs to /v1/traces. Step 3 used a scratch copy of the synthetic springfield tenant fixture with idleTimeoutMinutes=5, warningLeadMinutes=0 (removed at cleanup). The local stack (redis, keycloak, postgres, otel-lgtm) was restarted by this session. Queries through the Grafana MCP server, plus trace-by-ID lookups through the same Grafana datasource proxy for timing. Per-start run UUIDs: step 1 10d54260-bddc-405b-9a8b-1076dd7b2ba9 (immediate), 988fbcd1-84f9-4067-84ae-76d7b7a950c7 (batch), 103ea300-a13f-4444-879b-08c7a912b8f6 (browser tracing off); step 2 b15abf35-6dbc-4b78-bc69-0023df1ac98a; step 3 1dff91a2-3a67-41bf-bfa0-dbeaafb704bf (immediate), eb1b807f-ee53-4f77-9860-d5276edf2a4f (batch); step 4 988fbcd1-84f9-4067-84ae-76d7b7a950c7; step 5 runs named under V-019.

| Claim | Result      | Observation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-004 | established | For each of the 5 navigations, the page's POST to the collector's /v1/traces left 27-43 ms after the click, and a webjs Router.transition span (preets.navigation.type=push, url.path=/coordination/participant) was found by trace ID 82-381 ms after the click. The page was not kept open for a batch delay. T-003 returns all 5 records. Conditions: Sample of 5 App Router navigations to one route (VL-2). The fixtures' Link elements are document navigations and emit no Router.transition, so the router control was used.. Evidence: traces `770295ff9268f6de2e1f0f68e13237c8`, `8a26aae7400ee8963de20adbcfd7484a`, `600ef2b3afaaa2cad41b033cc9a89ebf`, `8b349891643c1828052c7b5a25d9db86`, `116c5e6194b4a0f11cea91b70c7e69d7`; queries `T-003 { resource.service.version = "5c7c296bf858e9423b47275753e372747bf41242" && resource.service.instance.id = "b15abf35-6dbc-4b78-bc69-0023df1ac98a" && resource.telemetry.sdk.language = "webjs" && name = "Router.transition" }`; quickstart §B step 2: TELEMETRY_EXPORT_TIMING=immediate; five App Router navigations through the roster's "Open participant page in place" control, each after the started marker and at least 5 s apart, returning by the document link between samples. Each trace ID is taken from the traceparent of the RSC request the record parents..                                                                                                 |
| V-006 | established | The burst made 12 Focus.move records (14 browser records in the window), and the page sent 1 export request, at +5.0 s. Conditions: Run 988fbcd1-84f9-4067-84ae-76d7b7a950c7.. Evidence: queries `{ resource.service.version = "5c7c296bf858e9423b47275753e372747bf41242" && resource.service.instance.id = "988fbcd1-84f9-4067-84ae-76d7b7a950c7" && resource.telemetry.sdk.language = "webjs" && name = "Focus.move" }`; quickstart §B step 4: TELEMETRY_EXPORT_TIMING=batch, participant page, six focus moves alternating between the participant_goal and logout_control targets plus one Tab, all within 74 ms; page export requests counted over the next 40 s.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| V-017 | established | Under both timings the click navigated at once to the identity provider's authorization endpoint. Immediate: the page's export left 37 ms after the click, and the Interaction.login record (preets.outcome=activated, preets.login.entry=expiration_modal) is in the trace store. Batch: Playwright saw no export request after the click, but the same Interaction.login record is in the trace store, together with the TabCoordination.transition to expired made 6 s earlier. Conditions: Sample of one navigating interaction per timing (L-2). The first batch query ran before Tempo had indexed the record; a repeat of the same query found it.. Evidence: traces `52f8b97dab7104a754cedb1ed8d0623`, `a5f17b6885ac9d30c81054157857446f`; queries `T-003 { RUN && resource.telemetry.sdk.language = "webjs" && name = "Interaction.login" } for runs 1dff91a2-3a67-41bf-bfa0-dbeaafb704bf and eb1b807f-ee53-4f77-9860-d5276edf2a4f`; quickstart §B step 3: signed in, roster page, left idle until the expiration modal opened (300 s, 5-minute idle fixture), then Log in again activated in the dialog; once per timing.                                                                                                                                                                                                                                                                                                     |
| V-019 | established | Each timing: 58 traces, 200 spans (177 nodejs, 23 webjs), 54 span names, 61 attribute names, 12 resource attribute names (the same six per SDK language), 18 log records with 3 messages. Span-name, attribute-name, resource-attribute and log-message sets are equal across timings for server and browser records. 0 duplicated span IDs. Receiver: server exports 195 (immediate) and 9 (batch), all to /v1/traces and /v1/logs, all with the synthetic header; page exports 23 (immediate, one per browser span) and 4 (batch), all to /v1/traces on the same endpoint, none with the header. Conditions: Step 5 runs c5f74261-9977-4e2d-a8ce-cad285018e51 (immediate) and fd341380-76f8-4f55-8b58-58ae5ee540bd (batch). The Log out click left the page on /coordination/participant under both timings.. Evidence: queries `{ resource.service.version = "5c7c296bf858e9423b47275753e372747bf41242" && resource.service.instance.id = "<run>" } then each trace by ID`; `{service_name="pre-ets-frontend", service_instance_id="<run>"}`; quickstart §B step 5 (with the §A step 7 server comparison at this SHA): browser tracing on, synthetic collector header, server and page exporting through the forwarding receiver; journey /login, followed link with probe query and fragment, sign-in, /coordination/roster with probe query and fragment, App Router navigation to the participant page, Log out; once per timing. |
| V-020 | established | No exported field of any server or browser record held the probe query value, the probe fragment, the collector header value, the run's cookie values, or the OIDC callback's code and state. No url/http/target/route attribute held '?' or '#'; browser url.path values are pathnames only. Browser attribute keys are all within the export filter's allow list plus url.path, and browser record names are documented ones (documentLoad, documentFetch, GET, POST, Router.transition, Focus.move, TabChannel.send, TabCoordination.transition). Resource attributes are only service.name, service.version, service.instance.id and telemetry.sdk.* for both languages; no host.*, os.* or process.* attribute. Under immediate timing no page export request was empty (smallest 1131 bytes). Conditions: Absence for the seeded probes and the values captured in these runs (VL-3). As in slice A, server HTTP spans carry client.address, network.peer.address and user_agent.original under both timings. They are not forbidden classes and the feature does not change them.. Evidence: queries `Same collection as V-019: every span name, span and event attribute, resource attribute, log line, label and structured-metadata value of both runs`; quickstart §B step 5, immediate run (batch run inspected the same way).                                                                                              |
| V-022 | established | Immediate: the preets-browser-tracing meta content has exactly endpoint, exportTiming, serviceInstanceId, serviceName and serviceVersion, with exportTiming=immediate, the collector endpoint, and serviceInstanceId equal to the run. The document holds neither the collector header name nor its value. Batch: the same five keys with exportTiming=batch. Browser tracing off: no preets-browser-tracing or traceparent meta element, and the page made 0 export requests. Conditions: Runs 10d54260-bddc-405b-9a8b-1076dd7b2ba9, 988fbcd1-84f9-4067-84ae-76d7b7a950c7, 103ea300-a13f-4444-879b-08c7a912b8f6.. Evidence: Module evidence: config.test.ts 93 passed; frontend test:unit 154 passed. quickstart §B step 1: protected document after sign-in, read through Playwright, with OTEL_EXPORTER_OTLP_HEADERS configured on the server; under immediate, batch, and without BROWSER_TRACING_ENABLED.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

**Telemetry rows:** T-003 present (Router.transition (5 records, run b15abf35-6dbc-4b78-bc69-0023df1ac98a), Interaction.login (both step 3 runs), Focus.move and the other documented browser records, each with webjs resource, service.version and service.instance.id.).

**Forbidden data observed:** none.

**Escalation:** none.

**Cleanup:** complete.

### Slice A — `f5de87fd644b1c4cf657f6c50749dd30f7355344` (2026-11-16)

Generated from the verification note on `f5de87f` (`refs/notes/verification`). Do not edit by hand.

This run supersedes the `508687a` report above.

**Run:** `8fcd30f9-1fbb-43ee-8644-cbf2b1314817`, 2026-11-16T11:38:00Z to 2026-11-16T11:51:05Z.

**Conditions:** Round 2 after a rebase onto the corrected spec and plan (bf6a68a). The verifier checked `git range-diff 6ac824b..8ff0f5f bf6a68a..f5de87f` (5/5 identical) and that 8ff0f5f..f5de87f and 6ac824b..bf6a68a change nothing outside specs/. Full §A procedure repeated at f5de87f. Verifier worktree detached at f5de87f, and a base worktree at bf6a68a (plan tip, removed at cleanup) for the V-005 comparison; frozen-lockfile installs and frontend production builds. Production builds through the frontend `start` script on 127.0.0.1:3410 (and :3000 for sign-in steps); development mode through `dev` on :3410. Quickstart standard ENV (static springfield tenant, LOG_LEVEL=Debug, OTEL_SERVICE_NAME=pre-ets-frontend, OTEL_SERVICE_VERSION=<SHA>, OTEL_RESOURCE_ATTRIBUTES=service.version=<SHA>,service.instance.id=<per-start run UUID>, key prefixes under preets:verify:<run>:). OTEL_EXPORTER_OTLP_ENDPOINT named a temporary loopback receiver on 127.0.0.1:14318 (forward to the local otel-lgtm, or answer mode) that logged arrival time, path, size and synthetic-header presence only. Local stack started by this session. Timing polls by trace ID through the Grafana datasource proxy. Per-start run UUIDs: step 1 0a181c46-fbf3-48b4-ac79-6cd90d215ea6; step 2 af5cffc9-7d6a-436f-8205-05e1584c72a3; step 4 56c65f28-d15e-40ec-a7d0-2f6773e08532 (immediate), c8cc617f-0679-4254-b001-cf58a0d6ee57 (batch); step 5 f8e0c214-c4e8-4bb1-a6ed-8f23ba14fd16 (HEAD), 72faadb0-4959-45c6-9e0a-b73a8b9307c2 (base), 903ddd2a-951f-42eb-b527-d6d607d01de6 (dev batch); step 6 11b4c52f-578e-48df-9c2b-7c0cc273b729 (immediate), 7b2c7d1f-3899-4c6e-9663-a076e757bd88 (batch); step 7 4ecec3f6-23a0-40f1-9e05-a05d7642bc98 (immediate), 5c46a806-b8f3-44db-bb1d-63b52d0a3fb5 (batch).

| Claim                                                                     | Result      | Observation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-001                                                                     | established | Each request produced at least 7 /v1/traces exports before the next request; the last arrived 1-8 ms after the response. Conditions: Run 0a181c46-fbf3-48b4-ac79-6cd90d215ea6. Sample of 5 (VL-2).. Evidence: traces `372bf23bbcca79ee1bab474d57589102`, `c543057f859a3ecc4f17f69d2470dbb9`, `ca81b292c0e574b97481f32feec59302`, `587dd156abd9209c2289577538dd5908`, `4a20eceba715977981be31f1d6493591`; quickstart §A step 1: production build, TELEMETRY_EXPORT_TIMING=immediate, receiver forwarding, five GET /login 3 s apart, each with its own traceparent.                                                                                                                                                                                                                                                                                                   |
| V-002                                                                     | established | One /v1/logs export per action, arriving 5-215 ms after the request started (215 ms on the first, cold request). Conditions: Run 0a181c46-fbf3-48b4-ac79-6cd90d215ea6, LOG_LEVEL=Debug. Sample of 5 (VL-2).. Evidence: traces `372bf23bbcca79ee1bab474d57589102`, `c543057f859a3ecc4f17f69d2470dbb9`, `ca81b292c0e574b97481f32feec59302`, `587dd156abd9209c2289577538dd5908`, `4a20eceba715977981be31f1d6493591`; quickstart §A step 1, the same five requests, each emitting the debug 'Reading tenant configuration' log.                                                                                                                                                                                                                                                                                                                                          |
| V-003 (environment from this guide; the harness documentation lands in F) | established | Each request's trace was read by its ID 267-294 ms after the response, and its T-002 record was found 275-302 ms after it. Conditions: Partial per plan: environment from this guide; the documentation-only path is slice F.. Evidence: traces `372bf23bbcca79ee1bab474d57589102`, `c543057f859a3ecc4f17f69d2470dbb9`, `ca81b292c0e574b97481f32feec59302`, `587dd156abd9209c2289577538dd5908`, `4a20eceba715977981be31f1d6493591`; queries `T-001 direct read: GET tempo /api/traces/<trace ID of the traceparent sent>, every 250 ms from the response`; `T-002 {service_name="pre-ets-frontend", service_instance_id="0a181c46-fbf3-48b4-ac79-6cd90d215ea6"} \|= "Reading tenant configuration" \| service_version="f5de87fd644b1c4cf657f6c50749dd30f7355344"`; quickstart §A step 1 as corrected at bf6a68a: T-001 read by the trace ID of the traceparent sent. |
| V-005                                                                     | established | HEAD, production, no setting: a burst in 862 ms gave 1 /v1/traces export (+5.26 s). Base: the same burst in 862 ms gave 1 export (+5.26 s). Development with batch: a burst in 870 ms gave 1 export (+5.05 s). Conditions: Local production build (VL-4).. Evidence: quickstart §A step 5: receiver in answer mode, 20 GET /login within 1 s, trace exports counted over 10 s; at f5de87f with no setting, at base bf6a68a, and in development mode with TELEMETRY_EXPORT_TIMING=batch.                                                                                                                                                                                                                                                                                                                                                                              |
| V-007                                                                     | established | Development, no setting: 7 trace exports, the last 6 ms after the response; one log export 25 ms after the request started; the trace was readable 300 ms after the response. Conditions: Run af5cffc9-7d6a-436f-8205-05e1584c72a3.. Evidence: traces `79fd9c5f47af7b75ff1a372af378930d`; Module evidence: config.test.ts at f5de87f, 91 passed. quickstart §A step 2: development mode, no TELEMETRY_EXPORT_TIMING, one request.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| V-008                                                                     | established | Both starts exited with code 1. The startup log gives the ConfigError 'Expected "immediate" \| "batch" at ["TELEMETRY_EXPORT_TIMING"]' and does not repeat the supplied value. 10 s later no next-server process remained and the port refused connections. Conditions: None.. Evidence: Module evidence: config.test.ts (91 passed). quickstart §A step 3: production starts with TELEMETRY_EXPORT_TIMING=Batch, and with OTEL_SDK_DISABLED=true TELEMETRY_EXPORT_TIMING=now.                                                                                                                                                                                                                                                                                                                                                                                       |
| V-009                                                                     | established | Under both values: 0 receiver lines, and the protected document (200) has no preets-browser-tracing meta element, no traceparent meta element, and no tracing marker. Conditions: Absence for these runs (VL-3).. Evidence: quickstart §A step 4: receiver in answer mode as the endpoint, OTEL_SDK_DISABLED=true with BROWSER_TRACING_ENABLED=true, under immediate and under batch; 5 GET /login, sign-in, /coordination/roster.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| V-021                                                                     | established | Immediate: 4 /v1/metrics exports at +60.31, +60.31, +120.31, +120.31 s. Batch: 4 at +60.18, +60.18, +120.17, +120.18 s. Two per 60 s interval under both timings (113 and 14 trace exports in the same windows). Conditions: Two metric readers, each exporting once per interval.. Evidence: quickstart §A step 6: one request every 10 s for about 141 s under each timing, receiver in answer mode.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| V-019 (server records)                                                    | established | Under each timing: 41 traces, 144 server spans, 41 span names, 48 attribute names, 6 resource attribute names, 14 log records with 2 messages. All sets are equal across timings. 0 duplicate span IDs. Receiver: 158 (immediate) and 3 (batch) exports, all to /v1/traces and /v1/logs, all with the synthetic header. Conditions: Server records only (slice B covers browser records).. Evidence: queries `{ resource.service.version = "f5de87fd644b1c4cf657f6c50749dd30f7355344" && resource.service.instance.id = "<run>" } then each trace by ID`; `{service_name="pre-ets-frontend", service_instance_id="<run>"}`; quickstart §A step 7: synthetic X-Preets-Probe collector header, receiver forwarding; /login, a followed link with a probe query and fragment, sign-in, /coordination/roster, Log out; once per timing.                                  |
| V-020 (server records)                                                    | established | No exported field held the probe query value, the fragment, the header value, the run's cookie values, or the OIDC code and state. No url/http/target attribute held '?' or '#'. Resource attributes are only service.name, service.version, service.instance.id and telemetry.sdk.*, with no host.*, os.* or process.*. Conditions: Server records only. Absence for the seeded probes and captured values (VL-3). client.address, network.peer.address and user_agent.original are present on HTTP server spans under both timings, as in round 1.. Evidence: queries `Same collection as V-019, every field of every record`; quickstart §A step 7, both runs.                                                                                                                                                                                                    |

**Telemetry rows:** T-001 present (All 5 sampled traces read by trace ID, server spans continuing the verifier's traceparent, with service.version and service.instance.id.); T-002 present (One 'Reading tenant configuration' record per sampled request for run 0a181c46-fbf3-48b4-ac79-6cd90d215ea6, with service_version in structured metadata.).

**Forbidden data observed:** none.

**Escalation:** none.

**Cleanup:** complete.
