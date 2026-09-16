# Contract: Tenant Context and Configuration

**Applies to**: frontend-only tenant access and incoming application requests.
**Requirements**: FR-001–FR-015; SC-001–SC-006.

## Operations

These are module interfaces, not public HTTP endpoints. Public API is imported from
`packages/frontend/src/lib/tenant`.

| Operation                | Input                         | Output / failure                                                                                                                              | Owner                       |
| ------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `bindHost`               | Raw `Host` and host suffix    | Canonical slug, or unusable                                                                                                                   | `src/lib/tenant/host.ts`    |
| `readTenantRecord`       | Canonical slug                | Matching readonly record, unknown, or thrown read/parse failure                                                                               | `src/lib/tenant/source.ts`  |
| `getCurrentTenant`       | Current server-render request | Promise of slug; `forbidden()` on invalid/unusable Host                                                                                       | `src/lib/tenant` (prod/dev) |
| `getCurrentTenantConfig` | Canonical slug argument       | Promise of `TenantConfig`; `forbidden()` if the argument is not a canonical slug or is unknown; **throw** if the record cannot be read/parsed | `src/lib/tenant` (prod/dev) |

`getCurrentTenantConfig` is a server-only accessor, not a public Server Action. The nested `(app)` layout
(`AppLayout`) consumes the server-only session accessor as the application-wide gate and loads
`tenantConfig` from the tenant source via the validated `tenantId`. The landing page reads Display Name from
that same session snapshot. There is no React `cache()`, request memoization, Provider, or other
request-scoped store for tenant identity beyond the Proxy→SSR session context headers.

Consumers needing the slug use session context `tenantId` or `getCurrentTenant` on routes that still bind
Host directly. No browser-side tenant selection, public configuration endpoint, or persistence write
operation is exposed.

Production (`NODE_ENV === "production"`) always binds `{slug}.pathable.com`. It never reads `TENANT_RESOLUTION` or
`TENANT_LOCAL_CONFIG_JSON`. Only `NODE_ENV === "development"` loads the development implementation, which chooses host vs static
at process start. Unset, `test`, `staging`, and any other runtime use the production host implementation.

## Server settings

Place local settings in `packages/frontend/.env.local` or pass them to the frontend process. Do not use `NEXT_PUBLIC_`
variables or `next.config`'s public environment export. `.env.example` contains synthetic examples only.

| Variable                     | Format/default                                  | Effect                                                                                                                                                                                           |
| ---------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TENANT_RESOLUTION`          | `host` or `static`; absent means `host`         | Read only by the development implementation. Static ignores Host and returns the one `TENANT_LOCAL_CONFIG_JSON` slug. Other values retain host mode and emit the safe `invalid-mode` diagnostic. |
| `TENANT_CONFIG_RECORDS_JSON` | JSON array of tenant records; absent means `[]` | Known records for host mode. No automatic sample tenant.                                                                                                                                         |
| `TENANT_LOCAL_CONFIG_JSON`   | JSON tenant record; no default                  | Required only in effective static mode; never a fallback for a host-mode miss.                                                                                                                   |

An unsupported mode is not a failure response: emit `invalid-mode` with guidance to use `host` or development-only `static`, without logging the raw value. Continue host association using `{slug}.localhost`: a known host can succeed, an invalid/unknown host is `forbidden()`. Never consult the local static record for an unsupported mode.

Only the selected source is parsed. For example, malformed unused local data must not affect a production host-mode
request. Do not mutate parsed records or environment settings during a running process; restarting is the documented
update procedure.

### Mode diagnostic channel

`selectTenantMode(rawMode, production?)` lives with the tenant types. It returns `{ mode, diagnostic }`, where mode is
`host` or `static` and diagnostic is absent for accepted/omitted values or the readonly record
`{ category: "invalid-mode", message: "Use host or development-only static for TENANT_RESOLUTION; host association remains enabled." }`
for unsupported values. Production selection always returns host and does not emit a diagnostic.

The development implementation writes the diagnostic record as one structured JSON warning to server stderr, once per
worker at module load. Neither diagnostic metadata nor the warning is forwarded in HTML or HTTP response bodies.
Logging failure must not change tenant selection or HTTP behavior.

## Host authority and grammar

- Only the `Host` request header selects tenancy. Do not fall back to `nextUrl.hostname`, `Forwarded`, or
  `X-Forwarded-Host`; the ingress must preserve/replace Host correctly before deployment.
- Accept exactly `{slug}.pathable.com` in production and `{slug}.localhost` in development host mode.
- Parse a normal hostname plus optional `:port` (1 through 65535). Match ASCII host case insensitively; return a
  lowercase slug. Anything else is `forbidden()`. Extra labels, reserved `www`, unknown suffixes, and absent Host
  are unusable.
- Path/query values and caller-supplied tenant headers have no influence on identity. Static mode does not bind from Host.
- The trust guarantee is request-to-host association, not user authorization. No login or domain access is granted.

## Refusal and errors

The root layout is `<html>` / `<body>` only. `src/app/(app)/layout.tsx` (`AppLayout`) requires validated
session context and fails closed without creating sessions. `src/app/forbidden.tsx` renders `Access denied.`
Next.js `forbidden()` aims to return HTTP 403 on non-participating routes that still call it; if the
framework streams HTML with status 200 instead, the visible refusal is still `Access denied.` with no
redirect and no tenant Display Name.

**Supersedes (session setup)**: For Proxy-matched participating routes (`/`), invalid-host /
unknown-tenant / configuration failures MAY terminate in Proxy with the same visible outcomes
(`Access denied.` / static-mode guidance / generic 500). Layout-only `forbidden()` remains valid for
non-participating routes until they join the matcher. Dual-layer regression coverage is required.

| Condition                                         | Result        | Visible response                                                                       |
| ------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------- |
| Invalid/unusable Host, unknown/non-canonical slug | `forbidden()` | `Access denied.`                                                                       |
| Unreadable or invalid selected configuration      | throw         | HTTP 500; development static mode includes `TENANT_LOCAL_CONFIG_JSON` restart guidance |

Never return another tenant's name, a default tenant, or the slug as a Display Name.

`Cache-Control: private, no-store` is set for `/` in `next.config.ts`. Successful rendering must remain
request-dependent.

## Verification matrix

| Cases                                                                                                     | Layer                                                 | Requirements                   |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------ |
| Exact production/local host grammar, case/ports, reserved/extra labels, forged selectors                  | Vitest policy tests and real HTTP cases               | FR-001–FR-004, FR-008          |
| Missing/invalid mode, production static attempt, selected-source-only parsing                             | Vitest runtime tests; production HTTP bypass attempts | FR-007, FR-009, FR-014         |
| Empty source, duplicate slug, missing/invalid name, unknown config field, equal names with distinct slugs | Vitest source tests                                   | FR-003, FR-006, FR-010, FR-015 |
| Config action forbids bad slugs and throws on bad records                                                 | Vitest runtime tests                                  | FR-003, FR-013                 |
| Forwarded-host spoof and query values cannot select another tenant; Access denied / no redirect           | Running production HTTP tests                         | FR-002–FR-004, FR-007, FR-013  |
| Overlapping same-server tenant requests, refreshes, cache headers and matching names                      | Running HTTP/browser tests                            | FR-012, SC-001                 |

A typed failure/result helper is sufficient. Do not add a framework-wide error taxonomy, retry layer, telemetry service,
or source plugin registry for these cases.
