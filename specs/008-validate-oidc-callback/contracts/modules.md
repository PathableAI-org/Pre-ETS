# Module contracts: recoverable OIDC callback validation

These signatures are planning-level TypeScript shapes. Implementation must verify exact installed Effect 4.0.5,
openid-client 6.8.8 and Next 16.4.2 declarations before choosing imports or constructors.

## Public authentication owner

`packages/frontend/src/lib/authentication.ts` remains the only application-visible authentication module. Runtime,
routes and external tests import this parent, never `lib/authentication/*`.

```ts
type CorrelationDisposition = "preserve" | "clear"

interface CallbackExpectedFailure {
  readonly reason: AuthenticationDenied | AuthenticationUnavailable | HttpError
  readonly correlationDisposition: CorrelationDisposition
}

interface AuthenticationService {
  readonly prepare: (
    input: PrepareAuthenticationInput
  ) => Effect.Effect<PreparedAuthentication, AuthenticationUnavailable | HttpError>

  readonly complete: (
    input: CompleteAuthenticationInput
  ) => Effect.Effect<TrustedIdentity, CallbackExpectedFailure>
}
```

The exact tagged-error fields remain minimal and safe. They carry stable application meaning, not Redis bytes,
provider payloads, tokens, URLs containing callback parameters, credentials or exception strings. `HttpError`
continues to preserve the existing tenant 404/500 distinction. Defects and interruption remain outside the typed
expected-error channel.

`prepare` resolves the tenant, normalizes the request Host, and requires it to equal the configured callback URL's
Host before provider delegation, transaction creation, or correlation issuance. It then persists the attempt before
it succeeds. `complete` independently resolves the request tenant and validates exact authority, callback shape,
singular state, and correlation syntax before it derives an attempt address. It then atomically consumes one attempt,
checks all binding/expiry rules, validates the provider response, and returns one provider-neutral trusted identity.
A request that cannot derive the exact address does not consume the valid original. Expected completion failures
carry only the route's safe correlation disposition: preserve when no matching attempt was consumed or failure is
known to precede send, and clear after consume or an ambiguous in-flight consume. The wrapper exposes no private
storage reason. The service never creates an application session.

## Parent-owned test construction

`authentication.ts` also owns one explicitly test-only construction seam. The planning-level shape is:

```ts
interface AuthenticationTestOptions {
  readonly tenantConfiguration: ReadonlyArray<AuthenticationTenantFixture>
  readonly credentialValues: Readonly<Record<string, string>>
  readonly redis: Layer.Layer<Redis.Redis>
  readonly clock: Clock.Clock
  readonly random: Random.Random
  readonly transport?: typeof fetch
  readonly transactionPrefix: string
}

interface AuthenticationTestHarness {
  readonly layer: Layer.Layer<AuthenticationService>
  readonly fixtures: AuthenticationRedisFixtureSetup
}

declare const makeAuthenticationTestHarness: (
  options: AuthenticationTestOptions
) => AuthenticationTestHarness
```

Exact installed types may adjust the syntax, but not the boundary: this is a closed parent factory over ordinary
platform/test inputs. It composes the real private transaction, credential, and provider children. Controlled HTTP
transport still exercises openid-client and the real provider child; callers cannot inject `TrustedIdentity` or a
completed provider result. The fixture handle may reserve an address or seed bytes under the unique test prefix only
to arrange collision/corruption cases. Its methods accept semantic setup descriptors owned by the parent and return
no raw key or encoded payload. Tests assert the public service result and never assert key/codec shape.

No private child Context service, codec, stored-attempt type, key builder, or provider result is exported. External
tests import this seam from `authentication.ts` and never import `authentication/*`. Production consumers receive the
normal live Layer/service rather than the fixture handle.

## Private ownership tree

```text
authentication.ts
└── authentication/
    ├── config.ts
    ├── credentials.ts
    ├── provider.ts
    └── transaction.ts
        └── transaction/
            ├── codec.ts
            └── store.ts
```

