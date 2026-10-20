# Module contracts: recoverable OIDC callback validation

These signatures are planning-level TypeScript shapes. Implementation must verify exact installed Effect 4.0.5,
openid-client 6.8.8 and Next 16.4.2 declarations before choosing imports or constructors.

## Public authentication owner

`packages/frontend/src/lib/authentication.ts` remains the only application-visible authentication module. Runtime,
routes and external tests import this parent, never `lib/authentication/*`.

```ts
interface AuthenticationService {
  readonly prepare: (
    input: PrepareAuthenticationInput,
  ) => Effect.Effect<PreparedAuthentication, AuthenticationUnavailable | HttpError>

  readonly complete: (
    input: CompleteAuthenticationInput,
  ) => Effect.Effect<TrustedIdentity, AuthenticationDenied | AuthenticationUnavailable | HttpError>
}
```

The exact tagged-error fields remain minimal and safe. They carry stable application meaning, not Redis bytes,
provider payloads, tokens, URLs containing callback parameters, credentials or exception strings. `HttpError`
continues to preserve the existing tenant 404/500 distinction. Defects and interruption remain outside the typed
expected-error channel.

`prepare` persists the attempt before it succeeds. `complete` independently resolves the request tenant, validates
correlation syntax, atomically consumes one attempt, checks all binding/expiry rules, validates the provider
response, and returns one provider-neutral trusted identity. It never creates an application session.

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
  `effect/persistence/Redis` service to the private transaction adapter.
- Hide supplied Redis requirements with `Layer.provide`; do not merge them into the authentication output graph.
- Compose the authentication Layer only in `src/lib/runtime.ts`, retaining the single existing `ManagedRuntime`.
- Never construct a runtime or long-lived Redis/provider client per request.
- Use `Effect.gen` for inline route/runtime orchestration, named `Effect.fn` for meaningful public boundaries and
  `Effect.fnUntraced` for reusable helpers that do not merit spans. Use `return yield*` for terminal failure paths.
- Decode untrusted environment, callback and Redis data with Schema at entry. Do not re-decode validated internal
  values.

## Private transaction capability

The authentication parent consumes one private transaction capability with semantic operations equivalent to:

```ts
interface AuthenticationTransactions {
  readonly create: (
    attempt: NewAuthenticationAttempt,
  ) => Effect.Effect<StoredAttemptReference, TransactionUnavailable>

  readonly consume: (
    correlation: BrowserCorrelation,
  ) => Effect.Effect<RecoverableAuthenticationAttempt, AttemptUnavailable | TransactionUnavailable>
}
```

Production behavior:

- use the configured namespace and a distinct generated correlation key;
- create with atomic `SET ... NX PX ...`, with bounded collision handling;
- consume with one `GETDEL`, Schema-decode the returned bytes once, and check explicit expiry with the Effect clock;
- never retry an ambiguous consume;
- consume corrupt or mismatched bytes without restoration; and
- retain no process-memory fallback.

The implementation may use `Redis.Redis.send` for these Redis commands. It must add `redis@6.3.0` as a direct
frontend dependency because it is a peer of `@effect/platform-node`; the current transitive lock resolution is not
ownership. Do not build a parallel generic Redis service if pinned declarations meet the atomic-command contract.

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
server-only, vendor-neutral `OIDC_CLIENT_SECRETS_JSON` mapping from configured non-secret references to values,
Schema-decodes it once, and exposes only the selected private value to parent orchestration. A malformed setting or
missing selected reference becomes generic authentication unavailability without echoing source data.

This is not a general secrets platform and adds no cloud-vendor SDK or new tenant-file field. Public clients require
no secret. The value must not enter attempt persistence, diagnostics, callback output, public errors or browser data.

## Route dependency contract

`/auth/login` and `/auth/callback` are Node Route Handlers because they must write or clear the correlation cookie.
They call the shared runtime and public authentication parent only. They do not import Effect Redis/OIDC services,
private authentication children, or construct their own Layer/runtime.

## Verification gate for installed declarations

The planning checkout has no `packages/frontend/node_modules`. Implementation cannot infer installed declarations
from the ahead-of-pin local Effect checkout. After installation, verify at minimum:

1. the `@effect/platform-node/NodeRedis` barrel and Layer signature at 4.0.5;
2. `effect/persistence/Redis` service, `send`, errors and Layer requirements at 4.0.5;
3. scoped finalization and hidden Layer requirements in the composed type graph;
4. openid-client grant/check/client-auth signatures at 6.8.8; and
5. Next Route Handler cookie and redirect declarations at 16.4.2.
