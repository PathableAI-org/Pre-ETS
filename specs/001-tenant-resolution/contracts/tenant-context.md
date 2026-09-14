# Contract: Tenant Context and Configuration

**Applies to**: frontend-only tenant access and incoming application requests.
**Requirements**: FR-001–FR-015; SC-001–SC-006.
**Vocabulary**: [data-model.md](../data-model.md) is authoritative for record, origin, and failure values.

## Operations

These are planned module interfaces, not public HTTP endpoints. Names and semantic responsibilities are fixed here;
implementation may choose concise TypeScript representations without adding new behavior.

| Operation                | Input                                                        | Output / failure                                                             | Owner                   |
| ------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------- |
| `bindHost`               | Raw authoritative Host and environment host pattern          | Canonical slug or `invalid-host`; no source read                             | `src/tenant/host.ts`    |
| `readTenantRecord`       | Canonical slug                                               | Promise of matching readonly record, no record, or source failure            | `src/tenant/source.ts`  |
| `resolveTenant`          | Validated mode/settings, Host when relevant, injected source | Validated current context or named failure; invokes binder once in host mode | `src/tenant/resolve.ts` |
| `readBoundTenant`        | Established slug/origin and selected source/settings         | Matching current context or named failure; never invokes binder              | `src/tenant/resolve.ts` |
| `getCurrentTenant`       | Current server-render request                                | Promise of current context; one shared React-cached accessor                 | `src/tenant/current.ts` |
| `getCurrentTenantConfig` | Current server-render request                                | Promise of `TenantConfig`; delegates to `getCurrentTenant`                   | `src/tenant/current.ts` |

The page uses `getCurrentTenantConfig`. Consumers needing identity use `getCurrentTenant`. No browser-side tenant
selection, public configuration endpoint, or persistence write operation is exposed.

## Server settings

Place local settings in `packages/frontend/.env.local` or pass them to the frontend process. Do not use `NEXT_PUBLIC_`
variables or `next.config`'s public environment export. `.env.example` contains synthetic examples only.

