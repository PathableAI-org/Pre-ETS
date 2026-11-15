# Quickstart: Validate Configurable Telemetry Export Timing

This guide turns the approved [verification plan](verification.md) into steps an agent can run against a pushed
slice. It is the planned execution mapping. Results are appended under [Execution results](#execution-results) by
`pnpm verify:render --write`, never written by hand. Signals and queries are in
[contracts/telemetry.md](contracts/telemetry.md); module contracts are in [contracts/modules.md](contracts/modules.md).

## Claim and boundary map

Each claim is observed once, at the boundary that can establish it. "Receiver" means the temporary local receiver
described below. Limitation IDs are those of [plan.md](plan.md#phase-7--implementation-slices) (`L-n`) and of
`verification.md`, whose bullets the request numbers `VL-1` (the local stack's own delay) to `VL-7`.

| Claims | Feature evidence (this guide)                                                                                    | Supporting module evidence           | Slice(s)    | Limits                 |
| ------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------- | ---------------------- |
| V-001  | §A: five requests three seconds apart; each trace export reaches the receiver within 1 s of its response         | —                                    | A           | VL-2 sample            |
| V-002  | §A: the same five requests; each log export reaches the receiver within 1 s                                      | —                                    | A           | VL-2 sample            |
| V-003  | §A: T-001 and T-002 found within 10 s through the forwarding receiver; §F: the same from the documentation       | —                                    | A (part), F | VL-1 stack delay       |
| V-004  | §B: export request within 1 s of each interaction (Playwright); T-003 found within 10 s                          | —                                    | B           | VL-1                   |
| V-005  | §A: 20-request burst gives fewer than 20 trace exports, as at the base revision, and in development with `batch` | —                                    | A           | Local production build |
| V-006  | §B: at least five browser records within 1 s give fewer export requests than records                             | —                                    | B           | —                      |
| V-007  | §A: one development-mode start with no setting shows the V-001 observation                                       | Config examples and property (A)     | A           | —                      |
| V-008  | §A: one real start per case exits with an error naming the setting and serves no request                         | Config property, OTEL on and off (A) | A           | —                      |
| V-009  | §A: telemetry off with each value; zero receiver requests; the protected document has no tracing configuration   | —                                    | A           | VL-3 absence           |
| V-010  | §F: each workflow states its mode; each suite's CI command sends zero requests to the stack's address            | —                                    | F           | VL-3 absence           |
| V-011  | §D: a tagged BDD run through the command; T-001 and T-002 found by the run's identifiers within 10 s             | —                                    | D           | VL-1                   |
| V-012  | §E: one unit and one integration selection; T-004 found within 10 s of the command returning                     | —                                    | E           | VL-1; L-3              |
| V-013  | §D (BDD selection) and §E (unit and integration): identical per-test results across three runs; each run ends    | The suites themselves                | D (part), E | VL-2 selection; L-4    |
| V-014  | §D: two concurrent runs selected apart by T-001; the off switch gives zero requests                              | `tests/tooling/test-run.test.ts` (D) | D           | —                      |
| V-015  | §C: under each timing, a request less than 1 s before `SIGTERM`; its trace and log export are at the receiver    | —                                    | C           | L-1                    |
| V-016  | §D (BDD) and §E (unit, integration): under each timing the last test's records are at the receiver at return     | —                                    | D (part), E | —                      |
| V-017  | §B: the record of an interaction that navigates at once is found (T-003), under each timing                      | —                                    | B           | L-2                    |
| V-018  | §C: fixed journey with the receiver refusing matches the journey with it reachable; `SIGTERM` ends the process   | —                                    | C           | L-4                    |
| V-019  | §A (server) and §B (browser): equal name and attribute sets under both timings; header present; no duplicate     | —                                    | A (part), B | VL-2                   |
| V-020  | §A (server) and §B (browser): no probe value or forbidden class in any exported field under immediate timing     | —                                    | A (part), B | VL-3                   |
| V-021  | §A: two metric intervals under each timing; the same export times and counts                                     | —                                    | A           | —                      |
| V-022  | §B: the received document holds the four values and the timing, with headers configured; none when off           | Browser-settings example (B)         | B           | —                      |
| V-023  | §F: a fresh worktree and the documentation alone give V-001 and V-003; the modes are stated once                 | —                                    | F           | —                      |

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
   within 1 second, and before the next request. Right after each response run the T-001 and T-002 queries and
   record the time until the records are found. Expected: within 10 seconds.
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
   For each, record the time from the click to the page's `POST …/v1/traces` request that follows it, then run the
   T-003 query for `Router.transition`. Expected: the request within 1 second, the record within 10 seconds, and
   no 30-second wait.
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
   prints. As soon as it returns, run the T-001 and T-002 queries with that identifier. Expected: the owned
   application's records are found within 10 seconds.
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
   `pnpm test:telemetry pnpm --filter @pathableai/pre-ets-frontend-services test tests/lib/session.test.ts` and
   `pnpm test:telemetry pnpm --filter @pathableai/pre-ets-frontend-services test:integration tests/integration/session-redis.test.ts`.
   After each returns, run the T-004 queries with the printed identifier. Expected: `SessionService.*` spans of the
   run within 10 seconds.
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
T-001  { RUN && resource.telemetry.sdk.language = "nodejs" && kind = server && trace:id = "<trace-id>" }
T-002  {service_name="pre-ets-frontend", service_instance_id="<run-uuid>"} |= "Reading tenant configuration" | service_version="<sha>"
T-003  { RUN && resource.telemetry.sdk.language = "webjs" && name = "Router.transition" }
T-003  { RUN && resource.telemetry.sdk.language = "webjs" && name = "Interaction.login" }
T-004  { resource.service.instance.id = "<run-uuid>" && name =~ "SessionService.*" }
Sets   { RUN } | select(name, resource.service.name)      then get_tempo_trace for each trace to list attribute names
```

An empty result is inconclusive until the receiver or Playwright shows that the export request left. A record that
left within 1 second but is found later than 10 seconds makes the claim `not established` under VL-1.

## Cleanup

Stop every application instance and the receiver. Delete Redis keys under `preets:verify:<run-uuid>:`. Remove the
extra worktrees, the receiver's files, and any Playwright output. Leave the shared local stack running unless this
run started it. Check that the repository worktree holds no probe file.

## Execution results

No slice has been executed. Results are appended here by `pnpm verify:render --write`.
