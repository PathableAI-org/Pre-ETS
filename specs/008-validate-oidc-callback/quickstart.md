# Validation quickstart: recoverable OIDC callback validation

This is the implementation-time evidence plan for #217. Planning alone establishes no runtime behavior. Record the
commit, Effect/openid-client/Next declarations actually installed, Redis and Keycloak versions, two-instance layout,
commands executed, results and unexecuted integrations.

## Implementation record

- Implementation branch: `008-validate-oidc-callback-impl`, based on PR #234 head
  `331e75649e0bb435e0dc1958a83fa7ac05522605`.
- Requirements baseline refreshed on 2026-10-21: `origin/main`
  `dc00459220bca1faff2d6cc3e7c0d50ed17f5e07`. The four governing requirement files are unchanged from the
  plan's recorded `1d3aef273cfb3ae57f84b4517a0c33a25aeaa81a` baseline, so no material contract drift was found.
- Installed declaration gate: TypeScript 6.0.3, Effect 4.0.5, `@effect/platform-node` 4.0.5,
  openid-client 6.8.8, Next 16.4.2, and node-redis 6.3.0.
- The local Effect v4 guidance checkout is at `41cf29b5d85af7fc25bcc7713f2e05142edaa66a`; installed 4.0.5
  declarations and source, not that checkout revision, govern implementation APIs.
- Installed API review confirmed `NodeRedis.layer` passes node-redis options and exposes scoped Redis/NodeRedis;
  `Redis.send` accepts only a command and string arguments; node-redis exposes `disableOfflineQueue`, response-aware
  `pingInterval`, `socket.socketTimeout`, pending-command rejection, and terminal `SocketTimeoutError` handling;
  openid-client exposes `enableNonRepudiationChecks`, requires `jwks_uri`, and applies its configured fetch/deadline
  to signature/JWKS work; Next Route Handlers can write cookies and cannot coexist with a page in the same segment.
- Validation revision: uncommitted working tree on `008-validate-oidc-callback-impl`, based on
  `331e75649e0bb435e0dc1958a83fa7ac05522605`. The implementation has not been committed or pushed.
- Executed 2026-10-22 with Redis 8.2.4 and Keycloak 26.8.1. Two independent production Next processes shared only
  Redis and the exact logical tenant authority; initiation ran on A and callbacks ran on B.
- `pnpm --filter @pathableai/pre-ets-frontend test:unit`: 11 files and 211 tests passed. Controlled provider evidence
  covered exchange, issuer, audience, nonce, invalid-signature, empty-subject and missing/non-integer-`auth_time`
  failures. These focused protocol failures are public-service evidence only.
- `REDIS_URL=redis://127.0.0.1:6387 pnpm --filter @pathableai/pre-ets-frontend test:integration`: one file and five
  tests passed. It covered A-create/B-consume, replay, a healthy exactly-one race, wrong-state and wrong-tenant
  preservation, and Redis server-clock expiry. Collision/corrupt-byte fixtures and reconnect, in-flight disconnect,
  stalled-socket and socket-timeout fault-proxy cases remain unexecuted.
- `pnpm test:bdd:checks`: three harness checks passed. The final unfiltered production Cucumber run passed all 42
  scenarios and 514 steps, including real Keycloak completion, wrong-state then valid completion, cross-tenant
  preservation, race/replay, Redis expiry and controlled provider denial. Real Keycloak cancellation was not run.
- Layer-acquisition tests passed for absent/malformed credentials, default TTL, TTL boundaries 1 and 600, and invalid
  zero, negative, fractional, nonnumeric, greater-than-600 and overflow-shaped TTL input without echoing supplied
  values. A manual unreachable-Redis boot exited through the awaited runtime acquisition failure, but Next printed
  its own listener-ready line before instrumentation completed; the BDD harness therefore uses a one-second stable
  readiness gate. Strict proof that the raw Next listener never briefly opens remains incomplete.
- Repository gates passed: `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm check:unused`, `pnpm fallow`,
  `pnpm format:check`, `pnpm format:gherkin:check`, `pnpm lint:gherkin`, and `pnpm test:bdd:dry` (42 scenarios,
  514 bound steps). `pnpm check:changes` also passed after the new code was refactored below Fallow thresholds.
- No durable log or telemetry assertion was added. The final test-runner output disclosed no credentials, tokens,
  verifiers or callback parameter values, but a dedicated real-log and exported-OTel inspection was not completed
  because no OTLP exporter was configured; T038 therefore remains open.
