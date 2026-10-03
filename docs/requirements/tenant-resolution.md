# Tenant resolution

## PREETS-TENANT-001

**Title:** Resolve the request tenant from its host
**Lifecycle:** accepted
**Verification:** unverified

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
**Lifecycle:** accepted
**Verification:** unverified

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
