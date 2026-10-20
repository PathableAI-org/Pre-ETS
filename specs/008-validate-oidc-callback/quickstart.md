# Validation quickstart: recoverable OIDC callback validation

This is the implementation-time evidence plan for #217. Planning alone establishes no runtime behavior. Record the
commit, Effect/openid-client/Next declarations actually installed, Redis and Keycloak versions, two-instance layout,
commands executed, results and unexecuted integrations.

## 1. Preflight and declaration verification

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @pathableai/pre-ets-frontend exec tsc --version
```

Before coding, inspect the installed 4.0.5 declarations for `@effect/platform-node/NodeRedis` and
`effect/persistence/Redis`. Confirm the scoped Layer result/requirements, raw-command `send` shape, error types and
finalization. Also inspect installed openid-client 6.8.8 grant/check/client-auth declarations and Next 16.4.2 Route
Handler cookie/redirect declarations. The local Effect checkout is useful guidance but is not the product pin.

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

- prepare persists before success and returns only destination/opaque browser correlation;
- complete returns the exact expected provider-neutral tenant/issuer/subject/`auth_time` handoff;
- mismatch of tenant, correlation, provider/client, callback authority, state, nonce or verifier never hands off;
- wrong tenant/authority and missing/duplicate/wrong state are rejected before storage and leave the later valid
  callback usable;
- missing, invalid, expired, corrupt, consumed and replayed attempts deny;
- cancellation, provider error, mixed/duplicate callback parameters, exchange/signature/issuer/audience/nonce failure,
  missing subject and missing signed `auth_time` deny;
- a matching failed callback consumes the attempt;
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
pnpm --filter @pathableai/pre-ets-frontend test:unit -- tests/integration/authentication-redis.test.ts
```

Every test uses a unique key prefix and cleans up only keys it owns; never `FLUSHALL`. Construct two independent
scoped NodeRedis client/service/runtime graphs, not two handles to one in-memory object. Prove:

- instance A creates and independently composed instance B consumes;
- a healthy bounded race yields exactly one successful winner and denies every other consumer; replay yields none;
- a wrong-tenant or wrong-state callback does not consume the record, and the later valid callback succeeds;
- `SET NX` cannot overwrite an existing correlation;
- malformed bytes are consumed and safely denied; and
- Redis server-clock expiry makes the attempt unrecoverable.

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
attributes and clearing, query multiplicity mapping, pre-storage tenant/authority/state rejection, existing tenant
404/500, safe denial with no automatic login loop, empty successful callback 204, and absence of application-session/
protected content. Do not assert runtime construction, private calls, Redis keys/JSON, provider objects or Next
implementation internals.

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
no session/protected content; cross-tenant/transaction mismatch; missing/invalid/expired recovery; replay; a healthy
race with exactly one 204 winner and all others denied; and an application-handled controlled provider-error callback.
The browser does not inspect exact identity fields; public-service evidence proves tenant/issuer/subject/`auth_time`.
Capture callback URLs/cookies only at HTTP/browser boundaries for controlled negative requests. Use a short per-
scenario transaction TTL for expiry, wait for the public callback to deny, and do not inspect Redis.

Real Keycloak must establish the common completion path. Controlled-transport public-service tests may establish
focused invalid signature/audience/nonce/claim outcomes that the tracked realm cannot safely synthesize, but cannot
replace the real flow. If tracked Keycloak cannot emit a standards-valid signed token without `auth_time`, keep that
exact negative claim at the public OIDC-client/service boundary and explicitly record the HTTP/browser limitation;
do not substitute a prepared identity or mock callback.

Call a cancellation real Keycloak cancellation only if the provider UI actually emits it. Otherwise retain the
controlled public-HTTP provider-error scenario and record real-provider cancellation as unexecuted.

## 6. Readiness and rollback evidence

With Redis deliberately unreachable, start a fresh production frontend and assert that it never passes the existing
port/readiness gate and serves no routes. Restore Redis, start a new process, and assert it becomes ready. Then stop or
isolate Redis after readiness and assert `/auth/login` and `/auth/callback` map command failure to safe authentication
unavailability with no handoff/session. Do not claim public-route survival during initial acquisition failure; its
blast radius is the whole process and recovery requires restart/recreation.

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
