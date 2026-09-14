# Data Model: Tenant Resolution

**Status**: Phase 1 design; no durable schema or migration.

## Tenant identity

`TenantSlug` is a canonical lowercase ASCII DNS label: 1–63 characters, letters/digits with optional interior hyphens,
no leading/trailing hyphen. `www` is reserved and cannot identify a tenant. Host case is normalized to lowercase;
configured slugs must already be canonical. A slug is unique within the source and is not a display name.

## Tenant configuration

`TenantConfig` contains exactly one field:

| Field         | Type   | Validation                                                                          | Meaning                                                |
| ------------- | ------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `displayName` | string | Required; nonempty after checking trimmed whitespace; preserve valid supplied text. | Human-readable Display Name shown on the landing page. |

Unknown configuration fields are rejected for this slice. Display Name is not unique, does not select tenancy, and
is rendered as text. No branding, copy, connection, billing, or session fields are added. Later shape changes belong
to later features and must update the contract intentionally.

## Tenant record

`TenantRecord` pairs `slug: TenantSlug` with `config: TenantConfig`. The slug is identity metadata, not another
configuration field. Records are readonly. A source lookup for one slug must return that same slug or fail. Duplicate
slugs invalidate static-source configuration; duplicate Display Name values are allowed.

Example synthetic record:

```json
{
  "slug": "springfield",
  "config": { "displayName": "Springfield Demo" }
}
```

## Bound identity and current context

`BoundTenant` contains `slug` and `origin`. `CurrentTenantContext` adds `config`. Allowed origin values form a closed set:

| Origin            | Meaning                                                                           |
| ----------------- | --------------------------------------------------------------------------------- |
| `host-associated` | The trusted host yielded this slug and a matching known record passed validation. |
| `local-static`    | Explicit development mode supplied this record without host association.          |

Origin is not a configuration field or user-facing label. A local-static context is not proof of authentication,
host ownership, or session validity. Consumers cannot change identity through configuration reads.

## Resolution settings

The application mode has exactly two values: `host` and `static`. Absence selects `host`. `static` is effective only
under development runtime; production always requires host association. Unsupported values select `host` and emit the diagnostic `invalid-mode`, without echoing the supplied value. This diagnostic is not a resolution failure; host validation and record lookup still determine the outcome.
Host mode uses the environment's fixed suffix (`localhost` in development; `pathable.com` otherwise). Static mode
requires exactly one explicit local record.

## Failure vocabulary

Internal reasons are closed and contain no HTTP concepts in model types:

| Reason               | Condition                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `invalid-host`       | Missing or disallowed authority/host pattern.                                            |
| `unknown-tenant`     | Valid slug has no source record.                                                         |
| `invalid-settings`   | Malformed selected environment settings; excludes unsupported mode values.               |
| `invalid-config`     | Invalid record/Display Name, duplicate slug, or lookup slug mismatch.                    |
| `config-unavailable` | Source cannot complete the read.                                                         |
| `invalid-context`    | Internal request identity is absent, malformed, inconsistent, or has a forbidden origin. |

The HTTP adapter maps these reasons as specified in [tenant-context.md](contracts/tenant-context.md); model/source code
does not depend on status codes or framework response types.

## Request lifecycle

1. Unresolved request enters the trusted boundary.
2. Host mode establishes a slug then validates its source record; static mode validates its explicit record.
3. The request either becomes a bound identity or ends in failure. A failed host request never transitions to static mode.
4. Consumers read a matching current context; repeated reads retain the same identity within the request.
5. The context ends with the request. There is no persisted state transition, tenant switch, record mutation, or session.

Static source data remains immutable for a running process. Restarting with replacement data affects subsequent
requests. There is no write interface, version history, retention policy, or durable identity lifecycle in this slice.

## Mode-selection diagnostic

`ModeSelection` contains the effective `mode` and an optional readonly `diagnostic` with category `invalid-mode` and fixed accepted-mode guidance defined in the context contract. This metadata comes from the pure mode selector, not `TenantContext` or a resolution failure. The server settings adapter logs it through its warning sink; it contains no raw setting, host, slug, or Display Name.
