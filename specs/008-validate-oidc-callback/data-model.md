# Data model: recoverable OIDC callback validation

This model describes semantic values and trust transitions for #217. It does not prescribe Redis JSON field names,
cookie names, provider-vendor claims, or an application-session representation.

## Trust-boundary map

```text
tenant file ─Schema─> ResolvedOidcIntegration
server secret source ─Schema─> ResolvedClientAuthentication
request host/query/cookie ─Schema─> CallbackRequest
validated tenant + correlation + singular state ─> AttemptAddress
Redis bytes ─Schema─> RecoverableAuthenticationAttempt
openid-client verified claims ─Schema─> TrustedIdentity
```

Each value is decoded once where it enters the owning module. Internal consumers receive already validated values;
they do not repeatedly decode them.

## PreparedAuthentication

The public result of beginning an authentication attempt.

| Field | Meaning | Exposure |
| --- | --- | --- |
| `destination` | Validated authorization endpoint URL | Browser redirect target |
| `correlation` | Opaque reference to the persisted attempt | Browser cookie only |
| `expiresAt` | Application-clock expiry used to align the cookie | Route adapter only |

It is not an identity, authenticated session, access grant, or provider response. Private state, nonce and PKCE
verifier values are absent from this public result.

## BrowserCorrelation

A distinct, opaque, 32-byte random value encoded with unpadded base64url. Its Schema accepts only the generated
shape before any store lookup. It is safe to disclose only as an opaque reference; possession has no authentication
meaning. It is independent of the provider-visible OIDC state parameter.

## AttemptAddress

A private, deterministic address derived only after the callback boundary has independently established:

- the canonical tenant alias selected from the request host;
- the exact registered callback authority for that tenant;
- one valid opaque browser correlation; and
- exactly one well-formed OIDC `state` from an otherwise valid success or error callback shape.

The storage key uses the configured namespace plus an unambiguous encoding or digest of tenant, correlation, and
state. Correlation alone cannot address a record. A wrong tenant or authority, invalid correlation, malformed query,
or missing/duplicate/wrong state never reaches `GETDEL` for the legitimate address and therefore cannot burn the
original attempt.

## RecoverableAuthenticationAttempt

A versioned, short-lived record encoded by the private transaction child and decoded immediately after atomic
consumption.

| Semantic field | Purpose | Invariant |
| --- | --- | --- |
| format version | Supports explicit decode failure rather than guessed migration | One recognized current version |
| correlation binding | Detects an incorrectly addressed or corrupted record | Equals the validated lookup reference |
| tenant alias | Binds initiation to the independently resolved callback tenant | Exact canonical alias match |
| provider issuer/client identity | Binds the attempt to the selected tenant integration | Equals re-resolved configuration |
| callback authority and redirect URI | Prevents moving the callback to another return boundary | Exact normalized match |
| OIDC state | Validates authorization response integrity | Exact expected value |
| OIDC nonce | Binds signed identity evidence | Exact expected value |
| PKCE verifier | Proves the code exchange belongs to initiation | Never browser-visible |
| created and expiry instants | Enforces the bounded application-clock lifetime | `expiresAt` is after creation and not after the selected TTL |

The record contains no resolved credential, authorization code, access/refresh/ID token, raw provider response,
trusted identity, or application-session state. Redis also applies its own TTL to the record.

### Lifecycle

```text
prepared → stored → atomically consumed → validated handoff
                    ├─→ denied: missing, corrupt, expired or mismatched
                    ├─→ denied: provider cancellation or failure
                    └─→ denied: exchange or signed-evidence failure

stored → expired by Redis
stored → unchanged: request cannot derive the exact tenant/correlation/state address
```

There is no transition back from consumed to stored. A callback outcome after successful `GETDEL`, including a
provider denial or downstream validation failure, burns the attempt. An ambiguous consume transport failure is not
retried because the record may already have been removed.

## CallbackRequest

The public completion input carries untrusted request-boundary data that the parent validates in order:

- request host/authority used for independent tenant resolution;
- the opaque correlation artifact from the named host-only cookie; and
- an exact representation of callback query parameters that preserves absence and duplicates so contradictory
  success/error or duplicate security parameters can be rejected rather than silently collapsed.

Before storage access, the parent independently resolves the tenant; compares the current authority to its exact
registered callback authority; validates correlation form; and requires one state in a valid success or provider-
error shape. Only that qualified request becomes an internal attempt address. A matching error/cancellation consumes
once; later provider/exchange/identity failure also remains consumed.

It does not contain a prepared identity or caller-selected tenant. The authentication service derives tenant and
integration binding through its dependencies.

## ResolvedClientAuthentication

A private server-only discriminated value:

- `public`: use the OIDC public-client method and no credential; or
- `confidential`: the selected non-secret reference has resolved to one server-only secret for standards-based
  client authentication.

The value is passed directly from the private credential child to the private provider child under parent
orchestration. It is never persisted in the attempt or returned through public types, diagnostics, URLs or cookies.

## TrustedIdentity

The public success value handed to the later #218 session consumer.

| Field | Source | Guarantee |
| --- | --- | --- |
| tenant alias | independently resolved tenant plus recovered binding | Belongs to the completed attempt |
| issuer | openid-client validated signed identity evidence | Matches the configured provider |
| subject | required nonempty `sub` claim after protocol validation | Identifies the user within the issuer |
| authenticated at | required integer `auth_time` after protocol validation | Presence only; no stale-time judgment |

The type is provider-neutral and contains no token, raw claim map, email/display-name assumption, credential,
authorization decision, application-session identifier or protected data. Its existence proves callback validation,
not logged-in application state.

## Expected public outcomes

The public service separates expected denials from operational unavailability and existing tenant HTTP failures.
Route adapters may intentionally present several denial reasons through one safe outcome, but tests at the public
service boundary can distinguish categories needed to establish semantics.

| Outcome | Examples | Trusted handoff |
| --- | --- | --- |
| trusted | one bound, current, successfully validated callback | One `TrustedIdentity` |
| denied before consume | wrong tenant/authority, invalid correlation, malformed query, or missing/duplicate/wrong state | None; valid original remains usable |
| denied at recovery | qualified address has no live record because it is missing, expired, or already consumed | None |
| denied after consume | corrupt attempt, matching cancellation/error, invalid provider evidence, or missing claims | None; addressed attempt is single-use |
| unavailable after readiness | Redis/provider/credential command cannot safely complete after process startup | None |
| existing tenant HTTP error | callback host cannot select/read valid tenant configuration | None |

Defects and interruption are not converted into these expected outcomes.
