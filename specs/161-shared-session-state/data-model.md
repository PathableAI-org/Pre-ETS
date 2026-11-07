# Data Model: Shared Session State

**Plan**: [plan.md](./plan.md)

This model describes transient frontend session state. It is not a durable domain model and creates no backend or
Postgres ownership.

## Effective session policy

| Field                | Type         | Rules                                                                                                                                                         |
| -------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idleTimeoutMinutes` | whole number | Explicit values are 5 through 30 inclusive; omission resolves to 30; invalid explicit values fail configuration.                                              |
| `warningLeadMinutes` | whole number | Omission resolves to 5 except when timeout is 5, where it resolves to 0; explicit 0 disables warning; a nonzero value is positive and strictly below timeout. |

The effective policy is calculated only from a successfully decoded tenant document. Invalid explicit policy never
falls back. A session snapshots the effective warning lead and derives a deadline at establishment or qualifying
refresh; an unrefreshed session does not change when the tenant file changes.

## Session identity

| Field         | Type                    | Rules                                                                                                                    |
| ------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `issuer`      | non-empty string        | Trusted identity input from the confirmed authentication boundary; not independently reinterpreted by the session store. |
| `subject`     | non-empty string        | User identifier scoped by issuer.                                                                                        |
| `tenantAlias` | branded lowercase alias | Binds the session to the selected tenant; a different request tenant yields mismatch, not identity.                      |

Tokens, credentials, provider-specific policy, domain roles, and arbitrary application values are not session identity.

## Opaque session reference

- A browser-held opaque base64url value generated from cryptographic random bytes.
- Possession is not sufficient for usable identity; the addressed record must exist, decode, match the tenant where
  tenant admission is required, and be strictly before its deadline.
- Redis addressing hashes the reference under the configured versioned prefix. Public errors and retained evidence do
  not expose references or keys.
- The reference has no durable business meaning and is not a user or tenant identifier.

## Stored transient session v1

| Field                           | Type                       | Purpose                                                                       |
| ------------------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| `version`                       | literal `1`                | Rejects unknown record formats rather than guessing.                          |
| `issuer`                        | non-empty string           | Identity issuer.                                                              |
| `subject`                       | non-empty string           | Identity subject.                                                             |
| `tenantAlias`                   | branded tenant alias       | Tenant admission boundary.                                                    |
| `idleDeadlineEpochMilliseconds` | positive safe whole number | Authoritative exclusive deadline; equality is expired.                        |
| `warningLeadMinutes`            | nonnegative whole number   | Effective policy snapshot; 0 means warning disabled, not expiration disabled. |
| `telemetryId`                   | UUID                       | Safe correlation value; not the browser reference or Redis key.               |

The decoder rejects missing, extra, malformed, or unknown-version fields. Redis TTL is set to the remaining interval
for cleanup but does not replace the stored deadline as authority.

## Public session outcomes

### `UsableSession`

Contains the trusted identity, tenant alias, current authoritative deadline, and warning lead. It is returned only
when state is present, valid, tenant-admitted where applicable, and strictly before the deadline.

### `NoUsableSession`

A fieldless terminal result for absent, malformed browser reference, missing record, expired record, or invalidated
record. It carries no identity, policy, cause, or recovery instruction.

### `SessionTenantMismatch`

A fieldless expected error when a valid current record belongs to a different selected tenant. Consumers deny access;
they do not turn mismatch into absence, login, or a replacement session.

### `SessionServiceUnavailable`

A fieldless expected error for storage transport failure, record encode/decode failure, malformed store reply, or
exhausted reference collisions. Consumers deny protected success and preserve the distinction from no usable session.

Defects and interruption remain outside these expected outcomes.

## Activity classification

Qualifying activity is a closed set of deliberate user actions such as a page request, form submission, intentional
control activation, text/keyboard/touch input, meaningful input focus, or explicit continuation. It requires the
then-effective policy and may renew only before the current deadline.

Excluded activity is a closed set including automatic polling, programmatic focus, raw pointer movement, and unrelated
background traffic. It never carries policy and never changes the record or TTL.

Browser detection and request classification are inputs owned by downstream integration; this feature owns the
session transition once classification is supplied.

## State transitions

```text
absent -- establish(valid identity, tenant, policy) --> usable(deadline, warning)

usable -- read before deadline ---------------------> usable (unchanged)
usable -- excluded activity before deadline --------> usable (unchanged)
usable -- qualifying activity before deadline ------> usable (new deadline and current warning policy)

usable -- read/refresh at or after deadline --------> no usable session + record removed
usable -- explicit invalidation --------------------> no usable session + record removed
usable -- tenant mismatch on tenant-bound operation -> SessionTenantMismatch (record unchanged)
usable -- storage/codec/reply failure --------------> SessionServiceUnavailable (no success claim)
```

Invalidation and expiry are final for the addressed record. A later timeout increase, refresh, retry, or concurrent
request does not recreate it. Establishment after the fact creates a different opaque reference and is not revival.

## Concurrency invariants

- One Redis transition validates and decides expiry, tenant match, excluded activity, or qualifying refresh for one
  addressed record before a single final mutation.
- If renewal commits before invalidation, the subsequent invalidation removes the renewed record.
- If invalidation commits first, renewal observes missing state and cannot recreate it.
- If expiry has authority at the received time, refresh deletes or observes ended state and cannot revive it.
- A lost mutation reply yields service failure; the service does not blindly retry and claim a known result.

## Data lifecycle and cleanup

- Creation uses a finite TTL no later than the stored deadline.
- Refresh replaces the record and TTL together only for qualifying pre-deadline activity.
- Expiry or explicit invalidation deletes the record; no tombstone is required by this slice.
- Tests and probes use validated unique prefixes, synthetic identities, and owned cleanup.
- Retained evidence records semantic outcomes only, never opaque references, Redis keys, cookies, raw records,
  credentials, tokens, or client-identifying data.