| Variable                     | Format/default                                  | Effect                                                                                                                                                                                 |
| ---------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TENANT_RESOLUTION`          | `host` or `static`; absent means `host`         | Static works only in development. In production, `static` is ignored and host association remains required. Other values retain host mode and emit the safe `invalid-mode` diagnostic. |
| `TENANT_CONFIG_RECORDS_JSON` | JSON array of tenant records; absent means `[]` | Known records for host mode. No automatic sample tenant.                                                                                                                               |
| `TENANT_LOCAL_CONFIG_JSON`   | JSON tenant record; no default                  | Required only in effective static mode; never a fallback for a host-mode miss.                                                                                                         |

An unsupported mode is not a failure response: emit `invalid-mode` with guidance to use `host` or development-only `static`, without logging the raw value. Continue host association using the runtime suffix: a known host can succeed, an invalid/unknown host returns 403, and selected-source errors retain their 500/503 mapping. Never consult the local static record for an unsupported mode.

Only the selected source is parsed. For example, malformed unused local data must not affect a production host-mode
request. Parse/validate lazily on first request use, not during build/type generation. Do not mutate parsed records or
environment settings during a running process; restarting is the documented update procedure. Proxy and rendering
must receive the same process configuration. A production-build demonstration can explicitly supply synthetic known
records, but this does not constitute real-tenant onboarding or durable production storage.

### Mode diagnostic channel

Add a pure `selectTenantMode(rawMode, runtime)` operation in `src/tenant/mode.ts`. It returns `{ mode, diagnostic }`, where mode is `host` or `static` and diagnostic is absent for accepted/omitted values or the readonly record `{ category: "invalid-mode", message: "Use host or development-only static for TENANT_RESOLUTION; host association remains enabled." }` for unsupported values. It performs no logging and returns no raw input. This diagnostic is separate from the closed resolution-failure vocabulary.

The server-only settings adapter calls this operation during lazy process-settings initialization and writes the diagnostic record as one structured JSON warning to server stderr, once per settings initialization per worker. It passes only the selected mode into `resolveTenant`; that resolver continues to return context or failure. Neither diagnostic metadata nor the warning is forwarded in tenant headers, HTML, or HTTP response bodies.

The invalid-mode Cucumber contract step calls the pure selector with its scenario settings, saves the returned diagnostic in its typed World, and passes the selected mode into the resolver for both host cases. Its diagnostic Then asserts the exact category and fixed guidance from that captured result. Add an adapter test with a captured warning sink to prove the settings adapter emits the same safe record and omits raw values. The production sink is stderr; tests inject only the sink, not a public runtime setting or route. Logging failure must not change tenant selection or HTTP behavior.

## Host authority and grammar

- Only the `Host` request header selects tenancy. Do not fall back to `nextUrl.hostname`, `Forwarded`, or
  `X-Forwarded-Host`; the ingress must preserve/replace Host correctly before deployment.
- Accept exactly `{slug}.pathable.com` in production and `{slug}.localhost` in development host mode.
- Match ASCII host case insensitively; return a lowercase slug. An optional numeric port from 1 through 65535
  does not affect identity. Reject whitespace, comma-separated/duplicate authorities, schemes, paths, user-info,
  trailing dot, IP literals, invalid labels, and extra labels. Transport-invalid messages may be refused by the
  HTTP server before the application runs; the 403 contract applies to values reaching this boundary.
- Reject apex hosts, bare `localhost` in host mode, `www`, unknown suffixes, deceptive suffixes, and absent Host.
- Path/query values and all caller tenant headers have no influence on identity. Static mode does not bind from Host.
- The trust guarantee is request-to-host association, not user authorization. No login or domain access is granted.

## Internal request handoff

Proxy removes all inbound headers in the `x-preets-tenant-*` namespace. After successful resolution it sets these
upstream request headers with `NextResponse.next({ request: { headers } })`:

| Header                   | Value                               |
| ------------------------ | ----------------------------------- |
| `x-preets-tenant-slug`   | Canonical established slug          |
| `x-preets-tenant-origin` | `host-associated` or `local-static` |

Do not expose these as response headers. The current accessor requires both values, validates the closed vocabulary,
and checks origin against effective runtime mode. Missing/malformed/mismatched handoff fails with `invalid-context`;
it never trusts an alternate caller value or attempts new host binding. All requests that could reach tenant consumers,
including HTML, RSC, and prefetch, must traverse Proxy; no client-controlled skip headers or extension-based bypasses.
Keep framework bypass protections current and verify spoofed handoff values cannot override resolution.

The accessor reads matching configuration from the same immutable source. A second static lookup across Proxy and
rendering is permitted; a second host determination is not. React memoization is request-local to Server Components.
No persistent current-context cache, shared mutable tenant, or display-name-derived identity is allowed.

## Failure-to-response mapping

| Internal reason                                         | HTTP result at Proxy | Visible response                                   |
| ------------------------------------------------------- | -------------------- | -------------------------------------------------- |
| `invalid-host`, `unknown-tenant`                        | 403                  | `Access denied.`                                   |
| `invalid-settings`, `invalid-config`, `invalid-context` | 500                  | Production: `Tenant configuration is unavailable.` |
| `config-unavailable`                                    | 503                  | `Tenant configuration is temporarily unavailable.` |

In development static mode, invalid/missing local data uses an understandable message directing the developer to
supply a valid `TENANT_LOCAL_CONFIG_JSON` record with slug and Display Name, then restart. Never return the invalid
payload or another tenant's name. Diagnostic logging records the closed reason, not raw host/header/configuration data.

Prevalidation establishes failures before rendering. An unexpected accessor invariant failure still rejects rendering;
never convert it to success or rebind. Unit and production-build tests must prove normal invalid/unknown cases fail at
Proxy rather than relying on a post-stream exception to set the status.

Use UTF-8 plain text for refusal responses. The response adapter must explicitly set the outgoing response header
`Cache-Control: private, no-store` on both successful tenant-dependent HTML/RSC responses (including prefetch)
and every refusal/error response. Do not rely on framework defaults or set this only on forwarded request headers.
Successful rendering must remain request-dependent. Verify the final
production server response because framework behavior can affect headers. Future CDN deployment may not override this
policy without proving tenant-keyed isolation.

## Verification matrix

| Cases                                                                                                             | Layer                                                           | Requirements                   |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------ |
| Exact production/local host grammar, case/ports, reserved/extra labels, forged selectors                          | Vitest policy tests and real HTTP cases                         | FR-001–FR-004, FR-008          |
| Missing/invalid mode, production static attempt, selected-source-only parsing                                     | Vitest settings/resolver tests; production HTTP bypass attempts | FR-007, FR-009, FR-014         |
| Empty source, duplicate slug, missing/invalid name, unknown config field, equal names with distinct slugs         | Vitest source tests                                             | FR-003, FR-006, FR-010, FR-015 |
| Injected missing/mismatched/unavailable record                                                                    | Vitest source/resolver tests and response-adapter assertions    | FR-003, FR-013                 |
| Binder called once; repeated `readBoundTenant` never binds; source replaceable without consumer selection changes | Vitest orchestration tests                                      | FR-004–FR-006, FR-012          |
| Overwritten forged handoff, forwarded-host spoof, no fallback, actual 403/no redirect                             | Running production HTTP tests                                   | FR-002–FR-004, FR-007, FR-013  |
| Overlapping same-server tenant requests, refreshes, cache headers and matching names                              | Running HTTP/browser tests                                      | FR-012, SC-001                 |

A typed failure/result helper is sufficient. Do not add a framework-wide error taxonomy, retry layer, telemetry service,
or source plugin registry for these cases.
