# Multi-tenancy strategy

The frontend owns tenant configuration. The server-only
[TenantConfigService](../packages/frontend-services/src/tenant.ts) resolves tenant aliases
and loads one `{alias}.json` file under `TENANT_CONFIG_DIR` for each read. Login,
callback, and sessions resolve the request tenant through this service; see
[authentication.md](./authentication.md) and [session-state.md](./session-state.md).
Durable business records belong to the backend; see
[domain-persistence.md](./domain-persistence.md).

## Tenant selection

`TENANT_RESOLUTION` selects `host` or `static` in every environment, including production:

- Host mode requires `BASE_HOSTNAME`. A host matching `${alias}.${BASE_HOSTNAME}`
  selects that alias. Tenant labels contain letters and hyphens and are normalized
  to lowercase; the hostname compares case-insensitively. A port never changes the
  selected tenant: `springfield.example.test:3000` selects Springfield on every route.
  Bare base hosts, extra labels, and malformed authorities (a path, credentials, or an
  out-of-range port) fail alias resolution. Every adapter passes the incoming Host
  header to `getAlias`, which owns this rule; no route strips or retries ports itself.
- Static mode requires `TENANT_STATIC_ALIAS`, ignores the request host, and always
  selects that alias from the same configuration directory. It does not require
  `BASE_HOSTNAME`.

`TenantConfigService.getAlias` resolves an alias without reading a file;
`getConfigFromAlias` reads an explicit validated alias, and `getConfigFromHost`
combines selection and reading. Consumers use these operations rather than storing a
mutable current tenant or parsing hosts independently. Host reads do not consult
`X-Forwarded-Host` or query parameters. Deployment ingress must supply the trusted
original Host header and protect the diagnostic endpoint separately.

