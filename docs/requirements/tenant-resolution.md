# Tenant resolution

## PREETS-TENANT-001

**Title:** Resolve the request tenant from its host
**Lifecycle:** superseded
**Verification:** unverified

### Replacement decision

Maintainer approval on 2026-10-03 splits this obligation and narrows request scope to tenant-dependent frontend
requests, including all authenticated requests. The original content below is retained as history; its “all
requests” scope is no longer the active promise.

Replaced by [PREETS-TENANT-003](#preets-tenant-003), [PREETS-TENANT-004](#preets-tenant-004), and
[PREETS-TENANT-005](#preets-tenant-005).

### Statement

All requests to the frontend are tenant-scoped, including requests under `/_test/*`. When host-based resolution
is enabled, the requester must receive behavior using the configured tenant identified by the request's Host header.
If the host cannot be resolved to a tenant alias, or the alias does not identify a configured tenant, the application must respond with HTTP 404 Not Found and must not substitute another tenant or its
configuration. The browser must present this as an ordinary missing page.

Host-based resolution is selected by `TENANT_RESOLUTION=host`. The application must require `BASE_HOSTNAME`
only in this mode. Host-based resolution must expect the literal
string pattern `${alias}.${BASE_HOSTNAME}` and extract the alias through direct string parsing. It does not require
port validation or additional hostname validation beyond matching this pattern and checking the alias against
configured tenants.

The application must always require `TENANT_CONFIG_DIR`, regardless of resolution mode. It must identify a
directory containing tenant configuration JSON files named `{alias}.json`. Each alias selects its corresponding
file in that directory.

When `TENANT_RESOLUTION=static`, the tenant must resolve to the configured static tenant regardless of the request
host when its configuration file exists and is usable. Host-based rejection and its HTTP 404 behavior do not apply
in this mode. If the selected static tenant configuration file does not exist, the request must receive HTTP 500
Internal Server Error without substituting another tenant configuration.

### Rationale and sources

Host-based selection lets a requester access the intended organization's application context. Selecting a default
or different tenant on failure would undermine that expectation. Both resolution failure categories have the same
required HTTP status.

- Source: Functional Requirement.
- Existing contract: [Tenant-resolution specification](../../specs/001-tenant-resolution/spec.md), FR-001 through
  FR-004 and FR-008 through FR-010, requires trusted host association, HTTP 403 on failure, and explicit local
  development modes. Its HTTP 403 policy is superseded by the decision below; the historical specification has
  not yet been synchronized.
- Decision: Maintainer approval on 2026-10-02 confirms HTTP 404 supersedes
  HTTP 403, requires invalid-tenant navigation to appear like an ordinary missing page, and exempts static
  resolution: in static mode the tenant always resolves. This records approval of these behavioral obligations;
  it does not establish implementation or verification. Further maintainer approval on
  2026-10-02 confirms that all frontend requests are tenant-scoped and requires `BASE_HOSTNAME` with direct
  `${alias}.${BASE_HOSTNAME}` string parsing, without port or additional hostname validation. This replaces the
  historical specification's fixed-domain and additional host-validation rules for this requirement. Maintainer
  approval on 2026-10-03 refines `BASE_HOSTNAME` to be required only when `TENANT_RESOLUTION=host` and requires
  `TENANT_CONFIG_DIR` in every mode, pointing to a directory of `{alias}.json` tenant configuration files. Further
  maintainer approval on 2026-10-03 requires HTTP 500 when `TENANT_RESOLUTION=static` and the selected configuration
  file does not exist; this qualifies the successful static-resolution promise.

### Acceptance criteria

Criteria 1 through 6 apply when host-based resolution is enabled.

1. With at least two configured tenants and valid tenant hosts, a request to each host selects its corresponding
   tenant and applies that tenant's configuration.
2. Requests to distinct configured tenant hosts with distinguishable configuration produce their respective
   tenant-specific behavior. Requests to one host must not exhibit configuration belonging to the other tenant,
   including when requests to the two hosts are interleaved.
3. A tenant-scoped request whose host cannot yield a tenant alias receives HTTP 404 Not Found, without successful
   tenant context or fallback configuration.
4. A tenant-scoped request whose host yields an alias absent from tenant configuration receives HTTP 404 Not Found,
   without successful tenant context or fallback configuration.
5. Every successful resolution identifies a configured tenant matching the request host; an unknown or unresolvable
   host never resolves to a different configured tenant.
6. Navigating to an invalid tenant presents the application's ordinary not-found page with HTTP 404, as though the
   requested page did not exist, rather than presenting an access-denied or tenant-resolution diagnostic page.
7. When `TENANT_RESOLUTION=static` and the selected configuration file exists and is usable, requests resolve to
   the configured static tenant and apply its configuration,
   including requests with hosts that would be unresolvable or identify an unknown alias in host-based mode. These
   hosts do not trigger tenant-resolution HTTP 404 responses.
8. When `TENANT_RESOLUTION=host`, the application requires `BASE_HOSTNAME` configuration. With a configured
   alias, a Host value matching `${alias}.${BASE_HOSTNAME}` resolves to that alias through direct string parsing.
   A Host value that does not match the configured pattern receives HTTP 404. No separate port validation or
   additional hostname-validation policy is required. These host matching and rejection rules do not apply in
   static mode, which does not require `BASE_HOSTNAME`.
9. In every resolution mode, `TENANT_CONFIG_DIR` is required and identifies a directory containing tenant
   configuration JSON files named `{alias}.json`. A selected alias uses the parsed configuration from its
   corresponding file in that directory.
10. When `TENANT_RESOLUTION=static` and the selected `{alias}.json` configuration file does not exist in
    `TENANT_CONFIG_DIR`, the request receives HTTP 500 Internal Server Error, without fallback configuration.

### Open questions

- What behavior applies to missing or invalid directory configuration, unreadable files, invalid JSON, or missing
  configuration files in host mode? Missing selected files in static mode have the approved HTTP 500 outcome;
  the remaining configuration-failure cases are undecided.

### Verification plan

Planned acceptance evidence must exercise the running application's external HTTP boundary with at least two
synthetic tenants whose configuration is distinguishable, with host-based resolution enabled. Establish the selected
tenant for each host, repeat with interleaved requests, and observe the actual HTTP 404 status for both failure categories. A rendered not-found
message alone does not establish the status code, and a single tenant example cannot detect an always-default
implementation. Compare invalid-tenant navigation with ordinary missing-page navigation to establish criterion 6.

Separately enable static resolution and exercise known, unknown, and unresolvable hosts against the running
application. Establish that each selects the same configured static tenant and applies its configuration without
host-based rejection, covering criterion 7. This verifies successful resolution rather than merely absence of 404.
With `TENANT_RESOLUTION=static` and the selected file absent, observe an actual HTTP 500 response with no fallback
configuration, covering criterion 10. A rendered error message alone does not establish the HTTP status.

The diagnostic endpoint defined by [PREETS-TENANT-002](#preets-tenant-002) must return the parsed configuration for the effective tenant
selected by the application's normal request resolution for the exercised host. A separate lookup or test-owned
fixture echo would not establish that claim. Identity evidence supports criteria 1 and 5; it does not by itself prove configuration application or
cross-tenant behavior in criterion 2. Verify those outcomes at the configuration-consuming application boundary.

Planned configuration-boundary evidence must establish that `BASE_HOSTNAME` is required when
`TENANT_RESOLUTION=host` and that static resolution works without it. Establish that `TENANT_CONFIG_DIR` is required
in both modes and identifies a directory, then use distinct `{alias}.json` files there to verify alias-to-file
selection for criterion 9. Exercise host-based
resolution with different configured base hostnames to establish criterion 8: matching strings select the configured
alias, and strings outside the configured pattern receive HTTP 404. Port validation is not a separate acceptance
claim.

Service or property tests may support direct string parsing, host-selection, and no-fallback invariants. They supplement acceptance evidence rather than replacing HTTP-boundary verification. This plan does not
require a particular parsing library, service API, telemetry backend, or test library.

### Verification evidence

No reviewed, executed evidence has been recorded for these criteria. The verification plan describes future
evidence only; existing implementation and test artifacts have not been assessed for satisfaction of this requirement.

## PREETS-TENANT-002

**Title:** Expose parsed tenant configuration for verification with production ingress protection
**Lifecycle:** superseded
**Verification:** unverified

### Replacement decision

Maintainer approval on 2026-10-03 separates application diagnostics from production ingress protection.
The original content below is retained as history.

Replaced by [PREETS-TENANT-006](#preets-tenant-006) and
[PREETS-INFRA-001](infrastructure.md#preets-infra-001).

### Statement

The test runner must be able to obtain the parsed tenant configuration as JSON for a frontend request through
`GET /_test/tenant-config`. The response must contain the configuration selected by the application's normal request
tenant context, including static resolution when enabled, and must be available from the application perspective
in every environment. Verification must compare the response with the parsed contents of the expected tenant
configuration file on disk.

Production infrastructure ingress rules must block all traffic to `/_test/*` before it reaches the application,
regardless of route or HTTP method.
Application-level environment gating must not disable the diagnostic endpoint in production.

### Rationale and sources

Direct observation of the effective request tenant configuration supports tenant-resolution verification without
requiring telemetry solely to inspect that configuration. Ingress owns production access restrictions while the application
provides consistent diagnostic behavior across environments.

- Source: Functional Requirement.
- Decision: Maintainer approval on 2026-10-02 requires a route under
  `/_test/*`, application availability in all environments, and production blocking through infrastructure ingress
  rules. Further maintainer approval on 2026-10-02 specifies `GET /_test/tenant-config` and blocking all traffic
  to `/_test/*`. Further maintainer approval on 2026-10-02 requires the parsed tenant configuration as JSON,
  verified against the expected configuration file on disk. This approves the obligation, not its implementation
  or verification.

### Acceptance criteria

1. A test runner calling `GET /_test/tenant-config` receives the parsed configuration selected for that request by
   normal application resolution as a JSON response, rather than a separate lookup or fixture echo. The parsed
   response equals the parsed contents of the expected `{alias}.json` file in `TENANT_CONFIG_DIR`.
2. With host-based resolution enabled, requests using two configured tenant hosts return their respective parsed
   configurations, each matching its expected file on disk.
   Unresolvable hosts and unknown aliases receive HTTP 404 under PREETS-TENANT-001.
3. With `TENANT_RESOLUTION=static` and a usable selected file, the endpoint returns the parsed static tenant
   configuration regardless of request host, matching the expected static configuration file on disk. If that
   file does not exist, the endpoint receives HTTP 500 under PREETS-TENANT-001.
4. When accessed directly at the application boundary, the endpoint remains available under production application
   configuration and follows the same tenant-resolution contract as in other environments.
5. All traffic to `/_test/*` through every production ingress is blocked before reaching the application, regardless
   of route or HTTP method, including
   requests using a valid configured tenant host. The ingress response must not expose diagnostic tenant data.

### Open questions

None.

### Related requirements

- [PREETS-TENANT-001](#preets-tenant-001) defines resolution for every frontend request, including diagnostic requests.

### Verification plan

Planned application-boundary evidence must call `GET /_test/tenant-config` against a running frontend for two
configured hosts, both host-resolution failure categories, and static resolution with both present and missing
configuration files. Verify HTTP 500 for the missing static file. For successful requests, independently read and
parse the expected tenant configuration file on disk and compare its complete parsed value with the parsed JSON
response. Compare data values rather than JSON whitespace or object-key order. Use distinguishable files for the
two tenants so selecting the wrong configuration fails the comparison. The expected value must come from the
expected file, not from the response or a call to the application's tenant-selection implementation.

Repeat direct application access under production
application configuration to demonstrate that application environment settings do not disable the route.

Separately exercise every production ingress with requests under `/_test/*`, including `GET /_test/tenant-config`
on a valid tenant host and other routes and HTTP methods under that prefix. Observe blocking and evidence that the requests do not reach the frontend. Application
responses or application-only tests cannot establish ingress enforcement; ingress configuration review alone
cannot establish executed blocking behavior.

Diagnostic configuration evidence supports tenant selection and retrieval of the expected parsed configuration. Configuration-consuming behavior remains separately
required by PREETS-TENANT-001; a diagnostic configuration response alone does not establish user-facing application behavior.

### Verification evidence

No reviewed, executed evidence has been recorded. Application availability and production ingress enforcement
remain unverified; planned verification does not establish either behavior.

## PREETS-TENANT-003

**Title:** Select the tenant for tenant-dependent frontend requests
**Classification:** Functional Requirement
**Owner / responsible boundary:** Frontend request tenant context
**Lifecycle:** accepted
**Verification:** unverified

### Statement

Every tenant-dependent frontend request must select exactly one configured tenant before tenant-dependent behavior
executes. This includes all authenticated requests, authentication flows that consume tenant configuration, and
`GET /_test/tenant-config`. Assets, framework requests, and health checks require tenant resolution only when their
behavior depends on tenant context.

In host mode, selection follows the request Host. In static mode, selection always uses the configured static alias
regardless of Host. Successful selection must not substitute another tenant.

### Rationale and sources

Tenant-dependent consumers must receive the intended organization context. Host or static selection must not
accidentally select another tenant.

- Source: Functional Requirement.
- Decision: Maintainer approval on 2026-10-03 authorizes this replacement, preserving the approved behavior from
  2026-10-02 and 2026-10-03 except for the explicitly revised request scope and static selector clarification.

### Acceptance criteria

1. When host-based resolution is enabled, requests for two configured tenant hosts select their respective tenants,
   including interleaved requests.
2. Every authenticated request, tenant-configuration-consuming authentication flow, and diagnostic request uses the
   selected tenant context before executing tenant-dependent behavior.
3. In static mode with usable configuration, requests with known, unknown, or unresolvable hosts select the same
   configured static alias; `BASE_HOSTNAME` is not required in this mode.
4. Successful tenant-dependent behavior uses the selected tenant's configuration and never exhibits another tenant's
   configuration. Tenant-independent assets, framework requests, and health checks do not require tenant resolution.

### Design constraints

- `TENANT_RESOLUTION=host` selects host mode; `BASE_HOSTNAME` is required only in this mode.
- Host selection directly parses the literal `${alias}.${BASE_HOSTNAME}` pattern. No separate port or additional
  hostname validation is required beyond this pattern and configured-tenant selection.
- `TENANT_RESOLUTION=static` selects static mode. `TENANT_STATIC_ALIAS` is required in static mode and names the
  selected tenant; the host does not change that alias.

### Open questions

None.

### Related requirements

- Replaces [PREETS-TENANT-001](#preets-tenant-001).
- Depends on [PREETS-TENANT-004](#preets-tenant-004) and [PREETS-TENANT-005](#preets-tenant-005).

### Verification plan

Exercise the running frontend with two synthetic tenants having distinguishable configuration, including interleaved
requests. Observe selected configuration through PREETS-TENANT-006 and its application through a configuration-consuming
frontend interaction. Exercise representative authenticated requests, authentication flows consuming tenant configuration,
and diagnostics to establish scope. Exercise a tenant-independent asset or health request without tenant context.

At the configuration boundary, establish that host mode requires `BASE_HOSTNAME` and static mode requires
`TENANT_STATIC_ALIAS`. Repeat static-mode requests for different hosts without `BASE_HOSTNAME`, comparing against
the configured static alias.
Diagnostic responses prove selected configuration, not user-facing application behavior; observe that behavior separately.

### Delivery references

- [Tenant delivery parent #115](https://github.com/PathableAI-org/Pre-ETS/issues/115): coordinates the selected criteria.
- [S1 — Load and expose the selected non-secret tenant configuration #116](https://github.com/PathableAI-org/Pre-ETS/issues/116): AC 1, 3.
- [S2 — Establish tenant context before remaining tenant-dependent frontend behavior #117](https://github.com/PathableAI-org/Pre-ETS/issues/117): AC 2, 4.

Published work is tracked in the [tenant delivery plan](../delivery/tenant-resolution.md). These links do not
change requirement lifecycle or establish executed verification evidence.

### Verification evidence

No reviewed, executed evidence has been recorded. This documentation change does not establish runtime behavior.

## PREETS-TENANT-004

**Title:** Retrieve the selected tenant configuration
**Classification:** Functional Requirement
**Owner / responsible boundary:** Frontend tenant configuration retrieval
**Lifecycle:** accepted
**Verification:** unverified

### Statement

A frontend consumer must receive the parsed configuration corresponding to its selected tenant. When static mode's
selected configuration file does not exist, the request must receive HTTP 500 Internal Server Error without fallback
configuration.

Missing TENANT_CONFIG_DIR configuration, a nonexistent directory, a path that is not a directory, or an unreadable
directory produces HTTP 500 in either mode. When the directory is usable, a missing host-mode tenant file, or an
unreadable or malformed selected tenant file in either mode, is treated like a tenant not found: ordinary HTTP 404
without fallback. A missing static-mode selected file retains HTTP 500. Malformed includes invalid JSON or configuration
that fails the permitted schema. No separate configured-tenant registry is required to distinguish file failures.

### Rationale and sources

Consumers need the configuration corresponding to the selected tenant. Missing static configuration is a system
failure, not an unknown host, and must not silently substitute another file.

- Source: Functional Requirement.
- Decision: Maintainer approval on 2026-10-03 authorizes this replacement, preserving the approved behavior from
  2026-10-02 and 2026-10-03 except for the explicitly revised request scope and static selector clarification.
- Decision: Maintainer direction on 2026-10-03 resolves B1 and replaces the earlier known-configuration-failure
  distinction with the directory/file outcomes below. The maintainer explicitly preserves static missing-file 500,
  approves unreadable/malformed file 404 in both modes, and directory configuration/access failures 500 in both modes.

### Acceptance criteria

1. For two selected aliases with distinct configuration files, consumers receive their corresponding parsed values,
   including across interleaved requests, without substitution of another tenant's configuration.
2. `TENANT_CONFIG_DIR` is required in every resolution mode and identifies a directory of `{alias}.json` tenant files.
   Missing configuration, a nonexistent directory, a non-directory path, or an unreadable directory produces actual
   HTTP 500 without fallback, in both modes.
3. In static mode, an existing usable file for `TENANT_STATIC_ALIAS` supplies its parsed configuration.
4. In static mode, a missing selected `{alias}.json` file produces an actual HTTP 500 response without fallback.
5. With a usable directory, a missing host-mode file or an unreadable/malformed selected file in either mode
   produces ordinary HTTP 404 with no fallback, as for a tenant not found. A missing static-mode file follows AC4.
   Invalid JSON and schema-invalid configuration are malformed files; directory failures follow AC2 instead.

### Design constraints

- `TENANT_CONFIG_DIR` is always required and points to the tenant configuration directory.
- The selected alias maps to `{TENANT_CONFIG_DIR}/{alias}.json`; consumers receive the parsed JSON configuration.
- Static selection uses the existing `TENANT_STATIC_ALIAS` interface.

### Open questions

None for the directory/file response policies resolved here.

### Implementation dependencies

Implement the approved directory/file distinction at the responsible boundary. No separate configured-tenant
membership source is needed for these outcomes. Preserve the non-secret configuration dependency below.

### Related requirements

- Replaces [PREETS-TENANT-001](#preets-tenant-001).
- Used by [PREETS-TENANT-003](#preets-tenant-003) and [PREETS-TENANT-006](#preets-tenant-006).
- Required content constraint: [PREETS-SECURITY-001](security.md#preets-security-001).

### Verification plan

Use distinguishable synthetic `{alias}.json` files in a real configured directory and compare running-application
responses with independently parsed expected files. Observe a configuration-consuming frontend interaction as well.
Establish the directory prerequisite in both modes at the configuration boundary. Exercise static mode with a usable
selected file and with that file absent; observe HTTP 500 for the latter. An error message alone does not prove status.
Exercise missing directory settings, nonexistent directories, non-directory paths, and unreadable directories in
both modes and observe HTTP 500. With a usable directory, exercise missing host files and unreadable, invalid-JSON,
and schema-invalid files in both modes; observe ordinary HTTP 404 without fallback. Keep static missing-file 500
separate. Directory access failure must not be mistaken for a tenant-file not-found outcome.

### Delivery references

- [Tenant delivery parent #115](https://github.com/PathableAI-org/Pre-ETS/issues/115): coordinates the selected criteria.
- [S1 — Load and expose the selected non-secret tenant configuration #116](https://github.com/PathableAI-org/Pre-ETS/issues/116): AC 1–3.
- [S3 — Complete approved tenant HTTP and browser failure outcomes #118](https://github.com/PathableAI-org/Pre-ETS/issues/118): AC 2, 4, 5.

Published work is tracked in the [tenant delivery plan](../delivery/tenant-resolution.md). These links do not
change requirement lifecycle or establish executed verification evidence.

### Verification evidence

No reviewed, executed evidence has been recorded. This documentation change does not establish runtime behavior.

## PREETS-TENANT-005

**Title:** Treat invalid host-based tenants as not found
**Classification:** Functional Requirement
**Owner / responsible boundary:** Frontend HTTP and browser boundaries
**Lifecycle:** accepted
**Verification:** unverified

### Statement

In host mode, a tenant-dependent request whose host cannot yield an alias or whose alias is unknown must receive
HTTP 404 Not Found without fallback tenant context or configuration. Invalid-tenant navigation must appear like
ordinary navigation to a page that does not exist. These host-based rejection rules do not apply in static mode.

### Rationale and sources

Invalid tenant navigation must look like an ordinary missing page and must not expose another tenant through fallback.

- Source: Functional Requirement.
- Decision: Maintainer approval on 2026-10-03 authorizes this replacement, preserving the approved behavior from
  2026-10-02 and 2026-10-03 except for the explicitly revised request scope and static selector clarification.

### Acceptance criteria

1. A host outside the configured `${alias}.${BASE_HOSTNAME}` pattern receives HTTP 404 for tenant-dependent requests.
2. A matching host whose alias is unknown receives HTTP 404 without substituting a configured tenant.
3. Both failures provide no successful tenant context or fallback configuration.
4. Browser navigation for either failure presents the application's ordinary missing-page experience rather than
   an access-denied or tenant-resolution diagnostic page.
5. Static mode does not reject a request because of its host. Directory failures and a missing static file follow
   PREETS-TENANT-004's HTTP 500 rules; unreadable/malformed selected files follow its ordinary HTTP 404 rule.

### Open questions

None.

### Related requirements

- Replaces [PREETS-TENANT-001](#preets-tenant-001).
- Host selection: [PREETS-TENANT-003](#preets-tenant-003).
- Configuration failures: [PREETS-TENANT-004](#preets-tenant-004).

### Verification plan

Exercise both failure categories through the running application's HTTP boundary and observe actual HTTP 404
statuses. In a browser, compare invalid-tenant navigation with ordinary missing-page navigation on a valid tenant.
Use at least two configured tenants so any fallback can be detected. Repeat those hosts in static mode with usable
configuration to establish the exemption. No separate port-validation claim is introduced.

### Delivery references

- [Tenant delivery parent #115](https://github.com/PathableAI-org/Pre-ETS/issues/115): coordinates the selected criteria.
- [S3 — Complete approved tenant HTTP and browser failure outcomes #118](https://github.com/PathableAI-org/Pre-ETS/issues/118): AC 1–5.

Published work is tracked in the [tenant delivery plan](../delivery/tenant-resolution.md). These links do not
change requirement lifecycle or establish executed verification evidence.

### Verification evidence

No reviewed, executed evidence has been recorded. This documentation change does not establish runtime behavior.

## PREETS-TENANT-006

**Title:** Expose parsed tenant configuration for verification
**Classification:** Functional Requirement
**Owner / responsible boundary:** Frontend diagnostic HTTP interface
**Lifecycle:** accepted
**Verification:** unverified

### Statement

The test runner must obtain the parsed configuration for the effective request tenant as JSON through
`GET /_test/tenant-config`. The endpoint must use normal application tenant context, including static selection,
and remain available directly at the application boundary in every environment, including production.
Diagnostic responses must include `Cache-Control: no-store`. Full configuration disclosure
requires the non-secret configuration invariant in PREETS-SECURITY-001; independently verified production ingress
protection remains required by PREETS-INFRA-001.

### Rationale and sources

The test runner needs direct configuration evidence from normal request resolution without requiring telemetry.
An independent comparison with the expected file can detect wrong-tenant configuration selection.

- Source: Functional Requirement.
- Decision: Maintainer review approval on 2026-10-03 adds the non-secret delivery dependency and diagnostic
  `Cache-Control: no-store` behavior. Maintainer approval on 2026-10-03 authorizes this replacement, preserving the approved behavior from
  2026-10-02 and 2026-10-03 except for the explicitly revised request scope and static selector clarification.

### Acceptance criteria

1. Successful `GET /_test/tenant-config` responses contain the complete parsed configuration selected by normal
   request resolution, equal to the independently parsed expected `{alias}.json` file in `TENANT_CONFIG_DIR`.
2. When host-based resolution is enabled, requests for two configured tenant hosts return their respective
   configurations rather than a separate lookup
   or fixture echo; interleaved requests do not substitute another tenant's configuration.
3. With a usable static file, the endpoint returns `TENANT_STATIC_ALIAS`'s configuration regardless of Host.
4. Unknown or unresolvable hosts and missing tenant files in host mode receive HTTP 404. Unreadable/malformed
   selected files in either mode receive HTTP 404; directory configuration/access failures in either mode and a
   missing static file receive HTTP 500, following PREETS-TENANT-004.
5. Direct application access under production configuration retains the endpoint; environment gating does not
   disable it. Production ingress protection is a separate obligation.
6. Diagnostic responses include `Cache-Control: no-store`, including HTTP 404 and HTTP 500 responses from this route.

### Design constraints

- The route is `GET /_test/tenant-config`, and its response is the full parsed tenant configuration as JSON.

### Open questions

None.

### Implementation dependencies

Implement and verify PREETS-SECURITY-001's non-secret configuration contract before shipping full diagnostic
configuration disclosure. Verify production ingress protection independently; it does not replace safe content.
Apply the directory/file failure policies approved in PREETS-TENANT-004; these response decisions are resolved.

### Related requirements

- Replaces the diagnostic obligation in [PREETS-TENANT-002](#preets-tenant-002).
- Depends on [PREETS-TENANT-003](#preets-tenant-003), [PREETS-TENANT-004](#preets-tenant-004), and
  [PREETS-TENANT-005](#preets-tenant-005).
- Production access restriction: [PREETS-INFRA-001](infrastructure.md#preets-infra-001).
- Required content constraint: [PREETS-SECURITY-001](security.md#preets-security-001).

### Verification plan

Call the endpoint against a running frontend for two tenants, interleaved requests, both host failure categories,
and static mode with present and missing files. Exercise unreadable/malformed selected files and directory
configuration/access failures in both modes using PREETS-TENANT-004’s approved outcomes. Independently read and parse the expected file; compare complete
parsed values rather than whitespace or object-key order. Do not derive expected values from the response or the
application's selection implementation. Assert `Cache-Control: no-store` on successful and failed diagnostic
responses. Repeat direct application access under production configuration.

This evidence establishes selected configuration and retrieval. It does not establish frontend user behavior or
production ingress blocking, which have their own boundaries and verification plans.

### Delivery references

- [Tenant delivery parent #115](https://github.com/PathableAI-org/Pre-ETS/issues/115): coordinates the selected criteria.
- [S1 — Load and expose the selected non-secret tenant configuration #116](https://github.com/PathableAI-org/Pre-ETS/issues/116): AC 1–3, 5, and success portion of AC 6.
- [S3 — Complete approved tenant HTTP and browser failure outcomes #118](https://github.com/PathableAI-org/Pre-ETS/issues/118): AC 4 and failed-response portion of AC 6.

Published work is tracked in the [tenant delivery plan](../delivery/tenant-resolution.md). These links do not
change requirement lifecycle or establish executed verification evidence.

### Verification evidence

No reviewed, executed evidence has been recorded. This documentation change does not establish runtime behavior.
