# Multi-tenancy strategy

The frontend owns tenant configuration. The server-only
[TenantConfigService](../packages/frontend-services/src/tenant.ts) resolves tenant aliases
and loads one `{alias}.json` file under `TENANT_CONFIG_DIR` for each read. The current
app has a welcome page and a tenant diagnostic route; login and sessions remain
follow-on work described in [authentication.md](./authentication.md). Durable business
records belong to the backend; see [domain-persistence.md](./domain-persistence.md).

## Tenant selection

`TENANT_RESOLUTION` selects `host` or `static` in every environment, including production:

- Host mode requires `BASE_HOSTNAME`. A host matching `${alias}.${BASE_HOSTNAME}`
  selects that alias. Tenant labels contain letters and hyphens and are normalized
  to lowercase. Bare base hosts, extra labels, and hosts with a retained port fail
  alias resolution. The diagnostic adapter passes the incoming Host header to the service.
- Static mode requires `TENANT_STATIC_ALIAS`, ignores the request host, and always
  selects that alias from the same configuration directory. It does not require
  `BASE_HOSTNAME`.

`TenantConfigService.getAlias` resolves an alias without reading a file;
`getConfigFromAlias` reads an explicit validated alias, and `getConfigFromHost`
combines selection and reading. Consumers use these operations rather than storing a
mutable current tenant or parsing hosts independently. Host reads do not consult
`X-Forwarded-Host` or query parameters. Deployment ingress must supply the trusted
original Host header and protect the diagnostic endpoint separately.

## Loading tenant configuration

```text
request Host → selected alias → TENANT_CONFIG_DIR/{alias}.json → validated tenant configuration
```

The [tenant module](../packages/frontend-services/src/tenant.ts) owns a private child at
`packages/frontend-services/src/tenant/config.ts`. Its `TenantConfig` value is an Effect `Config` recipe with
decoded type `Config.Success<typeof TenantConfig>`. Only `tenant.ts` imports this
child; sibling modules and tests use the public tenant service. A file-backed
`ConfigProvider` supplies the complete selected JSON document. This
provider is local to that read and does not replace the environment provider used
for process settings. The process-resolution configuration also has a `TenantConfig`
name in `packages/frontend-services/src/config/tenant-config.ts`; it is a separate contract.

Each read checks directory availability and reads one complete file snapshot. Later
calls observe file changes without restarting the process; there is no process-lifetime
parsed-file cache. Prefer an absolute directory path: relative paths are interpreted
by filesystem operations against the process working directory. Superseded
`TENANT_CONFIG_RECORDS_JSON` and `TENANT_LOCAL_CONFIG_JSON` are ignored.

The service never substitutes another file or a default tenant. Its HTTP outcomes are:

| Failure                                  | Status |
| ---------------------------------------- | ------ |
| Host cannot select a tenant alias        | 404    |
| Selected file missing in host mode       | 404    |
| Selected file missing in static mode     | 500    |
| Selected file has invalid JSON or schema | 404    |
| Other selected-file read failure         | 404    |
| Configuration directory unavailable      | 500    |

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

Non-secret credential references remain data. A secrets module/provider contract
and actual resolution are deferred until an authentication consumer needs to read
a real secret. Tenant loading and diagnostics do not resolve those references. Producers
must still prevent secrets inside permitted text fields; schema validation alone
cannot establish that external content is safe.

## Idle timeout and warning policy

`service.effectiveSessionPolicy(config)` is the public derivation for session consumers.
The private Config child uses that same logic to validate the warning/timeout
relationship. It
returns `idleTimeoutMinutes` and `warningLeadMinutes` from validated file content:

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
never part of this document. The welcome page consumes the same tenant service through
the request-cached `requireTenantConfig`; it does not call the diagnostic endpoint.

Local HTTP and OTel inspection can establish the running composition's selection,
status, response, and telemetry behavior. Durable service tests separately protect
validation, effective defaults, isolation, and public failure outcomes. Observability
is checked manually through application logs and exported OTel data. Neither form
of evidence establishes ingress protection or every external producer's content
controls. The scoped implementation and evidence are recorded in the
[#215 delivery plan](./delivery/tenant-auth-session-config.md).