Login and callback additionally require the request authority to equal the selected
tenant's configured callback origin, port included (an absent port means the origin
scheme's default). Tenant selection ignores the port; the origin check does not. See
[authentication.md](./authentication.md#callback-and-local-provider-settings).

## Loading tenant configuration

```text
request Host → selected alias → TENANT_CONFIG_DIR/{alias}.json → validated tenant configuration
```

The [tenant module](../packages/frontend-services/src/tenant.ts) owns a private child at
`packages/frontend-services/src/tenant/config.ts`. That child holds the file schema, the
`TenantConfig` type, and `effectiveSessionPolicy`. Only `tenant.ts` imports this child.
Sibling modules and tests use the public tenant module, which re-exports `TenantConfig`,
`SessionPolicy`, and `effectiveSessionPolicy`. The service reads the selected file with
`FileSystem.readFileString` and decodes it with `Schema.fromJsonString`. File content is
request-time input; it does not pass through the process `ConfigProvider`. The
process-level tenant selection settings are `TenantResolutionSettings` in
`packages/frontend-services/src/config/tenant-resolution.ts`; they are a separate contract.

Each read takes one complete file snapshot. When that read fails, the service then checks
whether the configuration directory is readable. That check separates a missing directory
(500) from a missing selected file. Later calls observe file changes without restarting the
process; there is no process-lifetime parsed-file cache. Prefer an absolute directory
path: relative paths are interpreted by filesystem operations against the process
working directory. Superseded `TENANT_CONFIG_RECORDS_JSON` and
`TENANT_LOCAL_CONFIG_JSON` are ignored.

The service never substitutes another file or a default tenant. It fails with one of
two tagged errors, `TenantNotFound` or `TenantReadError`. These carry no HTTP status.
The Next host adapters map them to an HTTP status in `src/next/tenant-failure.ts` (`tenantFailureStatus`).
The JSON diagnostic body is `{ _tag, message, status }`, where `_tag` is the bare error
name.

| Failure                                  | Error             | Status |
| ---------------------------------------- | ----------------- | ------ |
| Host cannot select a tenant alias        | `TenantNotFound`  | 404    |
| Selected file missing in host mode       | `TenantNotFound`  | 404    |
| Selected file missing in static mode     | `TenantReadError` | 500    |
| Selected file has invalid JSON or schema | `TenantNotFound`  | 404    |
| Other selected-file read failure         | `TenantNotFound`  | 404    |
| Configuration directory unavailable      | `TenantReadError` | 500    |

Invalid process settings fail runtime startup separately from request-time directory
or selected-file failures. Committed examples are synthetic and use the local
Keycloak integration values. Loading them performs no discovery or network request.

## Permitted file content

A tenant file contains `displayName`, required `oidc`, and optional
`idleTimeoutMinutes` and `warningLeadMinutes`. For example:

```json
{
  "displayName": "Springfield",
  "oidc": {
    "clientAuth": "confidential",
    "clientId": "pre-ets",
    "clientSecretRef": "springfield-oidc",
    "issuer": "http://localhost:8080/realms/pre-ets"
  },
  "idleTimeoutMinutes": 20,
  "warningLeadMinutes": 3
}
```

OIDC requires nonempty `issuer` and `clientId` integration identifiers, plus
`clientAuth` of `public` or `confidential`. Optional `connection` is a string. A
confidential client requires a nonempty non-secret `clientSecretRef`; a public client
has no such field. Unknown fields are rejected, including nested credential fields.
JSON types remain strict: strings, null, and booleans cannot substitute for numeric
policy settings.

Non-secret credential references remain data. Authentication alone resolves a
confidential client's `clientSecretRef`, from the server-only `OIDC_CLIENT_SECRETS_JSON`
map, when it needs the selected client; see
[Configuration for OIDC consumers](authentication.md#configuration-for-oidc-consumers).
Tenant loading and diagnostics do not resolve those references. Producers
must still prevent secrets inside permitted text fields; schema validation alone
cannot establish that external content is safe.

## Idle timeout and warning policy

`effectiveSessionPolicy(config)`, a pure export of the tenant module, is the public
derivation for session consumers. The file schema uses the same function to validate
the warning/timeout relationship. It returns `idleTimeoutMinutes` and `warningLeadMinutes` from validated file content:

| Supplied timeout              | Supplied warning                         | Effective timeout / warning                     |
| ----------------------------- | ---------------------------------------- | ----------------------------------------------- |
| Omitted                       | Omitted                                  | 30 / 5 minutes                                  |
| 5                             | Omitted                                  | 5 / 0 minutes; warning disabled                 |
| 6–30                          | Omitted                                  | Supplied timeout / 5 minutes                    |
| Any valid timeout, or omitted | 0                                        | Effective timeout / 0 minutes; warning disabled |
| Any valid timeout, or omitted | Positive integer below effective timeout | Effective timeout / supplied warning            |

Explicit timeout must be a JSON integer from 5 through 30. Explicit warning must be
a JSON integer from zero through one less than the effective timeout. Invalid
explicit settings fail the selected document; defaults apply only to omitted fields.
Resolve an omitted timeout to 30 before checking the warning relationship.

[#218](https://github.com/PathableAI-org/Pre-ETS/issues/218) and
[#220](https://github.com/PathableAI-org/Pre-ETS/issues/220) consume this derivation
for session creation and refresh. This module does not enforce expiration, display
warnings, or update live sessions.

## Diagnostic contract

`GET /_test/tenant-config` uses the real tenant service in production and other
environments, returning the complete parsed permitted document with
`Cache-Control: private, no-store`. Successful JSON equals an independently parsed
selected file. Defaults are not inserted into its response, and a non-secret
`clientSecretRef` remains visible. Provider credentials and resolved secrets are
never part of this document. Pages that need the tenant but no session, `/login-unavailable`
and `/_test/onsite`, consume the same tenant service through the request-cached
`requireTenantConfig`, so a tenant failure keeps its 404 or 500. The protected `/` page
resolves the tenant through its session read instead. No page calls the diagnostic
endpoint.

Local HTTP and OTel inspection can establish the running composition's selection,
status, response, and telemetry behavior. Durable service tests separately protect
validation, effective defaults, isolation, and public failure outcomes. Observability
is checked manually through application logs and exported OTel data. Neither form
of evidence establishes ingress protection or every external producer's content
controls. The scoped implementation and evidence are recorded in the
[#215 delivery plan](./delivery/tenant-auth-session-config.md).