- Only Keycloak executed as a real provider. Microsoft, broker chains, real-provider cancellation, and a real
  confidential-client round trip remain unexecuted. #218 session creation/protected access, #154 full callback/error
  integration, and #158 `auth_time` comparison, tolerance and unsupported-provider policy remain absent.

## 1. Preflight and declaration verification

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @pathableai/pre-ets-frontend exec tsc --version
```

Before coding, inspect the installed 4.0.5 declarations/source for `@effect/platform-node/NodeRedis` and
`effect/persistence/Redis`, plus node-redis 6.3.0. Confirm the scoped Layer result/requirements, Layer option
pass-through, `disableOfflineQueue` pre-send rejection, response-aware `pingInterval` scheduling,
`socket.socketTimeout`, stalled-socket destruction, pending-command rejection, `SocketTimeoutError` reconnect
behavior, raw-command `send` shape, lack of a cancellable per-command deadline/abort input, errors and finalization.
Also inspect installed openid-client 6.8.8 grant/check/client-auth
declarations and source for `enableNonRepudiationChecks`, its `jwks_uri` requirement, and its use of the configured
fetch/deadline for JWKS retrieval, plus Next 16.4.2 Route Handler cookie/redirect declarations. Exact pinned source
supports the plan, but installed locked declarations are the implementation gate; stop on a contract mismatch rather
than adding a parallel Redis abstraction.

Confirm `packages/frontend/package.json` directly declares exact `redis@6.3.0`; its lockfile presence as an Effect
peer is insufficient.

## 2. Focused deterministic service evidence

Run the real public `AuthenticationService` with a fresh parent-created Layer/world for every test. Use only the
closed test factory exported from `authentication.ts`; external tests never import `authentication/*`. Its ordinary
options may supply deterministic tenant/credential/clock/random inputs, a generic Redis Layer, and controlled HTTP
transport, while the parent still composes the real private transaction, credential, and provider children. Do not
inject a prepared identity or call private provider, transaction, codec, or store helpers as service evidence.

```bash
pnpm --filter @pathableai/pre-ets-frontend test:unit -- tests/lib/authentication.test.ts
```

The suite should establish:

- prepare rejects a tenant-resolving request Host that differs from the configured callback Host before provider
  delegation, transaction creation, or correlation issuance;
- prepare persists before success and returns only destination/opaque browser correlation;
- complete returns the exact expected provider-neutral tenant/issuer/subject/`auth_time` handoff;
- mismatch of tenant, correlation, provider/client, callback authority, state, nonce or verifier never hands off;
- wrong tenant/authority and missing/duplicate/wrong state are rejected before storage and leave the later valid
  callback usable;
- completion returns only the safe `preserve`/`clear` correlation disposition needed by the route: known
  pre-consumption/no-record failures preserve, actual or ambiguous consume clears, and private causes remain hidden;
- missing, invalid, expired, corrupt, consumed and replayed attempts deny;
- cancellation, provider error, mixed/duplicate callback parameters, exchange/issuer/audience/nonce failure, missing
  subject and missing signed `auth_time` deny;
- with `enableNonRepudiationChecks` active, an invalid ID-token signature denies and JWKS retrieval stays inside the
  controlled transport and provider-operation deadline;
- a matching failed callback consumes the attempt;
- inbound `code`, `state`, and provider-error values are consumed without being retained in service state or copied
  into safe errors (their presence in the inbound callback request is expected);
- absent credential configuration is an empty map, public clients need no selected secret, and a confidential tenant
  with an unresolved nonempty reference receives request-level `AuthenticationUnavailable`;
- expected typed denials/unavailability remain distinct from defects and interruption; and
- no success type contains tokens, raw claims, credentials or application-session authority.

Use properties where generated variation describes a meaningful invariant: change one binding and handoff is
impossible; valid generated correlations remain opaque and invalid shapes cannot name a store record; arbitrary
failure retains at most one success as a safety invariant. Keep the healthy exactly-one-winner race and named
protocol cases as examples rather than hiding them in generators. Use the Effect test clock for application-clock
expiry boundaries, not wall-clock sleeps.

## 3. Real Redis adapter evidence

Start the tracked Redis service and run the focused integration suite:

```bash
docker compose up -d redis
pnpm --filter @pathableai/pre-ets-frontend test:integration
```

Every test uses a unique key prefix and cleans up only keys it owns; never `FLUSHALL`. Construct two independent
scoped NodeRedis client/service/runtime graphs, not two handles to one in-memory object. Prove:

- instance A creates and independently composed instance B consumes;
- a healthy bounded race yields exactly one successful winner and denies every other consumer; replay yields none;
- a wrong-tenant or wrong-state callback does not consume the record, and the later valid callback succeeds;
- an existing qualified tenant/correlation/state address is not overwritten; the parent regenerates the entire
  prepared attempt within its bounded retry, and the reserved original remains usable by its valid callback;
- malformed bytes are consumed and safely denied; and
- Redis server-clock expiry makes the attempt unrecoverable.

Construct the production adapter with `disableOfflineQueue: true`, `pingInterval: 1_000`, and
`socket.socketTimeout: 5_000`. First prove a healthy idle connection stays ready beyond the socket timeout because
node-redis schedules each health PING only after the prior response. After readiness, force a known
disconnected/reconnecting state and prove a consume submitted then rejects before send, maps to typed unavailability,
does not execute after recovery, and leaves the original usable by a later valid callback after reconnection. Also
exercise or deterministically fault an in-flight disconnect: do not retry, accept that the record may be consumed or
present, and require that no second handoff is possible. Do not wrap `GETDEL` in an Effect timeout; the pinned generic
Redis service cannot cancel that underlying command safely.

Route an established client connection through a controlled TCP fault proxy that keeps the socket open while
withholding replies. Submit a consume and prove the node-redis socket timeout closes the transport and fails the
pending request within the configured bound; treat the possibly sent consume as ambiguous, clear correlation, and
never retry it. Confirm the pinned NodeRedis strategy does not reconnect after `SocketTimeoutError` and a fresh
process/runtime is required. This is transport-failure evidence, not an Effect timeout around `GETDEL`.

For collision or malformed-byte setup, use only the fixture-scoped handle returned by the parent factory under the
unique prefix. For real TTL evidence, use a short test-specific TTL and poll `PTTL`/`EXISTS` only as fixture
synchronization under that prefix, then assert denial through the public service. Redis fixture manipulation and
inspection are not product/private-shape assertions and do not enter BDD. Keep the window bounded and diagnose
timeout rather than adding a long fixed sleep.

## 4. Framework adapter evidence

Run focused ordinary Vitest route tests, then the complete frontend suite:

```bash
pnpm --filter @pathableai/pre-ets-frontend test:unit -- tests/unit/authentication-entry.test.ts
pnpm --filter @pathableai/pre-ets-frontend test:unit
```

Assert actual adapter outcomes: login/callback status and redirect, private/no-store response, exact cookie security
attributes/preservation/clearing, query multiplicity mapping, pre-storage tenant/authority/state rejection, existing
tenant 404/500, safe denial with no automatic login loop, empty successful callback 204, and absence of application-
session/protected content. Include a tenant-resolving login Host that differs from the configured callback Host and
assert no provider redirect, transaction, or cookie. Submit an invalid or wrong-state callback, carry the browser's
resulting cookies into the original valid callback, and assert the first denial preserves correlation and the second
completes. Assert that application-produced response bodies, headers/redirect locations and cookies do not re-emit
inbound `code`, `state`, or provider error values. Do not assert those values were absent from the test's own inbound
request, or assert private calls, Redis keys/JSON, provider objects or Next implementation internals.

## 5. Requirement-backed HTTP/browser evidence

Use the repository requirements-BDD author/scaffold/review workflows when implementing the planned feature changes.
First run format/lint and dry-run for discovery; neither is runtime evidence:

```bash
pnpm format:gherkin:check
pnpm lint:gherkin
pnpm test:bdd:dry
```

Then run the production Cucumber profile against the tracked Redis and Keycloak. The harness must create a unique
transaction prefix and start two independently composed Next processes behind one exact registered tenant authority.
Its path/phase proxy routes `/`, `/auth/login`, and provider departure to A, then `/auth/callback` on that same
authority to B; both receive the same Host and Keycloak remains external. Harness evidence proves A's host-only,
callback-path cookie reaches B and is not sent to another tenant authority. The browser completes the real Keycloak
`demo` login. Cucumber does not connect to Redis or import private authentication modules.

```bash
docker compose up -d redis keycloak
pnpm test:bdd
```

The feature-level `@partial` scenarios cover real completion as a validated-success 204 with correlation cleared and
no session/protected content or application re-emission of callback parameters; cross-tenant/transaction mismatch;
missing/invalid/expired recovery; replay; a healthy race with exactly one 204 winner and all others denied; and an
application-handled controlled provider-error callback. They also submit an invalid or wrong-state callback followed
in the same browser by the original valid provider return, asserting that pre-consumption denial preserves the
browser correlation and the valid return completes while the attempt remains live.
The browser does not inspect exact identity fields; public-service evidence proves tenant/issuer/subject/`auth_time`.
Callback parameters necessarily appear in the inbound browser URL; inspect only application-produced output when
asserting non-disclosure. Capture callback URLs/cookies only transiently at HTTP/browser boundaries for controlled
negative requests. Use a short per-
scenario transaction TTL for expiry, wait for the public callback to deny, and do not inspect Redis.

Real Keycloak must establish the common completion path with non-repudiation checks enabled. Controlled-transport
public-service tests may establish focused invalid signature/audience/nonce/claim outcomes that the tracked realm
cannot safely synthesize, but cannot replace the real flow. If tracked Keycloak cannot emit a standards-valid signed
token without `auth_time`, keep that exact negative claim at the public OIDC-client/service boundary and explicitly
record the HTTP/browser limitation; do not substitute a prepared identity or mock callback.

Call a cancellation real Keycloak cancellation only if the provider UI actually emits it. Otherwise retain the
controlled public-HTTP provider-error scenario and record real-provider cancellation as unexecuted.

## 6. Readiness and rollback evidence

Replace the existing synchronous runtime resolution probe with `runtime.runPromise(...)` and await it before the
instrumentation import completes. With Redis deliberately unreachable, start a fresh production frontend and assert
that the awaited probe fails and the process never passes the existing port/readiness gate or serves routes. Restore
Redis, start a new process, and assert the same awaited probe completes and the process becomes ready. Retain both
cases so the check cannot pass without actually resolving asynchronous Layers. Repeat the startup boundary for
configuration: absent `OIDC_CLIENT_SECRETS_JSON` is valid and becomes an empty map; malformed explicit JSON or an
invalid map entry fails readiness without echo; absent TTL uses 600 seconds; valid integer boundaries 1 and 600 acquire;
and zero, negative, fractional, nonnumeric, greater-than-600 and overflow-shaped TTL values fail readiness. Public
clients need no secret; a confidential tenant whose nonempty reference is absent from a valid map reaches only
request-level authentication unavailability.

Then stop or isolate Redis after readiness. Prove a command rejected before send maps `/auth/login` or
`/auth/callback` to safe authentication unavailability, never executes after reconnection, and permits a later new
request to succeed after an ordinary reconnect when the client is ready. Prove an in-flight disconnect is not retried
and may have consumed. Separately prove a stalled-open connection hits the configured socket timeout, fails its
pending request, is treated as ambiguous with no retry, and leaves the process/runtime requiring restart or
recreation because the pinned strategy stops reconnecting on `SocketTimeoutError`. Do not claim public-route survival
during initial acquisition failure; its blast radius is the whole process and recovery requires restart/recreation.

Exercise or assess one mixed-version transition in each direction. Old/new callback incompatibility may deny an
in-flight login but must never accept it. Confirm rollback needs no migration and that new versioned keys plus host-
only callback-path cookies are harmless orphans that fail closed and expire within the transaction TTL.

## 7. Repository gates

```bash
pnpm typecheck
pnpm build
pnpm lint
pnpm check:unused
pnpm fallow
pnpm format:check
```

Run lint fixes before formatting writes if remediation is needed. Do not add suppressions. Re-run focused and full
tests after any formatter/linter-driven edits.

## 8. Manual/ad hoc checks and evidence limits

Inspect real runtime logs and exported OTel data manually for useful correlation and accidental sensitive values.
Do not retain assertions over logs, spans, attributes, telemetry payloads, exporter behavior, or secret text.

Report these limits with the validation record:

- real provider execution is Keycloak only; Microsoft and broker chains are unexecuted;
- real-provider cancellation is unexecuted unless the Keycloak UI actually emitted it;
- a real confidential-provider round trip is unexecuted unless a controlled confidential client is actually added;
- #218 application-session creation and protected access are absent;
- #154 full callback/error application integration is absent; and
- #158 stale `auth_time` comparison, clock tolerance and unsupported-provider policy remain unresolved.
