---
id: PREETS-TENANT-002
classifications:
  - Functional
---

# Expose parsed tenant configuration for verification with production ingress protection

## Deprecation reason and replacements

Maintainer approval on 2026-10-03 separates application diagnostics from production ingress protection.
The original content below is retained as history.

Replaced by [PREETS-TENANT-006](../../tenant/PREETS-TENANT-006.md) and
[PREETS-INFRA-001](../../infrastructure/PREETS-INFRA-001.md).

## Description

The test runner must be able to obtain the parsed tenant configuration as JSON for a frontend request through
`GET /_test/tenant-config`. The response must contain the configuration selected by the application's normal request
tenant context, including static resolution when enabled, and must be available from the application perspective
in every environment. Verification must compare the response with the parsed contents of the expected tenant
configuration file on disk.

Production infrastructure ingress rules must block all traffic to `/_test/*` before it reaches the application,
regardless of route or HTTP method.
Application-level environment gating must not disable the diagnostic endpoint in production.

## Rationale

Direct observation of the effective request tenant configuration supports tenant-resolution verification without
requiring telemetry solely to inspect that configuration. Ingress owns production access restrictions while the application
provides consistent diagnostic behavior across environments.

## Sources

- Legacy source label: Functional Requirement; obligation attribution is recorded in the maintainer decisions below.
- Decision: Maintainer approval on 2026-10-02 requires a route under
  `/_test/*`, application availability in all environments, and production blocking through infrastructure ingress
  rules. Further maintainer approval on 2026-10-02 specifies `GET /_test/tenant-config` and blocking all traffic
  to `/_test/*`. Further maintainer approval on 2026-10-02 requires the parsed tenant configuration as JSON,
  verified against the expected configuration file on disk. This approves the obligation, not its implementation
  or verification.

## Acceptance criteria

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

## Open questions

None.

## Related requirements

- [PREETS-TENANT-001](PREETS-TENANT-001.md) defines resolution for every frontend request, including diagnostic requests.

## Historical verification plan

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

## Historical verification notes

No reviewed, executed evidence has been recorded. Application availability and production ingress enforcement
remain unverified; planned verification does not establish either behavior.

## Observability

Historical contract retained for supersession review. No additional operational observability obligation is introduced by migration.