- The public parent imports and orchestrates its immediate children.
- The transaction child alone may import its codec/store descendants.
- Sibling children never import one another or one another's descendants; the parent mediates validated values.
- The public parent re-exports only capabilities/types a current consumer needs.
- Do not introduce public Redis, OIDC-provider, transaction-store, codec or generic-secrets services.
- Do not move authentication attempts into `session.ts`; #218 owns application sessions.

## Effect construction contract

- Public service interfaces are readonly and operations expose success, typed expected errors and requirements.
- Production Layers acquire resource-owning clients and dependencies. `NodeRedis.layer` supplies the scoped
  `effect/persistence/Redis` service to the private transaction adapter. Construct it with node-redis
  `disableOfflineQueue: true` so commands submitted while disconnected/reconnecting reject instead of being queued
  for later execution.
- Hide supplied Redis requirements with `Layer.provide`; do not merge them into the authentication output graph.
- Compose the authentication Layer only in `src/lib/runtime.ts`, retaining the single existing `ManagedRuntime`.
- Never construct a runtime or long-lived Redis/provider client per request.
- Build the production Redis Layer eagerly as part of the shared runtime. Initial acquisition failure prevents the
  whole frontend process from becoming ready; only command failures after readiness become typed authentication
  unavailability. Replace the current `runtime.runSync(...)` layer-resolution probe with an awaited
  `runtime.runPromise(...)` call in boot orchestration before the instrumentation import completes, and dispose the
  partially acquired runtime on failure. Recovery from initial failure requires process restart/recreation.
- Do not put an application timeout around `Redis.send`/`GETDEL`. The pinned generic service accepts no per-command
  abort signal, so returning on an Effect deadline could leave an uncancelled command able to delete later.
- Distinguish Redis failure points. A command rejected before send becomes typed unavailability and cannot later
  execute. A disconnect after send is ambiguous, is not retried, and may already have consumed. A later new request
  may succeed once the client reconnects.
- Use `Effect.gen` for inline route/runtime orchestration, named `Effect.fn` for meaningful public boundaries and
  `Effect.fnUntraced` for reusable helpers that do not merit spans. Use `return yield*` for terminal failure paths.
- Decode untrusted environment, callback and Redis data with Schema at entry. Do not re-decode validated internal
  values.

## Private transaction capability

The authentication parent consumes one private transaction capability with semantic operations equivalent to:

```ts
interface AuthenticationTransactions {
  readonly create: (
    attempt: NewAuthenticationAttempt
  ) => Effect.Effect<StoredAttemptReference, TransactionUnavailable>

  readonly consume: (
    address: AttemptAddress
  ) => Effect.Effect<RecoverableAuthenticationAttempt, AttemptUnavailable | TransactionUnavailable>
}
```

Production behavior:

- derive an address from canonical tenant alias, distinct generated correlation, and expected OIDC state only after
  the parent validates exact authority and query shape;
- create with atomic `SET ... NX PX ...` and report non-overwrite when the exact qualified address already exists;
- let the parent handle collision by discarding and regenerating the complete correlation/state/nonce/verifier/
  destination candidate within a bounded retry before exposing any redirect or cookie; never replace the reserved
  original and never claim global correlation uniqueness;
- consume with one `GETDEL`, Schema-decode the returned bytes once, and check explicit expiry with the Effect clock;
- never access storage when tenant/authority/correlation/query/state cannot derive the exact address;
- never retry an ambiguous consume;
- consume corrupt or mismatched bytes without restoration; and
- retain no process-memory fallback.

The parent maps transaction outcomes to correlation disposition without exposing them to the route: invalid or
unqualified input, a missing qualified address, and a command rejected before send preserve the cookie; actual
consume and an ambiguous in-flight consume clear it. This preserves the browser side of the same later-valid-callback
guarantee established for the server attempt.

The implementation may use `Redis.Redis.send` for these Redis commands. It must add `redis@6.3.0` as a direct
frontend dependency because it is a peer of `@effect/platform-node`; the current transitive lock resolution is not
ownership. Do not build a parallel generic Redis service if pinned declarations meet the atomic-command contract.

