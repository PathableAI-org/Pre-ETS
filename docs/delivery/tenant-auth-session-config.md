# Delivery plan: tenant authentication and session configuration

**Status:** draft
**Planning date:** 2026-10-17
**Source revision:** implementation inspected at `956f6292fb961fffd6ec6b1c0b04abde8a61eec6`;
accepted requirements and related delivery records inspected in freshly fetched `origin/main`,
`8e4b5fee04865eae53936c532da58f85982d0f4d` (includes PR #222).
**Approval:** Pending review of this implementation/evidence proposal. Existing issue identities and prior
delivery approvals are preserved.
**Execution authorization:** The maintainer requested implementation using subagents on 2026-10-17.
Implementation and local execution are recorded below; repository PR review remains pending.
**Delivery reference:** [#215](https://github.com/PathableAI-org/Pre-ETS/issues/215), existing S2-A child of
[#153](https://github.com/PathableAI-org/Pre-ETS/issues/153).

## Goal and scope

Give frontend OIDC and session consumers a reusable, validated tenant configuration contract. The exported
`TenantConfig` value must be an `effect/Config` recipe, with its decoded TypeScript type derived using
`Config.Success<typeof TenantConfig>`. A file-backed `ConfigProvider` supplies the selected tenant JSON.
This is the maintainer's design direction for #215, not a new product requirement.

Keep this within #215. The increments below are implementation checkpoints, not proposals for additional
GitHub issues. They can be reviewed together or landed incrementally with their own meaningful evidence.

| Accepted requirement                                                   | Selected ACs                            | Qualification                                                                                                            |
| ---------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [PREETS-SESSION-002](../requirements/session/PREETS-SESSION-002.md)    | 1; enabling configuration for 2–3       | Required non-secret integration data and credential references; no authentication execution                              |
| [PREETS-SESSION-008](../requirements/session/PREETS-SESSION-008.md)    | 1                                       | Validated whole-minute timeout and effective omitted default                                                             |
| [PREETS-SESSION-011](../requirements/session/PREETS-SESSION-011.md)    | 1; policy-data support for 2            | Warning settings/defaults; no expiration enforcement, warning UI, or policy adoption by sessions                         |
| [PREETS-SECURITY-001](../requirements/security/PREETS-SECURITY-001.md) | 1–3, within this configuration boundary | Permitted fields, server-only lookup contract, full safe diagnostic response; external producer controls remain unproven |
| [PREETS-TENANT-004](../requirements/tenant/PREETS-TENANT-004.md)       | 1–5, preservation                       | Selected file, no substitution, startup versus directory/file failures                                                   |
| [PREETS-TENANT-006](../requirements/tenant/PREETS-TENANT-006.md)       | 1–6, preservation                       | Complete parsed file, host/static selection, production route availability and no-store; ingress remains separate        |

Requirement links above resolve locally; use the recorded `origin/main` revision for authority where this older
checkout differs. Source prose saying a refinement awaits approval must be read alongside its actual merge into
`main`. Issue descriptions and old specifications do not override that baseline.

## Current observations and related work

- [TenantConfigService](../../packages/frontend/src/lib/tenant.ts) currently owns alias selection, directory checks,
  file reads, JSON parsing, and schema decoding. `oidc` is optional; timeout is optional with bounds but no effective
  default; warning configuration and credential references are absent. Current main has the same tenant module.
- [Server configuration](../../packages/frontend/src/lib/config/tenant-config.ts) already exports a different
  `TenantConfig`: the host/static resolution configuration. Keep the distinction explicit through import aliases
  such as `TenantResolutionConfig`; the requested migration concerns tenant file content.
- [Runtime](../../packages/frontend/src/lib/runtime.ts) uses an environment `ConfigProvider` for process settings.
  [Diagnostics](../../packages/frontend/src/app/%5Ftest/tenant-config/route.ts) call the real tenant service and return
  its complete value with `Cache-Control: private, no-store`. Do not replace the process provider with one tenant's
  provider or construct a runtime per request.
- [Tenant test outlines](../../packages/frontend/tests/lib/tenant.test.ts) contain TODOs, not executable evidence.
  [Alias tests](../../packages/frontend/tests/unit/tenant-alias.test.ts) and
  [telemetry tests](../../packages/frontend/tests/unit/tenant-observability.test.ts) are executable source, but were
  not run during planning. The latter use controlled filesystem/logger/tracer dependencies, not an OTLP collector.
- [Tracked fixtures](../../fixtures/tenant-config) contain display names only.
  [The E2E fixture](../../e2e/tenant-directory.ts) has an obsolete nested `{ config, slug }` shape. Update fixture
  producers and independent expected values together when required OIDC is introduced; preserve owned cleanup.
- Live read-only inspection covered #215, #153, [#154](https://github.com/PathableAI-org/Pre-ETS/issues/154),
  [#216](https://github.com/PathableAI-org/Pre-ETS/issues/216), [#217](https://github.com/PathableAI-org/Pre-ETS/issues/217),
  [#218](https://github.com/PathableAI-org/Pre-ETS/issues/218), [#219](https://github.com/PathableAI-org/Pre-ETS/issues/219),
  [#220](https://github.com/PathableAI-org/Pre-ETS/issues/220), [#221](https://github.com/PathableAI-org/Pre-ETS/issues/221),
  and closed [#118](https://github.com/PathableAI-org/Pre-ETS/issues/118)/
  [#119](https://github.com/PathableAI-org/Pre-ETS/issues/119). Closure of the latter issues is historical context;
  current source still needs the promised strict configuration and server-only provider work. No exhaustive
  repository-wide issue search or native relationship audit was performed for this plan.
- The accepted subdivision is in the
  [source-pinned S2 supplement](https://github.com/PathableAI-org/Pre-ETS/blob/8e4b5fee04865eae53936c532da58f85982d0f4d/docs/delivery/session-management-s2-steps.md#s2-a--complete-tenant-authentication-and-session-configuration).
  #216 consumes initiation data, #217 consumes callback credentials, #218 consumes initial session policy, and
  #220 consumes current policy during renewal. #154 owns comprehensive application authentication integration.
  #215 has no start prerequisite. Parent containment does not block it on #153 or downstream consumers.

## Configuration design

### File-backed Config, strict JSON, and tenant isolation

Create a focused server-only tenant-file configuration module, separate from process-resolution settings.
Keep schema definitions as decoding machinery; expose `TenantConfig` as `Config.Config<...>`, not just a Schema
or a Context tag. Preserve the service's public alias/read operations and HTTP failure vocabulary.

Recommended implementation, verified for API feasibility against Effect 4.0.5:

1. Acquire `FileSystem`/`Path` through the existing Layer. For each selected alias create a provider bound to
   its immutable normalized `{configDir}/{alias}.json` path. Check directory usability separately as today.
2. Use `ConfigProvider.make` to read that file and return its whole contents as `ConfigProvider.makeValue`
   at the document root. Map I/O failures to `ConfigProvider.SourceError`, retaining the platform cause for
   classification. Missing files must fail, not become absent optional configuration.
3. Build `TenantConfig` from `Config.String()` and `Config.mapEffect`: decode the document once with
   `Schema.fromJsonString(TenantFileSchema)` and explicit `{ onExcessProperty: "error" }`, then map
   `SchemaError` to `Config.ConfigError`. This keeps strict JSON types and rejects unknown fields at root and
   nested boundaries. Validate cross-field policy as part of the same contract.
4. Evaluate `TenantConfig.parse(selectedProvider)` inside each service read. No global provider mutation,
   environment fallback, fallback tenant, or catch-all configuration default. A read uses one document snapshot;
   separate calls can see updated files. Do not introduce a process-lifetime cache that prevents later policy reads.
5. Translate source/decoding failures into the existing public 404/500 outcomes. Keep startup parsing of process
   settings separate from request-time tenant-file parsing. Preserve safe diagnostics and cause classification
   without putting raw file contents or secret-bearing validation messages in responses/logs/exported exceptions.

The installed checkout uses Effect 4.0.3; current main pins 4.0.5. Both declarations were inspected, and a temporary
probe used the published 4.0.5 package. `ConfigProvider.fromDir` represents one value per file, not a JSON document.
Direct `fromUnknown(JSON.parse(raw))` loses JSON leaf types: the probe accepted numeric strings, treated null as
absence, and accepted a numeric OIDC string field after conversion. The document decoder rejected those cases;
explicit excess-property parsing also rejected unknown root/nested fields. These were library experiments,
not application verification or tests to retain. Recheck declarations after moving implementation onto current main.

The [upstream configuration guide](https://effect.website/docs/v3/configuration/) explains the recipe/provider
separation but currently redirects to v3. Use the matching v4 package source/declarations for API details.

### File shape, effective policy, and secret lookup

Preserve flat JSON and existing `displayName`/OIDC field meanings. Require `oidc`, `issuer`, `clientId`, and
`clientAuth` (`public` or `confidential`); preserve optional string `connection`. Integration identifiers must be
usable nonempty strings. Keep vendor setup in data/fixtures; no discovery request, vendor switch, callback, or login
belongs to this reader. Retain local Keycloak fixture values; actual Microsoft compatibility is downstream evidence.

Proposed new field names are `warningLeadMinutes` and `oidc.clientSecretRef`; these are implementation choices for
review, not previously prescribed requirement names. A public client needs no secret. For the supported
secret-based confidential client flow require a nonempty lookup reference; reject embedded credentials and unknown
fields. Do not expand into additional authentication methods, key formats, or cloud-provider SDKs here.

Use one pure effective-policy derivation shared by validation and downstream session consumers:

| Supplied timeout  | Supplied warning                         | Effective timeout / warning lead        |
| ----------------- | ---------------------------------------- | --------------------------------------- |
| omitted           | omitted                                  | 30 / 5 minutes                          |
| 5                 | omitted                                  | 5 / 0, warning disabled                 |
| 6–30              | omitted                                  | supplied timeout / 5                    |
| any valid timeout | 0                                        | effective timeout / 0, warning disabled |
| any valid timeout | positive integer below effective timeout | effective timeout / supplied lead       |

Explicit timeout must be a JSON integer 5–30 inclusive. Explicit warning must be a JSON integer zero or positive
and strictly below effective timeout. Reject null, strings, booleans, fractions, negative values, and out-of-range
values instead of defaulting them. Resolve omitted timeout before validating the warning relationship.

Keep the parsed file value faithful to supplied permitted fields: the diagnostic contract requires equality with
the independently parsed file, not a response with injected defaults. Expose effective policy as a shared consumer
derivation alongside `TenantConfig`; do not introduce a redacted diagnostic DTO or hide permitted fields. An omitted
setting can therefore remain absent in diagnostic JSON while the consumer policy yields 30/5. Document both types
and ensure #218/#220 reuse the derivation rather than reimplement defaults. Validation and derivation must agree.

Define a vendor-agnostic server-only credential lookup capability, a typed lookup failure, and a deterministic
test implementation using synthetic secrets. Return a redacted secret value to the authentication consumer;
never put the resolved value/provider credentials in `TenantConfig` or diagnostic JSON. Tenant reads and
diagnostics must not resolve credentials or fail merely because a concrete provider is not configured. The
authentication composition will supply that provider when needed. A schema cannot detect every secret pasted into
an otherwise permitted text field; external producer controls and concrete provider integration remain separate.

## Delivery checkpoints within #215

### A1 — Consumers read required OIDC through a file-backed Config

**Outcome/coverage:** `TenantConfig` is a Config backed by the selected JSON file; supports SESSION-002 AC1
and configuration prerequisites for AC2–3, SECURITY-001 AC1–3, and preserves TENANT-004/006.

**Included:** Provider/decoder, required OIDC and non-secret credential-reference contract, server-only lookup
capability, safe failure mapping, fixture migration, bounded runtime wiring, and documentation of the new contract.
Preserve timeout validation while deferring new effective warning policy to A2.

**Observable increment:** The real public service returns the selected permitted file or its established public
failure; diagnostics expose that file safely. No temporary endpoint or response fields are needed.

**Durable completion evidence:** D1, D3–D5 below. Extend existing tenant service and telemetry tests instead of
building a parallel mock loader. Keep a focused real-filesystem check for provider/path integration.

**Ad hoc evidence:** M1/M3 and representative failure requests from M2 after this increment is runnable.
Final policy smoke checks wait for A2. Retain fixtures and service tests for all later checkpoints/consumers.

**Dependencies/exclusions:** No issue start blocker. No login, discovery, callback, session creation, new OTel
exporter, backend changes, or broad process-config refactor. A1 is mergeable with its named evidence; #215 remains
incomplete until A2/A3. Follow-on work must use required OIDC fixtures from this point onward.

### A2 — Consumers receive validated timeout and warning policy

**Outcome/coverage:** SESSION-008 AC1 and SESSION-011 AC1 configuration portion; policy-data prerequisite for
SESSION-011 AC2. Full authoritative expiration and warning behavior remain downstream.

**Included:** Warning field, omitted-only defaults, cross-field validation, shared effective-policy derivation,
typed handoff/examples for #218/#220, and updates to existing fixture expectations.

**Observable increment:** Real tenant-service reads reject invalid explicit policy; consumers derive the accepted
effective policy from valid parsed configuration. The diagnostic response preserves the supplied file shape.

**Durable completion evidence:** D2 plus relevant D1/D3 regression cases. Keep numeric domain checks compact:
enumerate all 26 valid integer timeouts and valid warning relationships, with named invalid examples. No new
property-testing dependency is necessary for this finite domain.

**Ad hoc evidence:** M1/M2 accept omitted settings and reject representative invalid policies through actual HTTP.
HTTP success with omitted fields alone does not prove effective defaults; D2 establishes those values.

**Dependencies/exclusions:** After A1. No Redis, deadline refresh, expiration enforcement, browser timers,
Continue action, or warning modal. Tests/fixtures carry forward to #218/#220 without claiming those issues complete.

### A3 — Verify running composition and hand off the contract

**Outcome/coverage:** Evidence for #215 at the real tenant consumer, preserving TENANT-004/006 and SECURITY-001;
clear limitations for the SESSION requirements.

**Included:** Execute retained tests and existing tenant HTTP regressions, run M1–M3 on an owned production-mode
Next process, record evidence, and update authentication/tenancy documentation to describe actual behavior. Correct
stale cache/session descriptions touched by this change; do not treat historical docs as runtime evidence.

**Observable increment:** Actual statuses, full permitted JSON, no-store, no tenant substitution, and correlated
exported tenant operation spans are reviewable at an identified revision.

**Evidence progression:** Carry forward D1–D5 and the existing HTTP suite. Do not commit curl transcripts or add a
permanent collector/browser harness merely to reproduce this smoke run. Add durable HTTP assertions only where an
existing suite lacks a distinct promised mapping; use the requirements BDD skills if changing its scenarios/helpers.

**Dependencies/exclusions:** After A1/A2. Local telemetry availability gates the telemetry observation, not library
construction. Record unavailable observations as outstanding, not passing. Production ingress protection remains a
shipping gate under PREETS-INFRA-001, not an implementation prerequisite for localhost evidence. No comprehensive
authentication/session/browser or provider-compatibility completion claim.

## Durable tests to implement and retain

| ID | Consumer and meaningful violation                                               | Test boundary and retained evidence                                                                                                                                                                                                                                                                                                                                                       | Limits                                                                                                         |
| -- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| D1 | OIDC consumer gets missing/wrong integration data or another tenant's data      | Real `TenantConfigService` with deterministic filesystem/path Layers: required OIDC, public/confidential reference cases, optional connection, wrong JSON types, explicit alias reads, interleaved and concurrent two-tenant reads with distinct values                                                                                                                                   | No provider discovery, redirect, callback or credentials exchange                                              |
| D2 | Session consumer silently defaults invalid policy or computes the wrong warning | Read valid/invalid JSON through the real service, then call the exported effective-policy derivation. Check all valid timeout/warning relationships, omitted timeout with explicit lead, omitted warning at 5 and above 5, explicit zero, boundaries, fractions, null, strings, booleans and warning equal/above timeout                                                                  | No stored deadlines, renewal races or browser behavior; avoid duplicating the matrix against private helpers   |
| D3 | Refactor changes public failure or falls back across tenants                    | Public service scenarios preserve directory failure 500, host missing file 404, static missing file 500, unreadable/invalid/schema-invalid file 404 in both modes. Assert public status/cause contract, not internal error subclass tags; keep existing actual-HTTP regression suite                                                                                                      | Controlled filesystem failures do not prove OS permissions or actual HTTP status                               |
| D4 | Provider wiring reads the wrong document or becomes permanently stale           | One focused integration scenario with an owned temporary directory and real Node filesystem: read A/B, update A between calls, observe updated A and unchanged B, then delete/clean up. Use the production Config/provider path                                                                                                                                                           | No claim of atomic external file replacement or simultaneous policy adoption by existing sessions              |
| D5 | Secret fields are accepted or secrets escape through responses/telemetry        | Strict root/nested field rejection; deterministic server-only lookup returns synthetic redacted value or explicit failure. Exercise real loader and diagnostic adapter with those capabilities; full permitted output contains references but no resolved values. Inspect emitted application logs/span failures for synthetic sentinels and ensure diagnostic reads do not invoke lookup | No concrete secrets backend or proof all allowed strings are safe; in-memory tracer does not prove OTLP export |

Reuse existing Vitest/Effect Layer conventions; do not expand test-runner setup. Architecture/typecheck review
establishes that the exported recipe is `Config` and its type is inferred; avoid source-text tests, mocks of the
service under test, exact private helper calls, or tests solely for coverage. Preserve existing semantic assertions
and assess stale TODOs against the named claims rather than blindly implementing them all.

## Ad hoc agent verification with curl and OTel

These are execution instructions for the implementation agent, not tests executed by this planning change.
Use synthetic local tenant names/data, an owned `mktemp -d` directory, and unused ports. Never modify deployed tenant
files. Build once after implementation; start/stop the owned process between host/static/startup cases. Remove only
the directory/process created for this run, restoring permissions before cleanup.

### M1 — Real production-mode requests consume the selected file

Create flat `alpha.json` and `beta.json` with distinct display names, public OIDC client IDs, and issuer values.
For example, alpha can contain this document with omitted policy settings:

```json
{
  "displayName": "Alpha verification",
  "oidc": {
    "clientAuth": "public",
    "clientId": "alpha-web",
    "issuer": "http://127.0.0.1:8080/realms/pre-ets"
  }
}
```

Use `warningLeadMinutes` only after the implementation settles the proposed field name. Keep independent expected
JSON from these files; compare diagnostic output as parsed JSON, not field order. No Keycloak/Redis startup is
needed to parse configuration. The issuer can be offline during this bounded check.

```sh
export tenant215_dir="$(mktemp -d /tmp/preets-215.XXXXXX)"
# Write alpha.json and beta.json in this directory, then start the owned app.
pnpm --filter @pathableai/pre-ets-frontend build
NODE_ENV=production PORT=3215 TENANT_RESOLUTION=host BASE_HOSTNAME=example.test \
  TENANT_CONFIG_DIR="$tenant215_dir" OTEL_SDK_DISABLED= \
  OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
  pnpm --filter @pathableai/pre-ets-frontend start
```

In a second terminal, with the same owned directory identified:

```sh
curl -sS -D /tmp/preets-215-alpha.headers -o /tmp/preets-215-alpha.json \
  -w '%{http_code}\n' -H 'Host: alpha.example.test' \
  -H 'traceparent: 00-21500000000000000000000000000001-2150000000000001-01' \
  http://127.0.0.1:3215/_test/tenant-config
curl -sS -i -H 'Host: beta.example.test' http://127.0.0.1:3215/_test/tenant-config
curl -sS -i -H 'Host: alpha.example.test' http://127.0.0.1:3215/_test/tenant-config
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: alpha.example.test' \
  http://127.0.0.1:3215/
```

Expect diagnostic 200, complete file equality and `Cache-Control: private, no-store`; alpha/beta/alpha must retain
their respective data. Request the two hosts concurrently as an additional smoke check. No application session
cookie should be issued. Root reachability supports configuration consumption, not successful login. Omitted policy
acceptance is observable here; effective 30/5 values are established by D2, not by telemetry or an omitted response field.

### M2 — Reject invalid settings and preserve failure outcomes

Change only the owned alpha fixture between requests; keep beta usable to reveal accidental fallback. Capture the
actual response status/headers/body for diagnostics and `/`, not only the error message. Restart in static mode
with `TENANT_STATIC_ALIAS=alpha`; vary Host to confirm it does not change selection.

| Condition                                                                               | Host mode     | Static mode   | Additional observation                                        |
| --------------------------------------------------------------------------------------- | ------------- | ------------- | ------------------------------------------------------------- |
| Missing/invalid OIDC, unknown credential field, invalid timeout or warning              | 404           | 404           | No beta/default configuration; diagnostic no-store            |
| Omitted policy, timeout 5 with omitted warning, explicit warning 0, valid positive lead | 200           | 200           | Complete permitted file; effective policy remains D2 evidence |
| Missing selected file, directory usable                                                 | 404           | 500           | No fallback; diagnostic no-store                              |
| Invalid JSON or unreadable selected file, directory usable                              | 404           | 404           | No fallback; diagnostic no-store                              |
| Parsed nonexistent directory, non-directory path, unreadable directory                  | 500           | 500           | No fallback; diagnostic no-store                              |
| Missing/invalid required process configuration such as TENANT_CONFIG_DIR                | Startup fails | Startup fails | No readiness/serving claim from an old process                |

Representative probes after changing alpha:

```sh
curl -sS -i -H 'Host: alpha.example.test' http://127.0.0.1:3215/_test/tenant-config
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: alpha.example.test' \
  http://127.0.0.1:3215/
curl -sS -i -H 'Host: beta.example.test' http://127.0.0.1:3215/_test/tenant-config
```

Exercise at least timeout `4`, `31`, `5.5`, `"5"`, `null`; warning `-1`, a fraction, `"1"`, `null`, equal to timeout,
and above timeout; plus omitted timeout with warning `29` (valid) and `30` (invalid). This sampled smoke matrix
checks framework composition; D2 retains the full domain regression evidence. OS permission checks are valid only
when the process user is actually denied access; root-bypassed chmod is not unreadable-file/directory evidence.

### M3 — Inspect exported OTel data for the exercised requests

Use the existing [observability setup](../observability.md), [Compose guide](../docker-compose.md), and
[Compose service](../../compose.yaml). Start only `otel-lgtm` through the observability profile; Compose parsing may
require the documented local bootstrap variables for unrelated services. Do not start another identity stack or
introduce a second exporter. `OTEL_SDK_DISABLED` must be unset or empty; the literal string `false` also disables
registration in the currently documented SDK behavior.

```sh
docker compose --profile observability up -d otel-lgtm --wait
```

In Grafana at `http://127.0.0.1:3300`, use Tempo through an authorized existing UI/MCP connection. Search
`pre-ets-frontend` in the recorded request window, then inspect the supplied trace ID where propagation retains it.
Allow batching time and use the time/route/request outcome as a fallback correlation method; do not infer success
from a healthy collector alone.

- Inspect a valid read and representative schema, selected-file, and directory failures. The HTTP span must show
  the actual request outcome; tenant operation spans must belong to the same trace and preserve useful
  `tenant.resolution` context. Existing names include `TenantConfigService.getConfigFromHost` and
  `TenantConfigService.getConfigFromAlias`; exact span counts/private helper names are not product contracts.
- Check exported attributes, events, status/error descriptions, and exception cause text. Use synthetic secret
  sentinels in a rejected unknown credential field and synthetic Authorization/Cookie headers on a separate probe.
  Their values must be absent from exported telemetry and application logs. Do not add header-to-attribute mapping
  or emit whole tenant documents. Inspect both successful and failing paths; schema error messages can contain input.
- Application warning logs may distinguish `schema`, `read`, `not-found`, or `directory` failures, but the current
  OTel setup exports traces only. Inspect process logs separately; do not claim Loki/log-export evidence or invent
  span attributes for log reasons. No new operational requirement or metric is introduced here.

Exported trace inspection establishes the real Next → Effect bridge/export path for the sampled requests.
In-memory tracer tests cannot replace that observation; exported spans cannot replace JSON/status comparisons,
prove effective policy values, prove the absence of all secrets, or establish login/session behavior.

## Coverage, handoff, and completion record

| Requirement / AC  | Disposition and evidence                                                            | Remaining conditions                                                                                |
| ----------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| SESSION-002 AC1   | A1, D1/D5, M1/M2: usable integration data and lookup references                     | Actual initiation/callback and provider sufficiency exercised in #216/#217; full integration #154   |
| SESSION-002 AC2–3 | A1 supports tenant-specific generic configuration; D1 isolation                     | Provider use, redirect/delegation and absence of local credential collection are downstream         |
| SESSION-008 AC1   | A2, D2, invalid-policy HTTP in M2                                                   | AC2–5 session initialization/renewal/enforcement remain #218/#220/#154                              |
| SESSION-011 AC1   | A2, D2: configuration-domain/default/disable portion                                | Expiration despite disabled warning, and actual presentation remain session/browser evidence        |
| SESSION-011 AC2   | A2 supplies effective warning policy data                                           | Live refresh adoption #220; all-tab presentation #156; no complete AC2 claim                        |
| SECURITY-001 AC1  | A1, D5, M2/M3: permitted fields and bounded disclosure checks                       | Cannot detect arbitrary secrets in permitted text; external content controls remain open            |
| SECURITY-001 AC2  | A1, D5/M1/M3: server-only lookup contract, references, no resolved values in config | Concrete provider integration and actual authentication usage downstream                            |
| SECURITY-001 AC3  | A1/A3, D5/M1: full parsed permitted file, no redaction DTO                          | Production ingress requires independent INFRA-001 evidence                                          |
| TENANT-004 AC1    | A1, D1/D4/M1: correspondence and interleaved/concurrent isolation                   | External deployment behavior outside sampled environment                                            |
| TENANT-004 AC2    | A1/A3, D3/M2: startup parsing separate from parsed directory failures               | Actual permission denial required for unreadability claim                                           |
| TENANT-004 AC3–5  | A1/A3, D3/D4/M2: static read, static missing 500, host missing and bad files 404    | Existing HTTP/browser regressions retained; source-only assertions are insufficient                 |
| TENANT-006 AC1–3  | A1/A3, M1/M2 and existing HTTP suite: file equality and host/static selection       | Effective defaults are separately observed through the policy consumer                              |
| TENANT-006 AC4    | A1/A3, D3/M2 and existing HTTP suite                                                | Curl status proves HTTP outcomes; browser missing-page presentation remains existing suite evidence |
| TENANT-006 AC5–6  | A3, M1/M2 on production-mode Next: route retained and no-store success/failure      | No infrastructure ingress verification claim                                                        |

Before implementation, base the working branch on current main and re-read its AGENTS, Effect pins, source and
issue state. Check for an already active implementation PR to avoid duplicating work. This plan does not update
requirements, publish/revise GitHub issues, approve a decomposition, or claim #215 is complete.

Implementation completion requires A1–A3, durable test executions, actual HTTP and trace observations, and a handoff
naming the Config/provider interface, file fields, effective-policy derivation, secret lookup contract, failure
outcomes, fixture migration and downstream limitations. Retain #215/S2-A identity; no new parent or blockers.

Run from the repository root: frontend `test:unit`, `pnpm typecheck`, `pnpm build`, `pnpm lint`,
`pnpm check:unused`, `pnpm format:check`, and the pre-commit `pnpm check:changes` when committing. Run the existing
tenant requirements HTTP/browser regressions using the current main command guide; discovery/dry-run is not runtime
evidence. Do not run a real-provider suite to claim behavior outside this configuration increment.

Record each executed check with revision, date, environment/process mode, command or request, independent expected
value, actual result, relevant trace ID/time window, artifact location, and limitations. Record permission-bypassed,
unavailable collector, and unexecuted provider checks explicitly. Agent smoke evidence can be recorded in the PR;
do not add a permanent test or tool merely to retain its transcript. Passing checks support the named conditions;
issue closure and plan completion do not establish full requirement verification.

**Planning evidence only:** read-only issue/source inspection, current-main fetch, locked dependency installation,
and temporary Effect 4.0.5 provider/decoder experiments. No frontend server, curl behavior matrix, OTel collector,
OIDC integration, or application tests were executed as behavioral evidence during this planning task.

## Implementation and local execution — 2026-10-17

The maintainer subsequently authorized implementation with subagents. Three implementation agents delivered the
Config/policy, tenant reader/tests, and secret contract/docs; an independent source review found no concrete defects.
The main agent integrated the work and executed the checks below before PR publication. GitHub issue content and
relationships were not changed. The plan remains a repository-review proposal; these results do not promote
requirement verification.

**Executed source:** `feat/tenant-auth-session-config`, based on
`8e4b5fee04865eae53936c532da58f85982d0f4d`, plus the implementation in this worktree. Tests ran before committing;
the fingerprint below identifies the exercised source independently of subsequent commit/PR publication.
The SHA256 fingerprint of the three implementation modules, two tracked tenant fixtures, and E2E fixture producer
is `dffb041a18fd85c1a4e115c1b579806a0bb0922a6050f0d4ef0e902593a40a93`.
Fingerprint input is the sorted relative filename, NUL, file bytes, NUL for each file. This identifies the exercised
implementation, not a Git commit or deployed revision. Runtime: macOS, Node `v26.2.0`, pnpm `12.14.0`, Effect `4.0.5`,
Next `16.4.2`; owned production-mode Next processes and synthetic tenant files on loopback.

### Delivered consumer contract

- `lib/tenant-config.ts` exports the strict document-backed `TenantConfig` Config and its inferred decoded type.
  The selected provider reads the JSON file; decoding preserves JSON types, permitted fields, and omission.
- `warningLeadMinutes` and `oidc.clientSecretRef` are the implemented field names. Required OIDC and
  confidential references, idle timeout, warning values, and cross-field constraints are validated on actual reads.
- The schema and `TenantConfigService.effectiveSessionPolicy(config)` use the same exported policy derivation.
  Omitted values yield effective 30/5, or 5/0 for a five-minute timeout, without changing diagnostic JSON.
- `TenantConfigService.resolveClientSecret(config)` is a separate lazy operation. Public clients return no
  credential without a lookup; confidential clients require `TenantSecrets` and return an optional redacted value
  or typed safe failure. Service construction, file reads, and diagnostics require no secrets provider.
- File reads preserve alias selection, fresh values between calls, and the established failure mappings. Errors
  crossing public/log/span boundaries retain safe categories rather than raw invalid input or provider causes.
  Tracked and E2E fixtures now use required OIDC and the flat file contract. No login/session integration was added.

### Durable tests and quality checks

| Check                                                                                      | Executed result and boundary                                                                                                                                                                |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend `test:unit`                                                                       | 189 tests passed in 9 files, including real-service policy/OIDC/error/isolation scenarios, owned real-filesystem updates/deletion, lazy credential handoff, and in-memory telemetry secrecy |
| `pnpm test:bdd:checks`                                                                     | Owned-versus-external fixture cleanup harness check passed                                                                                                                                  |
| `pnpm test:bdd:dry`                                                                        | 31 scenarios / 313 steps discovered; discovery only                                                                                                                                         |
| `OTEL_SDK_DISABLED=true pnpm exec cucumber-js --config cucumber.mjs` after the final build | 31 scenarios / 313 steps passed against actual production HTTP and Chromium missing-page presentation                                                                                       |
| `pnpm typecheck`, `pnpm build`, `pnpm lint`                                                | Passed for the repository/workspaces                                                                                                                                                        |
| `pnpm check:unused`, `pnpm check:changes`                                                  | Passed after wiring the shared policy and lazy credential capability into the real tenant service; no suppressions added                                                                    |
| `pnpm format:check`, `git diff --check`                                                    | Passed; dprint used a task-owned temporary cache                                                                                                                                            |

These retained tests exercise the consumers and boundaries named in D1–D5. Synthetic secret-provider results do not
establish a real provider integration. No new permanent collector, browser harness, or curl transcript was added.

### Ad hoc HTTP and exported OTel evidence

An agent-owned temporary Python driver invoked curl against independently started host/static production processes,
using owned alpha/beta files, independent expected JSON, distinct traceparents, and actual permission-denial checks.
The final build passed **109 observations**, including 200/404/500 response behavior, full file equality, no-store,
no session cookie, interleaved/concurrent tenant selection, omitted/valid policy, invalid OIDC/policy/credential
fields, invalid JSON, missing/unreadable files, non-directory/nonexistent/unreadable directories, recovery after
repairing files, and startup failure without required process configuration. Permission checks established actual
denied reads before asserting HTTP outcomes. Effective default values are evidenced by the durable policy tests;
successful HTTP with omitted fields alone does not establish them.

The repository's existing `otel-lgtm` image ran in a separate owned Compose project. Grafana's read-only Tempo
datasource API returned **14 sampled exported traces**: valid, rejected credential field, invalid JSON, missing
selected file, unreadable selected file, unreadable directory, and nonexistent directory in each mode. Inspection
confirmed actual HTTP statuses, same-trace tenant operations with connected parent span IDs, the expected resolution
mode, and success/error span outcomes. Synthetic rejected-input, Authorization, and Cookie values were absent from
the sampled exported attributes/events/exception data and process logs. Logs were inspected as process output;
no log-export/Loki claim is made.

Representative trace IDs: host success `6ad38e61000000000000000000000001`, host malformed input
`6ad38e6100000000000000000000002f`, host directory failure `6ad38e61000000000000000000000032`, static success
`6ad38e61000000000000000000000037`, static missing-file 500 `6ad38e61000000000000000000000066`.
Temporary raw responses, request times, app logs, trace JSON, and inspection results were saved under
`/tmp/preets-215-evidence-jlu4_42m`; these local artifacts are temporary and are not committed evidence. Commands and
check logs use `/tmp/preets-215-*.log`. Owned app processes and tenant directories were cleaned up after execution;
the owned Compose collector is removed after inspection. Existing Redis/Keycloak services are unaffected.

**Remaining scope:** #216/#217 provider initiation/callback and actual credential use; #218/#220 stored session
initialization/renewal/expiration; browser warning/recovery behavior; actual Microsoft/broker compatibility; concrete
secrets backend; external producer content controls; production ingress. Local HTTP/traces do not establish these
downstream conditions or universal absence of secrets. No provider login or session/browser warning behavior was
claimed by this implementation.
