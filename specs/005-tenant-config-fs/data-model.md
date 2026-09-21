# Data Model: Filesystem Tenant Configuration

**Status**: Phase 1 design for [spec.md](./spec.md). Extends the tenant identity and
`TenantConfig` shapes already shipped by features 001–004; does not introduce a SQL schema.
Filesystem is the current durable store (constitution exception in [plan.md](./plan.md));
Postgres is out of scope for this model.

## Tenant alias (slug)

Unchanged from 001: canonical lowercase DNS label, 1–63 characters, `www` reserved.
The alias is:

- Derived from trusted `Host` in host mode, or
- Taken from `TENANT_STATIC_ALIAS` in development static mode.

The same string is the filename stem: `{alias}.json`.

## Tenant configuration

`TenantConfig` is unchanged from current frontend types:

| Field                | Type              | Validation                                     |
| -------------------- | ----------------- | ---------------------------------------------- |
| `displayName`        | string            | Required; non-blank after trim                 |
| `oidc`               | object            | Required; existing issuer/clientId/clientAuth… |
| `idleTimeoutMinutes` | number (optional) | Whole minutes 5–30 if present                  |

Unknown keys rejected. OIDC loopback HTTP rules unchanged.

## Tenant record (file body)

Each file is one `TenantRecord`:

```json
{
  "slug": "springfield",
  "config": {
    "displayName": "Springfield Demo",
    "oidc": {
      "issuer": "https://idp.example/realms/pre-ets",
      "clientId": "springfield-web",
      "clientAuth": "public"
    }
  }
}
```

| Field    | Rule                                                  |
| -------- | ----------------------------------------------------- |
| `slug`   | Required; canonical; **MUST equal** the filename stem |
| `config` | Required; must parse as `TenantConfig`                |

Synthetic fixtures only in-repo (no real client secrets in committed files).

## Tenant configuration directory

| Attribute   | Rule                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| Location    | Value of `TENANT_CONFIG_DIR`                                                                                 |
| Resolution  | Absolute as given; relative → resolve against **process CWD at boot** (source construction), not per-request |
| Validation  | Fail-fast at source construction: missing / empty / non-directory → configuration unavailable                |
| Contents    | Zero or more `{alias}.json` files directly in that directory                                                 |
| Lookup      | Exact path `{dir}/{alias}.json` for a requested alias; no recursive search                                   |
| Permissions | Recommend limited to the Node process user                                                                   |

## Static tenant name

| Attribute | Rule                                                                        |
| --------- | --------------------------------------------------------------------------- |
| Source    | `TENANT_STATIC_ALIAS`                                                       |
| When      | `TENANT_RESOLUTION=static` and development runtime only                     |
| Value     | Exactly one canonical alias naming the file to load                         |
| Invalid   | Missing, blank, non-canonical, or unusable file → local configuration error |

## Resolution settings (unchanged modes)

| Setting             | Values                     | Behavior                                              |
| ------------------- | -------------------------- | ----------------------------------------------------- |
| `TENANT_RESOLUTION` | `host` (default), `static` | Static only in development; production always host    |
| Unsupported mode    | —                          | Host association retained + `invalid-mode` diagnostic |

## Failure vocabulary (source layer)

| Reason                    | Condition                                                                                    | Typical HTTP adapter                |
| ------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------- |
| Unknown tenant            | Canonical alias; file `ENOENT`                                                               | 403 `forbidden()`                   |
| Configuration unavailable | Bad/missing directory, I/O error, malformed JSON, invalid config, slug≠filename, path escape | 500 / thrown `CONFIG_UNAVAILABLE`   |
| Local configuration error | Static mode: bad/missing `TENANT_STATIC_ALIAS` or its file                                   | 500 with developer-oriented message |

Host-binding failures (`invalid-host`) remain outside this source and unchanged.

Observability: log **reason categories** only (missing dir / I/O / parse / mismatch / escape);
never log file bodies.

## In-memory cache (process lifetime)

| Attribute    | Rule                                                                             |
| ------------ | -------------------------------------------------------------------------------- |
| Key          | Canonical alias                                                                  |
| Value        | Successfully parsed `TenantRecord`                                               |
| Lifetime     | Until process exit; restart required to pick up file edits                       |
| Immutability | Cached snapshots MUST be frozen / not mutated across requests (FR-012 isolation) |
| Miss         | Read one file, parse, freeze, store; then return                                 |

Superseded env documents (`TENANT_CONFIG_RECORDS_JSON`, `TENANT_LOCAL_CONFIG_JSON`) are not
part of this model and are never loaded.

## Lifecycle

1. Process starts; mode selected; resolve `TENANT_CONFIG_DIR` (CWD at boot if relative);
   filesystem source constructed with fail-fast directory validation.
2. Request binds alias (host) or uses static alias.
3. Source returns cached immutable record or opens at most one file for that alias.
4. Success returns `TenantConfig` to existing consumers; failure maps as above.
5. File edits require process restart to refresh the parse cache.

No write, delete, or admin mutation APIs in this model.
