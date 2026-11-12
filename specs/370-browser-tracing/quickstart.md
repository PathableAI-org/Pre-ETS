# Quickstart: Browser Tracing for the Verification Harness

**Plan**: [plan.md](plan.md) | **Feature verification**: [verification.md](verification.md) |
**Telemetry**: [contracts/telemetry.md](contracts/telemetry.md)

**Status**: Planned execution mapping. No step below has been executed. Implementation slices append results under
[Execution results](#execution-results).

This guide turns the approved verification procedure into commands for this implementation. It does not add claims.
Module evidence (V-007 and the coordination parse example) runs in Vitest and is not repeated here.

## Prerequisites

- A clean checkout of the revision under assessment, `pnpm install --frozen-lockfile`, and
  `pnpm --filter @pathableai/pre-ets-frontend build`.
- Redis, Keycloak, and the observability profile:

  ```sh
  docker compose up -d --wait redis keycloak
  docker compose --profile observability up -d otel-lgtm --wait
  ```

- Grafana MCP from `.mcp.json`; Playwright able to open several pages in one context, capture request headers and
  response bodies, and drive back/forward navigation.
- A run UUID `<run>` and the revision `<sha>`. Application environment for each instance (port `<port>`):

  ```sh
  OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318/ \
  OTEL_SERVICE_NAME=pre-ets-frontend \
  OTEL_SERVICE_VERSION=<sha> \
  OTEL_RESOURCE_ATTRIBUTES=service.version=<sha>,service.instance.id=<run> \
  SESSION_KEY_PREFIX=preets:verify:<run>:session:v1 \
  OIDC_TX_KEY_PREFIX=preets:verify:<run>:oidc-tx:v1 \
  TENANT_CONFIG_DIR=<checkout>/fixtures/tenant-config \
  TENANT_RESOLUTION=static \
  TENANT_STATIC_ALIAS=springfield \
  BROWSER_TRACING_ENABLED=true \
  PORT=<port> pnpm --filter @pathableai/pre-ets-frontend start
  ```

  Off combinations change only `BROWSER_TRACING_ENABLED` (unset) or set `OTEL_SDK_DISABLED=true`. Both key prefixes
  sit under the run prefix the [verification harness](../../docs/engineering/verification-harness.md#environment)
  requires. Every run sets them, whether or not it uses the fixture.
- An application session on the protected coordination fixtures (`/coordination/roster`,
  `/coordination/participant`). Use a real login, or the [prepared-session fixture](#prepared-session-fixture) for
  the claims `verification.md` permits it for. If neither can be established, record the steps that need a session as
  `blocked`.
- Synthetic probe values for this run: a typed string, a query-string value, and a fragment.
- Readiness marker: before any sampled step with tracing on, wait for
  `document.documentElement.dataset.preetsBrowserTracing === "started"` (plan limitation PL-1). After the last step of
  a journey, keep the page open about 30 seconds before querying (spec L2).
- Temporary in-page probe (V-008; verification aid only, never committed). Evaluate in the page after the step's
  transition:

  ```js
  ;({
    marker: document.documentElement.dataset.preetsBrowserTracing ?? null,
    otelGlobals: Object.keys(globalThis[Symbol.for("opentelemetry.js.api.1")] ?? {}),
    tracingChunks: performance.getEntriesByType("resource")
      .filter((entry) => /opentelemetry|browser-tracing/i.test(entry.name)).length
  })
  ```

  "Not initialized" means `marker` is `null`, `otelGlobals` contains none of `trace`, `context`, and `propagation`, and
  `tracingChunks` is `0`. Chunk names are build output, so the network capture remains the primary check for the
  download.

## Prepared-session fixture

This procedure implements the `verification.md` prepared-session fixture. It replaces only the OIDC login. It covers
V-001–V-006 and V-008–V-017. V-007 is a module test and needs no session. For V-003, the sign-in redirect chain still
starts in a context with no session cookie, and the fixture serves only the export-request observation.

**Owner of the shape.** The session module in frontend-services owns the record. `src/session.ts` is the module's
public entry, and `SessionService.establish` is its only writer. It encodes the version-2 record through the private
`session/codec.ts` and creates the key through the private `session/store.ts`. The key is
`<SESSION_KEY_PREFIX>:<base64url(sha256(reference))>`, the TTL equals the idle timeout, and the opaque reference is
the cookie value. The fixture calls `establish` itself, so it writes the same shape, key, and TTL as the login
callback. Only the OIDC exchange is skipped. No application code changes, no product capability is added, and no
JSON is built by hand. The script below is a verification aid and is never committed.

**Synthetic inputs.**

- Tenant `springfield`, from `fixtures/tenant-config/springfield.json`. That file sets no session policy, so the
  effective policy is the default: a 30-minute idle timeout and a 5-minute warning lead (`effectiveSessionPolicy`).
- Identity: issuer `http://127.0.0.1:8080/realms/pre-ets`, the fixture's own issuer, and subject
  `preets-verify-<run>`. Neither is a real account or personal data, and no credential is involved.

**1. Write the record.** Build frontend-services first
(`pnpm --filter @pathableai/pre-ets-frontend-services build`). Then run the following from
`packages/frontend-services`, so the workspace's own `effect` and `@effect/platform-node` resolve. The `react-server`
condition is needed because the tenant module imports `server-only`. The script prints only the reference; never put
the reference in results.

```sh
REFERENCE=$(RUN=<run> node --conditions=react-server --input-type=module <<'EOF'
import { NodeRedis } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { SessionService } from "./dist/session.js"

const run = process.env.RUN
const sessions = SessionService.layer({ keyPrefix: `preets:verify:${run}:session:v1` }).pipe(
  Layer.provide(NodeRedis.layer({ url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379" }))
)
const program = Effect.gen(function*() {
  const service = yield* SessionService
  const established = yield* service.establish({
    identity: { issuer: "http://127.0.0.1:8080/realms/pre-ets", subject: `preets-verify-${run}` },
    policy: { idleTimeoutMinutes: 30, warningLeadMinutes: 5 },
    tenantAlias: "springfield"
  })
  const read = yield* service.readForTenant({ reference: established.reference, tenantAlias: "springfield" })
  if (read._tag !== "UsableSession") return yield* Effect.die("prepared session is not usable")
  return established.reference
})
process.stdout.write(await Effect.runPromise(program.pipe(Effect.provide(sessions))))
EOF
)
```

The key prefix must equal the instance's `SESSION_KEY_PREFIX`. A dry run on 2026-11-11 against the compose Redis wrote
one key under `preets:verify:<run>:session:v1:`, read it back as `UsableSession`, and deleted it.

**2. Set the cookie.** In the Playwright context, before the first protected navigation:

```js
await context.addCookies([{
  httpOnly: true,
  name: "pathable-session",
  sameSite: "Lax",
  url: "http://127.0.0.1:<port>",
  value: process.env.REFERENCE
}])
```

`pathable-session` is `SESSION_COOKIE`, exported from frontend-services. A `url` cookie is host-only with path `/`,
and `Secure` is left off because the instance is plain HTTP on loopback. These are the attributes `setSessionCookie`
gives a real login there. Cookies do not separate ports, so one record serves every instance in the run that shares
the prefix.

**3. Renew when needed.** Logging out deletes the record, and so does an expired deadline. Write a fresh record and
replace the cookie before the next protected step. That applies after steps 2 (once per instance), 4, 7, 8, and 9.

**4. Clean up.** Step 11 deletes every key under the run prefix, including the record:

```sh
docker compose exec redis sh -c "redis-cli --scan --pattern 'preets:verify:<run>:*' | xargs -r redis-cli del"
```

Then confirm that `redis-cli --scan --pattern 'preets:verify:<run>:*'` returns nothing.

**Recording.** Each result records its session source: `real login` or `prepared-session fixture`. A fixture-backed
result cites limitation **L-fixture**: it establishes nothing about authentication, the sign-in callback, or session
issuance.

## Steps

| Step | Claims                                                       | Slice                       | Procedure (implementation-aware)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Expected observation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | all                                                          | all                         | Record revision, date, `<run>`, collector image digest, port, and switch settings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2    | V-007, V-008                                                 | `config`, `export`          | Start three instances: OTEL on and switch unset; `OTEL_SDK_DISABLED=true` with switch `true`; both off. Each: load `/coordination/roster`, activate Log out, capture the document and all requests. Search the document for `meta[name="traceparent"]` and `meta[name="preets-browser-tracing"]`, any request to `127.0.0.1:4318`, any request for a tracing chunk, and any outgoing `traceparent` not injected by Playwright. After the transition, run the temporary in-page probe (below). After one minute, run `{ RUN && resource.telemetry.sdk.language = "webjs" }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Zero meta elements, probe reports not initialized, zero collector requests, no tracing chunk, zero browser-added `traceparent`, zero browser records. With `BROWSER_TRACING_ENABLED=maybe`, startup fails (research D1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 3    | V-009                                                        | `config`                    | Start with both on and `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <synthetic>`. Load a protected page and read the `preets-browser-tracing` content.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Exactly `endpoint`, `serviceName`, `serviceVersion`, `serviceInstanceId`; no header name or value anywhere in the document. Startup log contains T-008.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 4    | V-001, V-006, V-010, V-011                                   | `export`, `facts`           | Both on, with the harness's own `traceparent` injection turned off for this step. Load `/coordination/roster` and wait for the marker. Sample one transition of each request kind, one at a time and at least 5 seconds apart (PL-2), in this order, while the session is still current: (a) submit a coordination fixture Server Action form (Server Action); (b) set the `preets-session-current:v1` hint in `localStorage` to a synthetic other tag so the submit guard holds the next submission, submit the form, and let it confirm and replay; (c) after 5 seconds, submit the form again; (c2) overlap, transient: after the marker, install an in-page probe (not committed). It replaces `window.fetch` with an outer wrapper that holds requests carrying a `Next-Action` header until released, and it counts `submit` events. The roster form runs actions through a sequential `useActionState` queue and disables its button while pending, so only the first request can be outstanding. Submit the form, and confirm the probe holds one request. Generate the second submit with `form.requestSubmit()`, which React queues behind the first. Confirm the probe counted two submit events, so the slot is ambiguous. Release the first request at once. The queued action then dispatches and is released within the 5-second ambiguity window. (c3) overlap with replay, transient: with the same probe, submit and confirm one held request. Set the other-session hint and call `form.requestSubmit()`, so the guard cancels and, after confirmation, replays it. Confirm three submit events, then release the first request; the replayed action dispatches within the window. (d) activate "Open participant page in place" on the roster, which navigates through the App Router (RSC, research D17); (e) last, activate Log out (data fetch), which ends the session and unmounts the protected content. Capture export requests and preflights. After the export delay, run the T-004 V-001 query and the T-009 and T-010 queries, then `get_tempo_trace` on each result. Start a second instance with `<run2>` concurrently, repeat, and run each run's filter. | (a) and (c) each give `Interaction.submit` → `POST` → a server span, in separate traces. (b) gives two `Interaction.submit` spans: the cancelled one has no request child, and the replay → `POST` → a server span. No POST is parented on another submit's span. (c2) gives two `Interaction.submit` spans and two root `POST` spans with no interaction parent: an ambiguous overlap is left unparented. (c3) gives three `Interaction.submit` spans and two root `POST` spans: cancelling the guarded submission does not clear the ambiguity. Remove the probe after (c3). (d) gives `Router.transition` → `GET` → a server span. (e) gives `TabCoordination.transition` (`content_shown → logging_out`) → `POST` (`url.path = /auth/logout`) → the server `logout` span. Export goes only to the collector URL, with a 2xx preflight and response and no `Authorization` or `Cookie`. Each run filter returns only its own records. |
| 5    | V-002, V-003                                                 | `export`                    | Both on, marker present, harness `traceparent` injection still off. Trigger a `GET /session/status` (wait for confirmation, or conceal and resume a tab), submit a coordination fixture Server Action, and activate "Open participant page in place" on the roster (RSC request, research D17). Following the fixture `Link` is a full document navigation and belongs to step 6. Capture each request's headers. Run the T-003 query per `url.path`. Then, in a fresh context, open a protected page without a session so the server redirects to the identity provider; capture every cross-origin request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Each same-origin fetch request carries `traceparent` whose trace contains a server span below the browser `GET`/`POST`. No cross-origin request (identity provider, collector) carries a browser-added `traceparent`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 6    | V-004, V-005                                                 | `export`                    | Both on. Navigate to `/coordination/roster` by URL, once without and once with a Playwright `traceparent`. Read the `traceparent` meta, then run the T-001 query. Navigate to `/coordination/participant` by its fixture `Link`, then press Back. Record every new `documentLoad` for the roster and its trace ID, and the server document requests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `documentLoad` trace ID equals the meta trace ID and the server span that rendered it (the Playwright trace ID in the second case). After Back, either no new `documentLoad` exists, or each new one is in a different trace that starts with a new server render (on protected pages `RestoredPageGuard` reloads, so expect one new trace). V-005 is violated only if a new `documentLoad` joins the original trace (`{ RUN && name = "documentLoad" } \| count() > 1` returns that trace).                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 7    | V-013, V-014, V-015                                          | `facts`                     | Two pages (A, B) on one session in one context. Do not install a Playwright clock or override `Date.now` in either page. With B visible and its content shown, write the current-session hint in B naming a synthetic other tag: `localStorage.setItem("preets-session-current:v1", JSON.stringify({ coordinationTag: "verify-other-<run>" }))`. That is the value the application writes when another session loads in this browser. Then run `document.dispatchEvent(new Event("visibilitychange"))` in B. B's resume handler runs, sees a hint naming another session, conceals at once, and restores after `GET /session/status` confirms the session. The earlier freeze-and-advance trigger does not work, for three reasons. In Playwright Chromium, CDP `Page.setWebLifecycleState` delivers no `freeze`, `resume`, or `visibilitychange` event, so B's resume handler never runs. Advancing B's clock, with the context clock or a page-only `Date.now` override, also moves B's span timestamps, because the web SDK reads `Date.now`. The restore record then lands in a future-dated trace that Tempo search cannot return. And a visible B confirms at its own deadline and adopts the renewal without concealing. On `/coordination/participant` in A, activate "Focus later" and wait for focus to reach Goal. Tab to Log out in A and press Enter; let the signed-out heading take focus. Record Playwright's order of visible states and focus. Query T-004, T-005/T-006 (match by `preets.tab.message.id`), and T-007. For B's resume, also run `{ RUN && name = "TabCoordination.transition" && span.preets.ui.to_state = "content_concealed" } > { RUN && kind = client && span.url.path = "/session/status" } > { RUN && resource.telemetry.sdk.language = "nodejs" && kind = server }`.                                                                                                                                                                                                                                                                                                                                                                               | In B: `content_shown → content_concealed → content_shown`, with the resume concealment parenting its `GET /session/status` and the server span below it, then a transition from its current content state to `signed_out` (B never enters `logging_out`). In A: `content_shown → logging_out → signed_out`. All in Playwright's order. Each send ID has receipts of the same kind with the same ID. Focus: `participant_goal` `entered` `application`; `logout_control` `entered` `user`; `signed_out_heading` `entered` `application`.                                                                                                                                                                                                                                                                                                                                                                                                  |
| 7b   | T-011 (buffer overflow diagnostic; transient, not committed) | `facts`                     | Both on, a fresh page. Before navigation, add a Playwright route on `**/_next/static/chunks/**` that fetches each response and, when its body contains the string literal `v1/traces` (only the lazy SDK chunk builds the export URL; class names may be minified), holds it for 8 seconds before fulfilling it. All other chunks pass through. Load `/coordination/participant`. While the SDK chunk is held (the marker is absent), press Tab and Shift+Tab between Goal and Log out at least 150 times, which is more than 256 focus facts, within 6 seconds. Let the chunk through and wait for the marker. Remove the route. After the export delay, query `{ RUN && name = "BrowserTracing.buffer" } \| select(span.preets.tracing.dropped_count)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | One `BrowserTracing.buffer` span with `preets.outcome = overflowed` and `preets.tracing.dropped_count` greater than 0. The first 256 buffered facts are exported with their original start times, which precede the buffer span. If the hold exceeds 10 seconds, the marker never appears and no browser record exports, which is the timeout path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 8    | V-016                                                        | `export` (partial), `facts` | Journey with the probe string typed, a link to `/coordination/participant?<probe>#<probe>`, protected content, cross-tab messages, and logout. Fetch every browser trace of the run and walk every text-bearing field: span names, attribute values, event names and values, status descriptions, and resource values.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Zero probe values; no `?` or `#` in any `url.path`; only allow-listed keys (contract); empty status descriptions; no forbidden-class values. Record only locations of any match, never the value.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 9    | V-012                                                        | `export`                    | Make the collector unreachable for this run only, without stopping the shared stack: `page.route("http://127.0.0.1:4318/**", (route) => route.abort())` in every page of the context, or start this run's instance with `OTEL_EXPORTER_OTLP_ENDPOINT` set to an unused local port. Repeat step 7. Remove the route, or restart the instance against the shared collector.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Same visible outcomes, focus, and protected-request results as a run with `BROWSER_TRACING_ENABLED` unset.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 10   | V-017                                                        | `facts`                     | In a fresh worktree, follow only `docs/observability.md` and `docs/docker-compose.md` to start the stack and the app with browser tracing; load a protected page and run the T-001 query.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Export accepted and `documentLoad` queryable, with no undocumented step.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 11   | —                                                            | all                         | Stop instances; delete `preets:verify:<run>:*` keys; remove the fresh worktree; leave the shared stack running unless this run started it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Steps 2 and 9 are the hand-run browser checks that `verification.md` names as the only evidence for V-008 and
V-012.

Every step that loads a protected page (2–10) runs on a session from a real login or the
[prepared-session fixture](#prepared-session-fixture). Step 5's sign-in redirect chain is the exception: it starts in
a fresh context with no `pathable-session` cookie, and only its export-request observation uses the fixture. In step
10 the documentation starts the stack and the application. The session is then set up with the fixture and recorded
as a step the documentation did not supply.

## Slice request mapping

| Slice    | Steps to request                           | Claims asserted in full                                       | Claims asserted in part                                                                 | Session                                                                                              |
| -------- | ------------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `config` | 2 (document only), 3                       | V-007, V-009                                                  | V-004 (meta carries server context), V-008 (document has no config or context when off) | [Prepared-session fixture](#prepared-session-fixture) for V-004, V-008, and V-009. V-007 needs none. |
| `export` | 2, 4 (export and filters only), 5, 6, 8, 9 | V-002, V-003, V-004, V-005, V-006, V-008, V-010, V-011, V-012 | V-016 (automatic records only)                                                          | Prepared-session fixture for every step. V-003's sign-in redirect chain starts without a session.    |
| `facts`  | 4, 7, 7b, 8, 10                            | V-001, V-013, V-014, V-015, V-016, V-017                      | —                                                                                       | Prepared-session fixture for every step, renewed after logout or expiry (fixture step 3).            |

## Execution results

Each slice appends one block in this form:

```md
### <slice> — <sha>, <date>, run <run>

- Collector image: <digest>. Port(s): <port>. Switch settings: <values>.
- Session source: real login | prepared-session fixture (tenant `springfield`, subject `preets-verify-<run>`).
  Fixture-backed results cite L-fixture: they establish nothing about authentication, the sign-in callback, or
  session issuance.
- <claim>: established | violated | not established | blocked. Steps <n>. Session source <source>. Trace IDs,
  record counts, and conditions. For a fixture-backed claim: "Limitation: L-fixture."
- Cleanup: keys remaining under `preets:verify:<run>:` = 0.
```

### Slice `config`: verified SHA `aadb76fb6ce51ef072f2147546bff9e9ecfd9426` (2026-11-11)

**Stale.** Superseded by a later run below. This revision is no longer on the branch after the rebase onto `main` at `cd77cef`.

**Conditions**

- The stack's verification session ran in its own worktree, detached at the verified SHA, with a frozen install and a
  production build.
- Five `next start` instances ran on ports 3471–3475, each with its own run UUID.
  - Instances:
    - both on, with synthetic collector headers (step 3)
    - OTEL on with the switch unset
    - `OTEL_SDK_DISABLED=true` with the switch `true`
    - both off
    - OTEL on with the switch `maybe`
  - Every instance used static tenant `springfield` from `fixtures/tenant-config`, the shared `otel-lgtm` stack, and
    `preets:verify:<run>:` key prefixes.
- Run window: 2026-11-11T20:05:25Z–20:07:02Z.
- Steps 2 (document only) and 3 were run.
- No real application session could be established: `CallbackFreshness` is fail-closed until #158. No prepared
  session was substituted.

**Results**

| Claim        | Result      | Observation                                                                                                                                                                                                                                                                    | Limitation                                                                                                                                    |
| ------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| V-007        | established | The `tests/lib/config.test.ts` examples all pass: every OTEL × switch combination, the property that tracing is on iff both are on, and an unrecognized value refusing startup. At runtime, the `maybe` instance failed startup on `BROWSER_TRACING_ENABLED` and never served. | Module-test channel only                                                                                                                      |
| V-009        | blocked     | `/coordination/roster` redirected to login (`protectRequest` outcome `redirected_login`), so no protected document rendered its configuration. The module test asserts the decoded four values with headers configured, as supporting evidence only.                           | verification.md: steps needing a real application session are `blocked`. The gate question for a full claim was escalated to the orchestrator |
| V-004 (part) | blocked     | The server continued the injected trace (one trace ID across the request spans), but no protected document rendered a `traceparent` meta to compare.                                                                                                                           | Same                                                                                                                                          |
| V-008 (part) | blocked     | In all four modes, the reachable documents (redirects, empty 401 responses, public pages) carried no tracing meta. There were 0 collector requests and 0 `webjs` records. This does not discriminate, because PL-3 gives the on control the same result.                       | Same; PL-3                                                                                                                                    |

**Telemetry**

- T-008 is present and usable. There was exactly one warning, for the run with collector headers, with
  `service.version` equal to the SHA. There was none for the switch-unset run.
- The T-008 line carries no header name or value.

**Forbidden data**

- None from this slice. No synthetic header, bearer, or authorization value appears in Loki for any run.
- Pre-existing and outside this slice: the Node SDK resource detectors export `process.owner`, `host.name`, and
  `process.command_args`. This was referred to a person.

### config — 5ec050aada3a6c4db61a867eefde7982f0928952, 2026-11-11, runs f8de8186-ce91-4146-a1f2-7d8530d28314 (on), 10429034-7ffd-4366-a1e0-0ab12449a914 (unset), 265b24d7-1e91-493a-928b-63d7f535cb2f (OTEL off, switch true), 07869815-06a9-46e9-ba57-aeb5f09eb153 (both off), c863326a-a0e0-4944-9470-8e142ae1142b (maybe)

**Stale.** Superseded by a later run below. This revision is no longer on the branch after the rebase onto `main` at `cd77cef`.

- Collector image: sha256:4c8056c9c05fcb3c8fd93800e85334bfd79b4d0271b47a54a121a64af41fe1fe. Ports: 3471–3475. Switch
  settings: on+synthetic headers; OTEL on/switch unset; OTEL_SDK_DISABLED=true/switch true; both off; switch `maybe`.
- Session source: prepared-session fixture (tenant `springfield`, subject `preets-verify-<run>`).
  Fixture-backed results cite L-fixture: they establish nothing about authentication, the sign-in callback, or
  session issuance.
- V-007: established. Module test `tests/lib/config.test.ts` 67/67; the `maybe` instance refused startup. Session
  source none.
- V-009: established. Step 3. Session source prepared-session fixture. Each document's single
  `preets-browser-tracing` meta had exactly endpoint, serviceInstanceId, serviceName and serviceVersion, and no
  header name or value, with collector headers configured. Limitation: L-fixture.
- V-004 (part): established. Step 3. Session source prepared-session fixture. The meta traceparent matched server
  span `render route (app) /coordination/roster` 418c7934bd6c3cf1 in injected trace
  7b297445b90f3c8543a49e502a0f06c7, and the server spans in uninjected trace 94398a76be69ca31565030a77677acbd and
  participant trace 338f3623e75982ca6d31bc700268cc98. Limitation: L-fixture.
- V-008 (part): established. Step 2 (document only). Session source prepared-session fixture. The three off
  instances had 0 tracing metas, 0 collector requests, and 0 non-harness traceparents; the probe found nothing
  initialized; and there were 0 webjs records. The on control rendered both metas. Limitation: L-fixture.
- T-008: present once for the header run, absent for the unset run, and carrying no header data.
- Forbidden data: none from the slice. #377 (resource detectors) is pre-existing.
- Cleanup: keys remaining under `preets:verify:<run>:` = 0 (all five runs).

### config — c395225321f31f5ecb473d3fc9d38f7959b50c33, 2026-11-12, runs bd2da3e5-9cf9-4013-9b60-58b86c1985ba (on), ea544b5e-de7d-4a50-8184-920bd536710c (unset), ec60e788-a9b2-4c47-be56-658a0941b7fe (OTEL off, switch true), 451a4ac5-452b-4500-aeb8-67a1d5529e69 (both off), 0f24a22e-a01e-44dd-9009-0b6978df79da (maybe), 938b90dd-ae13-4653-a8e4-9ef19c151389 (malformed client-secret map)

**Stale.** Superseded by a later run below. This revision is no longer on the branch after the rebase onto `main` at `cd77cef`.

- Collector image: sha256:4c8056c9c05fcb3c8fd93800e85334bfd79b4d0271b47a54a121a64af41fe1fe. Ports: 3471–3476. Switch
  settings: on + synthetic headers + synthetic OIDC_CLIENT_SECRETS_JSON marker; OTEL on/switch unset;
  OTEL_SDK_DISABLED=true/switch true; both off; switch `maybe`; malformed OIDC_CLIENT_SECRETS_JSON.
- Session source: prepared-session fixture (tenant `springfield`, subject `preets-verify-<run>`).
  Fixture-backed results cite L-fixture: they establish nothing about authentication, the sign-in callback, or
  session issuance.
- V-007: established. Module test `tests/lib/config.test.ts` 68/68; the `maybe` instance refused startup
  (ConfigError at BROWSER_TRACING_ENABLED). Session source none.
- V-009: established. Step 3. Session source prepared-session fixture. Each document's single
  `preets-browser-tracing` meta had exactly endpoint, serviceInstanceId, serviceName and serviceVersion, and no header
  name or value, with collector headers configured. Limitation: L-fixture.
- V-004 (part): established. Step 3. Session source prepared-session fixture. The meta traceparent matched the server
  span `render route (app)` in injected trace 4d425c1d400dc3175013d0a9d46d9690 (123f56a33190caf1), uninjected trace
  2bcd2fb2ea30eb158abd6d98e86f6190 (078946a7ad3fadaf), and participant trace fcbd571d8ba4c111d5497d801535cbd3
  (0c2c274f86e9f0cb). Limitation: L-fixture.
- V-008 (part): established. Step 2 (document only). Session source prepared-session fixture. The three off instances
  had 0 tracing metas, 0 collector requests, and 0 non-harness traceparents; the probe found nothing initialized; and
  there were 0 webjs records. The on control rendered both metas. Limitation: L-fixture.
- T-008: present once for the header run, absent for the unset run, and carrying no header data.
- Client secret: the synthetic marker appeared in no startup output, Loki line, or exported span. A malformed map
  refused startup with "Expected a valid value" at OIDC_CLIENT_SECRETS_JSON, without echoing the value.
- Forbidden data: none from the slice. #377 (resource detectors) is pre-existing.
- Cleanup: keys remaining under `preets:verify:<run>:` = 0 (all six runs).

### config — c1105929059ad0cb59b193b4aca946e3d6d0a054, 2026-11-12, runs e0327d9b-1b48-4f19-94bc-07b3dcda4349 (on), 7590e2e4-3418-4f8f-9c13-4a99022f7c95 (unset), fe6613aa-422c-4a26-899e-c6bac64e4e54 (OTEL off, switch true), 5ac6ea93-8938-460a-a365-f2c2c85e262d (both off), 7dc00b23-c269-4d3b-8d6f-16533e75390b (maybe), ad2cb1e5-5d1c-4c95-8454-0c0e7c089533 (malformed client-secret map)

**Stale.** Superseded by a later run below. This revision is no longer on the branch after the rebase onto `main` at `cd77cef`.

- Collector image: sha256:4c8056c9c05fcb3c8fd93800e85334bfd79b4d0271b47a54a121a64af41fe1fe. Ports: 3471–3476. Switch
  settings: on + synthetic headers + synthetic OIDC_CLIENT_SECRETS_JSON marker; OTEL on/switch unset;
  OTEL_SDK_DISABLED=true/switch true; both off; switch `maybe`; malformed OIDC_CLIENT_SECRETS_JSON.
- Session source: prepared-session fixture (tenant `springfield`, subject `preets-verify-<run>`).
  Fixture-backed results cite L-fixture: they establish nothing about authentication, the sign-in callback, or
  session issuance.
- V-007: established. Module test `tests/lib/config.test.ts` 68/68; the `maybe` instance refused startup
  (ConfigError at BROWSER_TRACING_ENABLED). Session source none.
- V-009: established. Step 3. Session source prepared-session fixture. Each document's single
  `preets-browser-tracing` meta had exactly endpoint, serviceInstanceId, serviceName and serviceVersion, and no header
  name or value, with collector headers configured. Limitation: L-fixture.
- V-004 (part): established. Step 3. Session source prepared-session fixture. The meta traceparent matched the server
  span `render route (app)` in injected trace d7e6c63a3c0584e91c2f4c56e5554ae2 (ec0adcbe22074ec2), uninjected trace
  7d074a6520aa4c89b6f85227ad8060ae (29958e4628bafbd4), and participant trace 7400406f2d4924b1a1c95abdf6577285
  (d2ba91a168544516). Limitation: L-fixture.
- V-008 (part): established. Step 2 (document only). Session source prepared-session fixture. The three off instances
  had 0 tracing metas, 0 collector requests, and 0 non-harness traceparents; the probe found nothing initialized; and
  there were 0 webjs records. The on control rendered both metas. Limitation: L-fixture.
- T-008: present once for the header run, absent for the unset run, and carrying no header data.
- Client secret: the synthetic marker appeared in no startup output, Loki line, or exported span. A malformed map
  refused startup with "Expected a valid value" at OIDC_CLIENT_SECRETS_JSON, without echoing the value.
- Forbidden data: none from the slice. #377 (resource detectors) is pre-existing.
- Cleanup: keys remaining under `preets:verify:<run>:` = 0 (all six runs).

### config — 0c6595d717798edf0be1e81961e3d7476adba7f3, 2026-11-12, runs 1c646672-8347-4f86-b0b3-07b7e4101071 (on), a14e3bcb-42ec-4196-a756-78c192b73450 (unset), 1da3dd6b-8275-453c-86a2-d8a9230b9ab7 (OTEL off, switch true), fd9af5bb-8d3f-4e43-8670-72f40783be41 (both off), 3814a15c-e3a3-490c-8df5-ead90b957ed4 (maybe), eb515ad8-3a67-4ce3-836e-b2db95dbe6a3 (malformed client-secret map)

**Stale.** Recorded before the stack was rebased onto `main` at `cd77cef`, so this revision is no longer on the branch. A fresh run at the rebased head supersedes it.

- Collector image: sha256:4c8056c9c05fcb3c8fd93800e85334bfd79b4d0271b47a54a121a64af41fe1fe. Ports: 3471–3476. Switch
  settings: on + synthetic headers + synthetic OIDC_CLIENT_SECRETS_JSON marker; OTEL on/switch unset;
  OTEL_SDK_DISABLED=true/switch true; both off; switch `maybe`; malformed OIDC_CLIENT_SECRETS_JSON.
- Session source: prepared-session fixture (tenant `springfield`, subject `preets-verify-<run>`).
  Fixture-backed results cite L-fixture: they establish nothing about authentication, the sign-in callback, or
  session issuance.
- V-007: established. Module test `tests/lib/config.test.ts` 73/73, including the five wrong-shape client-secret
  examples; the `maybe` instance refused startup (ConfigError at BROWSER_TRACING_ENABLED). Session source none.
- V-009: established. Step 3. Session source prepared-session fixture. Each document's single
  `preets-browser-tracing` meta had exactly endpoint, serviceInstanceId, serviceName and serviceVersion, and no header
  name or value, with collector headers configured. Limitation: L-fixture.
- V-004 (part): established. Step 3. Session source prepared-session fixture. The meta traceparent matched the server
  span `render route (app)` in injected trace 1783ab18beeb5766e222e11fb11a6bf4 (fa2fe0f9a973c961), uninjected trace
  d2a27f60756a8b3d4800fe9da6790ab8 (cd3c19b5a2a4766d), and participant trace c29d8322c422a92a8dbd5607262bc972
  (7ec10913d46f9e3d). Limitation: L-fixture.
- V-008 (part): established. Step 2 (document only). Session source prepared-session fixture. The three off instances
  had 0 tracing metas, 0 collector requests, and 0 non-harness traceparents; the probe found nothing initialized; and
  there were 0 webjs records. The on control rendered both metas. Limitation: L-fixture.
- T-008: present once for the header run, absent for the unset run, and carrying no header data.
- Client secret: the synthetic marker appeared in no startup output, Loki line, or exported span. A malformed map
  refused startup with "Expected a valid value" at OIDC_CLIENT_SECRETS_JSON, without echoing the value.
- Forbidden data: none from the slice. #377 (resource detectors) is pre-existing.
- Cleanup: keys remaining under `preets:verify:<run>:` = 0 (all six runs).

### config — 09676afd4301aa03819d5a11b00b60f3ff70a8d9, 2026-11-12, runs d7246097-9368-498a-9855-8add7ab867de (on), 9f571f41-77db-4d58-a996-0f30cd3a13ef (unset), ff261934-e58b-478f-b9e4-b1adf911ab50 (OTEL off, switch true), 12590479-8b03-4548-b18b-c714835fcf66 (both off), cc588faa-d74a-4f12-ac32-2f30f55710b3 (maybe), b2739c84-a792-411c-b290-29836432a8ee (malformed client-secret map)

- Collector image: sha256:4c8056c9c05fcb3c8fd93800e85334bfd79b4d0271b47a54a121a64af41fe1fe. Ports: 3471–3476. Switch
  settings: on + synthetic headers + synthetic OIDC_CLIENT_SECRETS_JSON marker; OTEL on/switch unset;
  OTEL_SDK_DISABLED=true/switch true; both off; switch `maybe`; malformed OIDC_CLIENT_SECRETS_JSON. Runtime: Effect
  4.1.4, Next 16.4.6, Node 26.2.0 (`.node-version` pins 26.13.1; 26.2.0 satisfies `engines >=26`).
- Session source: prepared-session fixture (tenant `springfield`, subject `preets-verify-<run>`).
  Fixture-backed results cite L-fixture: they establish nothing about authentication, the sign-in callback, or
  session issuance.
- V-007: established. Module test `tests/lib/config.test.ts` 73/73; the `maybe` instance refused startup
  (ConfigError at BROWSER_TRACING_ENABLED). Session source none.
- V-009: established. Step 3. Session source prepared-session fixture. Each document's single
  `preets-browser-tracing` meta had exactly endpoint, serviceInstanceId, serviceName and serviceVersion, and no header
  name or value, with collector headers configured. Limitation: L-fixture.
- V-004 (part): established. Step 3. Session source prepared-session fixture. The meta traceparent matched the server
  span `render route (app)` in injected trace 5ad044c77f6321a44afa2f9b0dd6df49 (976ba1dfcc68a6c2), uninjected trace
  aaef8015d5c4c45b5531a6bc79a3e85b (231d6f94e2482d38), and participant trace 3f01d06aac0e191a5934315f108d9ea3
  (73aa15b9d61cc980). Limitation: L-fixture.
- V-008 (part): established. Step 2 (document only). Session source prepared-session fixture. The three off instances
  had 0 tracing metas, 0 collector requests, and 0 non-harness traceparents; the probe found nothing initialized; and
  there were 0 webjs records. The on control rendered both metas. Limitation: L-fixture.
- T-008: present once for the header run, absent for the unset run, and carrying no header data.
- Client secret: the synthetic marker appeared in no startup output, Loki line, or exported span. A malformed map
  refused startup with "Expected a valid value" at OIDC_CLIENT_SECRETS_JSON, without echoing the value.
- Forbidden data: none from the slice. #377 (resource detectors) is pre-existing.
- Cleanup: keys remaining under `preets:verify:<run>:` = 0 (all six runs).

### export — 2f9e95133d201767cdec7e1fd1136c26d291609c, 2026-11-12, runs 95ee0233-5733-43f1-9e33-1e0f2e5a87c5 (A, on, synthetic server headers), 9faec4db-1ea6-4355-9adf-25e47a0d8a27 (B, on, concurrent), 93358de1-b9a6-4c27-98eb-ebe5c15f5d90 (C, switch unset), c48cf62c-905c-45a2-85cb-b4031e1ff0c2 (D, OTEL off, switch true), 1c108a5f-affa-40a7-a1c5-afb40757db76 (E, both off), 76a83fdf-8d0b-4127-bc16-e894ddee6211 (M, `maybe`)

**Stale.** Superseded by the 1b2b896 run below, and no longer on the branch after the rebase onto `main` at
`cd77cef`.

- Collector image: sha256:4c8056c9…. Ports: 3481–3486. Switch settings: as listed per run; `maybe` refused startup.
  The `docs/docker-compose.md` preflight check returned 204 with the origin allowed. Run window 2026-11-12T00:23:40Z to
  00:32:30Z.
- Session source: prepared-session fixture (tenant `springfield`, subject `preets-verify-<run>`), a fresh record per
  browser context. Fixture-backed results cite L-fixture: they establish nothing about authentication, the sign-in
  callback, or session issuance.
- V-002: established. Step 5. After the marker, `traceparent` was on `POST /session/activity` (77916d13…), the Server
  Action `POST /coordination/roster` (9cd3d83f…), `GET /session/status` (d34b8c7c…), the RSC
  `GET /coordination/participant?_rsc` from "Open participant page in place" (4bb05fe3…), and `POST /auth/logout`
  (f40d32ba…). In each, the server span's parent is the browser fetch span. Limitation: L-fixture.
- V-003: established. Step 5. The 9 cross-origin requests of the no-cookie sign-in chain (`/auth/login`, then the
  identity provider) and all 12 collector requests carried no `traceparent`. The export half is fixture-backed.
  Limitation: L-fixture.
- V-004: established. Step 6. The T-001 query returned 7 `documentLoad` traces under server render spans. Injected
  trace 6c45c9aa…: `documentLoad` 3e98439a… is a child of the meta's `render route (app) /coordination/roster` span
  48c82c57…. T-002 held in 8 of 8 traces. Query caveat: `>>` omits traces whose root is a never-exported harness
  parent; fetch those traces directly. Limitation: L-fixture.
- V-005: established (option B). Step 6. Back made a new server render (trace 18dd67f7…) whose `documentLoad`
  d9da10b5… is in that trace. `{ RUN && name = "documentLoad" } | count() > 1` returned no trace. Headless Chromium
  did not restore from bfcache, so the guard's `pageshow persisted` path was not exercised. Limitation: L-fixture.
- V-006: established. Step 4. A and B ran concurrently. A's run filter returned none of B's traces, and B's records
  carried `pre-ets-frontend`, the SHA, and B's instance ID. Limitation: L-fixture.
- V-008: established. Step 2 (full). C, D, and E each loaded the roster and logged out: 0 metas, probe not
  initialized, 0 SDK chunk requests, 0 collector requests, 0 `traceparent`, and 0 webjs records after 1 minute. The
  on control A loaded the chunk and set the marker. Hand-run check. Limitation: L-fixture.
- V-010: established. Step 4. All 12 export requests (6 POST, 6 OPTIONS) went to `127.0.0.1:4318/v1/traces`, none to
  the app origin, and none carried `authorization` or `cookie`, with server collector headers configured on A.
  Limitation: L-fixture.
- V-011: established. Step 4. Every OPTIONS returned 204 and every POST 200, with the app origin allowed. Records are
  in Tempo.
- V-012: established. Step 9. A with exports aborted matched C (switch unset) in visible outcomes, focus (Log out, then
  the signed-out heading), and every protected-request status. Neither run had page errors. The only difference was
  Chromium's console log of the aborted exports. Hand-run check. Limitation: L-fixture.
- V-016 (part, automatic records): established. Step 8. With the probe typed and carried in a query string and
  fragment, every webjs span of six journey traces had only allow-listed names, attributes, and resource values,
  event names without attributes, no status description, and `url.path` without query or fragment. Limitation:
  L-fixture.
- T-001, T-002, T-003: present and usable (T-001 query caveat above; T-003 `network_error` not exercised).
- Forbidden data: none from the slice. Pre-existing, not this slice: #377, and the probe query string in the
  existing server spans' `url.query` and `http.target` (trace 6bdc455f…), referred for a human decision.
- Cleanup: keys remaining under `preets:verify:<run>:` = 0 (all six runs).

### export — 1b2b896ea15616814b0e26dfbd5f82238296fa29, 2026-11-12, runs 88633591-9632-45ec-ac5e-81be88f03f69 (A, on, synthetic server headers and secret map), 2df68789-09d8-4e72-a004-55c19e1793ac (B, on, concurrent), 49e91eb0-070c-45bb-b2de-1196521f31aa (C, switch unset), 82025719-05f7-4ac1-9a12-f547e311e627 (D, OTEL off, switch true), 454dc28c-c18d-46dc-9d9c-b3fb8b3ffee9 (E, both off), cf0d46c0-093b-4003-ad3b-a530ba826aaa (M, `maybe`)

**Stale.** Recorded before the stack was rebased onto `main` at `cd77cef`, so this revision is no longer on the
branch. A run at 6176e96 was requested and is superseded unreported. A fresh run at the rebased head supersedes it.

This block supersedes the 2f9e951 `export` block above, which is now stale: the slice was rebased onto the config
review fix c395225, and the step-7 correction (spec 5da5ad5, plan 43a9c7b) was merged. Export-owned files are unchanged
since 2f9e951. A run requested at 0f49660 was stopped unreported when it was superseded.

- Collector image: sha256:4c8056c9…. Ports: 3481–3486. Switch settings: as listed per run; `maybe` refused startup.
  The `docs/docker-compose.md` preflight check returned 204 with the origin allowed. Run window 2026-11-12T10:33:51Z to
  10:40:43Z.
- Session source: prepared-session fixture (tenant `springfield`, subject `preets-verify-<run>`). Fixture-backed
  results cite L-fixture: they establish nothing about authentication, the sign-in callback, or session issuance.
- V-002: established. Step 5. Each request kind carried a browser `traceparent` that the server continued in the same
  trace: activity e40cef21…, Server Action ad4fe64b…, status adf98747…, RSC c3580ac7…, logout 6077f076….
  Limitation: L-fixture.
- V-003: established. Step 5. The no-cookie sign-in chain reached the identity provider with no `traceparent` on its 9
  cross-origin requests, and no collector request carried one. The export half is fixture-backed. Limitation:
  L-fixture.
- V-004: established. Step 6. The T-001 query returned 7 `documentLoad` records under server spans. Injected trace
  1d892d8e…: `documentLoad` 0b2ef478… is under the render span the meta names. The `>>` caveat for injected roots
  applies. Limitation: L-fixture.
- V-005: established (option B). Step 6. Back after the `Link` made a new server render (trace 794afd99…,
  `documentLoad` 07f5dae8…). `{ RUN && name = "documentLoad" } | count() > 1` returned no trace. The bfcache restore
  path was not exercised. Limitation: L-fixture.
- V-006: established. Step 4. A's run filter returned none of B's traces. Limitation: L-fixture.
- V-008: established. Step 2 (full). C, D, and E: no metas, no initialization, 0 SDK chunk requests, 0 collector
  requests, 0 `traceparent`, and 0 webjs records. The on control loaded the chunk and set the marker. Hand-run check.
  Limitation: L-fixture.
- V-010: established. Step 4. Export went only to `127.0.0.1:4318/v1/traces`, with no `authorization` or `cookie`,
  with server collector headers configured on A. Limitation: L-fixture.
- V-011: established. Step 4. OPTIONS returned 204 and POST 200 with the app origin allowed; records are in Tempo.
- V-012: established. Step 9. A with all 12 exports aborted matched C (switch unset) in every visible observation,
  focus check, and protected-request status. Neither had page errors. A logged Chromium's console lines for the aborted
  exports. Hand-run check. Limitation: L-fixture.
- V-016 (part, automatic records): established. Step 8. Webjs `url.path` held only plain paths, outcomes only
  `loaded`, `fetched`, and `responded`. No webjs span in A or B carried `url.full`, `url.query`, `http.target`, a user
  agent, `session.id`, an error status, a status message, or an exception. Limitation: L-fixture.
- T-001, T-002, T-003: present and usable.
- Forbidden data: none from the slice. Loki had 0 hits for the probe, the secret marker, the token, or the cookie.
  #377 and #381 are pre-existing.
- Cleanup: keys remaining under `preets:verify:<run>:` = 0 (all runs).

### export — d98bf5f94364fd8202c977d7762ba1678b12121b, 2026-11-12, runs 18acdddc-6a1e-49c7-b6db-37df15ab6174 (A, on, synthetic server headers), fe217592-7442-47a7-96c0-1d69114d1aea (B, on, concurrent), 727f7f7e-918b-4e3f-bfc9-40efa5dc624e (C, switch unset), ef0bd428-4f67-4e83-a898-5bb4b2b3ee03 (D, OTEL off, switch true), c35f9edc-3573-498a-a403-e682e6255fc2 (E, both off), 7a375fee-1ecd-4ffd-bfe8-9b14152c262c (M, `maybe`)

Current result for this slice, after the stack was rebased onto `main` at `cd77cef`. Export-owned files are unchanged
from 1b2b896. The runtime is Effect and `@effect/opentelemetry` 4.1.4 and Next 16.4.6, with one version per OpenTelemetry
package. A run requested at 6176e96 was superseded unreported.

- Collector image: sha256:4c8056c9…. Ports: 3481–3486. Switch settings: as listed per run; `maybe` refused startup.
  The `docs/docker-compose.md` preflight check returned 204 with the origin allowed. Run window 2026-11-12T12:24:27Z to
  12:31:08Z.
- Session source: prepared-session fixture (tenant `springfield`, subject `preets-verify-<run>`). Fixture-backed
  results cite L-fixture: they establish nothing about authentication, the sign-in callback, or session issuance.
- V-002: established. Step 5. Each request kind carried a browser `traceparent` that the server continued: activity
  149dda04…, Server Action a124e026…, status d745f948…, RSC f7db5e81…, logout cdbbcbec…. Limitation: L-fixture.
- V-003: established. Step 5. The no-cookie sign-in chain reached the identity provider with no `traceparent` on its 9
  cross-origin requests, and no collector request carried one. The export half is fixture-backed. Limitation:
  L-fixture.
- V-004: established. Step 6. The T-001 query returned 7 `documentLoad` records under server spans. Injected trace
  f6208dc8…: `documentLoad` a45e4c88… is under the render span the meta names. Limitation: L-fixture.
- V-005: established (option B). Step 6. Back made a new server render (trace 35edee5c…, `documentLoad` da376152…).
  `{ RUN && name = "documentLoad" } | count() > 1` returned no trace. Limitation: L-fixture.
- V-006: established. Step 4. A's run filter returned none of B's traces. Limitation: L-fixture.
- V-008: established. Step 2 (full). C, D, and E: no metas, no initialization, 0 SDK chunk requests, 0 collector
  requests, 0 `traceparent`, and 0 webjs records. The on control loaded the SDK. Hand-run check. Limitation: L-fixture.
- V-010: established. Step 4. Export went only to `127.0.0.1:4318/v1/traces`, with no `authorization` or `cookie`.
  Limitation: L-fixture.
- V-011: established. Step 4. OPTIONS returned 204 and POST 200 with the app origin allowed; records are in Tempo.
- V-012: established. Step 9. With the collector aborted (13 aborts), observations, focus, and protected-request
  statuses matched the switch-off run, with no page errors. Hand-run check. Limitation: L-fixture.
- V-016 (part, automatic records): established. Step 8. With the probe seeded, 0 webjs spans carried a leak key, an
  error, a status message, an exception, or the probe. Limitation: L-fixture.
- T-001, T-002, T-003: present and usable.
- Forbidden data: none from the slice. Loki had 0 hits for the probe, the secret marker, the token, or the cookie.
  #377 and #381 are pre-existing.
- Cleanup: keys remaining under `preets:verify:<run>:` = 0 (all runs).

### facts — fbcfee176d0c8ce29109960082474cf039ac11c4, 2026-11-12, runs f4b4e41d-9531-4223-95eb-b803bb18f68e (A, on, synthetic server headers and secret map), 8dc91cd0-64a3-420c-b25a-bb67735c4e74 (B, on, concurrent), d4b6a640-fb41-4529-a8d5-da1007ae5b46 (C, switch unset), 5b2c4050-e380-459a-bae9-3dd8dc4cb44a (D, fresh clone from the docs)

**Stale.** Recorded before the stack was rebased onto `main` at `cd77cef`, so this revision is no longer on the
branch. A fresh run at the rebased head supersedes it. A whole-slice request at 6bddac9 never ran: the rebase
superseded it first.

This block replaces the round-1 report at a73e1f3, which was not recorded. That run established V-001 and V-013–V-016
and found V-017 violated: the documented `start` example lacked a build step. 8a09348 added that step, and fbcfee1
merged export 1b2b896, which carries config c395225 and the rewritten step 7. Facts code is unchanged since a73e1f3.
The SDK chunk was located by its `v1/traces` literal.

- Ports: 3491–3493 and 3000 (D). Run window 2026-11-12T10:42:04Z to 10:49:03Z. No harness `traceparent` injection;
  every sampled step waited for the `started` marker.
- Session source: prepared-session fixture (tenant `springfield`, subject `preets-verify-<run>`). Fixture-backed
  results cite L-fixture: they establish nothing about authentication, the sign-in callback, or session issuance.
- V-001: established. Step 4 on A. (a) Server Action 7524a67a…: `Interaction.submit` > `POST` > server. (b) The
  guard-cancelled submit 9ed46256… has no request child; its replay 74afb0e0… is submit > `POST` > server.
  (c) e49b28ba…, the same shape. (c2) and (c3), the overlap probes: 2 and 3 submits counted with one request held.
  Every submit span stands alone, and the POSTs (cce2dfba…, 5228cf04…, ea434753…, 5aa43926…) are roots, as PL-2
  states. (d) RSC d77e83d3…: `Router.transition` (`push`, `/coordination/participant`) > `GET` > server.
  (e) Logout dcde89de…: `TabCoordination.transition` `content_shown → logging_out` > `POST /auth/logout` > server >>
  `logout`. B's traces stayed out of A's run filter. Limitation: L-fixture.
- V-013: established. Step 7 as rewritten: other-session hint in B, then `visibilitychange`, with no clock control.
  B went `content_shown → content_concealed` (a3d08bfd…), and the resume chain concealed > `/session/status` > server
  is in that trace. Then B went `content_concealed → content_shown` (50028b20…). A went `content_shown → logging_out`
  (8b10d2ef…) and then `logging_out → signed_out`, and B went `content_shown → signed_out`. Span start order matches
  the order Playwright observed, and every value is in the closed set. Limitation: L-fixture.
- V-014: established. Step 7. Each send matched its receipt in the other tab by kind and `preets.tab.message.id`:
  `renewed` 4ffb3f77…, `logout_started` d62401cb… (a child of the `logging_out` transition), and `logged_out`
  d4a137df…. Limitation: L-fixture.
- V-015: established. Step 7. `Focus.move` in order: Goal entered (user), Goal left (user), Goal entered (application,
  from "Focus later"), Goal left (user), `logout_control` entered (user), `logout_control` left (user), and
  `signed_out_heading` entered (application). This matches Playwright's focus order. Limitation: L-fixture.
- V-016: established in full. Step 8 with probe `zqprobe8b2bec3c` typed, carried in a query string and fragment, and
  sent through cross-tab messages and logout. Every webjs attribute value in A is closed-set, and `url.path` holds
  only plain paths. A run-wide negative query found no leak keys, no error status, no non-UUID message ID, and no span
  name outside the contract. Limitation: L-fixture.
- V-017: established. Step 10 in a fresh clone, following only `docs/observability.md` and `docs/docker-compose.md`.
  The documented build exited 0 and the documented `start` ran. The marker was set, and export from `localhost:3000`
  returned 200 with that origin allowed. The T-001 query returned 7998ac85…, the trace the page meta names. The
  fixture session is a step the documentation did not supply. Limitation: L-fixture.
- Done-when (#368):
  1. Pass: one trace holds the UI-transition span and the server span it caused, for logout (dcde89de…), Server
     Action (7524a67a…), and RSC (d77e83d3…).
  2. Pass: no forbidden data in browser attributes (V-016).
  3. Pass on C (switch unset): no marker, no OTel globals or metas, 0 SDK chunk requests, 0 collector requests, and
     0 `traceparent`.
- T-004, T-005, T-006, T-007, T-009, T-010, T-011: present and usable. Step 7b: `BrowserTracing.buffer` recorded
  `overflowed` with `preets.tracing.dropped_count` 1748, and the marker appeared afterwards.
- Forbidden data: none from the slice. Loki had 0 hits for the probe, the secret marker, the token, or the cookie.
  #377 and #381 are pre-existing.
- Cleanup: keys remaining under `preets:verify:<run>:` = 0 (runs A–D); the fresh clone is removed.

### facts — 8b4fd35a5f14a4031a805111a7542cee90a33cf4, 2026-11-12, runs ed6a70a8-e443-429e-9304-8f3a6c2630b1 (A, on), 098b648d-a7d7-43c4-8422-d0512d85b154 (B, on, concurrent), aefc8b41-d20c-4b4f-9169-6e59a3dba972 (C, switch unset), 671b6ef9-c675-4bea-87fd-b67ef3ddaa45 (D, step 10 fresh clone)

- Collector image: sha256:4c8056c9c05fcb3c8fd93800e85334bfd79b4d0271b47a54a121a64af41fe1fe. Ports 3491–3493, 3000.
  A has synthetic server headers and a synthetic OIDC_CLIENT_SECRETS_JSON marker. Runtime: Effect 4.1.4, Next 16.4.6,
  Node 26.2.0 (`.node-version` pins 26.13.1; 26.2.0 satisfies `engines >=26`). SDK chunk 2oqkadwxw1xxv.js.
- Session source: prepared-session fixture (tenant `springfield`, subject `preets-verify-<run>`). Limitation:
  L-fixture throughout. These results establish nothing about authentication, the sign-in callback, or session issuance.
- V-001: established. Step 4.
  - (a) 7d987cec…: submit > POST > server.
  - (b) lone cancelled submit 41fe6385…, replay 32520bd0….
  - (c) 6ebd3136….
  - (c2) 2 lone submits, root POSTs a351f2e1…/ea6a2b84….
  - (c3) 3 lone submits, root POSTs 64de1c0a…/c8917d7b….
  - (d) 1445dd6e…: Router.transition > GET > server.
  - (e) 25c594d4…: TabCoordination.transition > POST /auth/logout > server >> logout.
  - Run B's traces are absent from A's queries.
- V-013: established. Step 7 as rewritten (hint plus visibilitychange, no clock control).
  - B concealed (509aa1dc…, resume path concealed > /session/status > server matches), then shown (92e055ac…).
  - A content_shown→logging_out (f1d3a3b0…), then logging_out→signed_out.
  - B content_shown→signed_out, never entering logging_out.
  - Order matches Playwright.
- V-014: established. Every TabChannel.send matches a receive by kind and UUID: session_current, renewed ×2,
  pending ×5, logout_started 069f5cce… (child of A's logging_out transition), logged_out cecc9cb6….
- V-015: established. Focus.move: goal entered/user, left/user, entered/application, left/user; logout_control
  entered/user, left/user; signed_out_heading entered/application. Matches Playwright.
- V-016: established. Step 8, probe zqprobeb8136abd.
  - webjs url.path: 5 plain paths. Kinds and outcomes all from the closed sets.
  - Negative query over A and B: 0 spans with url.full/http.url/url.query/http.target/user_agent/http.host/session.id/
    tenant alias/error/status message/exception/probe/non-UUID message ID/non-allow-listed name.
  - Loki: 0 lines for the probe, marker, token or cookie.
- V-017: established. Step 10.
  - Fresh clone, frozen install, `.env.local` from the example, documented build (exit 0) and documented start on :3000.
  - Marker set. Export got POST 200 with ACAO http://localhost:3000.
  - T-001: 77709f0a…, documentLoad under the server render, matching the meta.
- Done-when: (1) logout 25c594d4…, Server Action 7d987cec…, RSC 1445dd6e…; (2) no forbidden browser data;
  (3) switch unset: no metas, marker or OTel globals; 0 SDK chunk requests; 0 collector requests; 0 traceparent.
- T-011: overflowed, dropped_count 1748 (7269402d…).
- Forbidden data: none from the slice. #377 and #381 are pre-existing.
- Cleanup: keys remaining under `preets:verify:<run>:` = 0 (runs A–D).