Named public-service and real-Redis evidence must prove that wrong tenant, authority, or state leaves the original
address consumable by the later valid callback. A matching success or provider error/cancellation consumes once;
post-consume provider/exchange failure does not restore it. Collision evidence must prove the reserved original
remains callback-usable after a later preparation candidate collides.

The transaction configuration is decoded once at Layer acquisition. Absent `OIDC_TX_TTL_SECONDS` means 600 seconds.
An explicit value must be a base-10 integer from 1 through 600 inclusive; conversion occurs only after validation and
cannot exceed 600,000 milliseconds. Zero, negative, fractional, nonnumeric, greater-than-600 and overflow-shaped
values prevent process readiness. The TTL controls recovery artifacts only and is not #158 `auth_time` freshness.

## Private provider capability

Preparation receives the already validated tenant integration and resolved client-authentication value and returns:

- a validated provider destination for the browser; and
- private protocol material for the attempt: state, nonce and PKCE verifier plus normalized provider/return binding.

Completion receives only validated/recovered values from the parent. It uses `authorizationCodeGrant` with the PKCE
verifier, expected state and expected nonce and requires an ID token. It returns signed claims only after the OIDC
library has completed response, code-exchange, issuer, audience, signature and nonce checks. A Schema then requires
nonempty `sub` and integer `auth_time` and projects the result into `TrustedIdentity`.

Do not pass a new `maxAge` comparison: `max_age=0` remains an initiation request parameter, while #158 owns the
staleness comparison and clock tolerance. Preserve transport redirect rejection, interruption propagation and the
single provider-operation deadline from the predecessor design.

## Private credential capability

Credential resolution exists because confidential callback exchange is now a real consumer. Production reads one
server-only, vendor-neutral `OIDC_CLIENT_SECRETS_JSON` mapping from configured non-secret references to values and
Schema-decodes it once at Layer acquisition. Absence decodes to the valid empty map. A malformed explicitly supplied
mapping prevents whole-process readiness without echoing source data. Public clients require no selected secret. A
confidential tenant with a nonempty reference absent from the valid map receives request-level
`AuthenticationUnavailable`.

This is not a general secrets platform and adds no cloud-vendor SDK or new tenant-file field. Public clients require
no secret. The value must not enter attempt persistence, diagnostics, callback output, public errors or browser data.

## Route dependency contract

`/auth/login` and `/auth/callback` are Node Route Handlers because they must write, preserve, or clear the correlation
cookie.
They call the shared runtime and public authentication parent only. They do not import Effect Redis/OIDC services,
private authentication children, or construct their own Layer/runtime. Login emits no redirect or cookie when the
normalized request Host differs from the configured callback Host. Callback applies the public completion contract's
correlation disposition: omit deletion on preserve and expire the matching host/path cookie on clear.

## Verification gate for installed declarations

The planning checkout has no `packages/frontend/node_modules`. Implementation cannot infer installed declarations
from the ahead-of-pin local Effect checkout. After installation, verify at minimum:

1. the `@effect/platform-node/NodeRedis` barrel and `layer(options?: NodeRedisClientOptions)` signature at 4.0.5;
2. node-redis 6.3.0's `disableOfflineQueue` option and its pre-send offline rejection behavior;
3. `effect/persistence/Redis` service, `send`, errors and Layer requirements at 4.0.5, including the absence of a
   safely cancellable per-command timeout/abort input;
4. scoped finalization and hidden Layer requirements in the composed type graph;
5. openid-client grant/check/client-auth signatures at 6.8.8; and
6. Next Route Handler cookie and redirect declarations at 16.4.2.

Exact tag source at `effect@4.0.5` and `redis@6.3.0` supports these planning decisions, including option pass-through,
pre-enqueue offline rejection, disconnect queue flushing, and the generic service's non-cancellable send shape.
Installed locked declarations remain the implementation gate; a mismatch stops the implementation rather than
licensing a parallel Redis abstraction.
