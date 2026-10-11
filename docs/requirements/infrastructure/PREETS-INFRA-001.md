---
id: PREETS-INFRA-001
classifications:
  - Functional
---

# Block test-route traffic at production ingress

**Owner / responsible boundary:** Production infrastructure ingress

## Description

Every production ingress must block all traffic to `/_test/*` before it reaches the frontend application,
regardless of route, HTTP method, or tenant host. The ingress response must not expose diagnostic configuration.

## Rationale

Infrastructure owns production isolation of application diagnostics. Application availability does not establish
that external production access is blocked.

## Sources

- Legacy source label: Functional Requirement; obligation attribution is recorded in the maintainer decisions below.
- Decision: Maintainer approval on 2026-10-03 authorizes this replacement, preserving the approved behavior from
  2026-10-02 and 2026-10-03 except for the explicitly revised request scope and static selector clarification.

## Acceptance criteria

1. `GET /_test/tenant-config` on a valid configured tenant host is blocked through every production ingress.
2. Other routes and HTTP methods under `/_test/*` are also blocked before reaching the application.
3. Blocking responses do not expose tenant configuration, and application availability of diagnostics does not
   bypass ingress protection.

## Design constraints

- Production ingress rules block the entire `/_test/*` prefix; application-level environment gating is not the control.

## Open questions

None.

## Related requirements

- Replaces the ingress obligation in [PREETS-TENANT-002](../deprecated/tenant/PREETS-TENANT-002.md).
- Protects [PREETS-TENANT-006](../tenant/PREETS-TENANT-006.md).

## Verification Plan

Pre-deployment policy-as-code assessment of Terraform plans using the previously selected HashiCorp Sentinel approach must establish blocking coverage and precedence for every production frontend ingress, all methods, and the /_test/* prefix. Policy validation must demonstrate rejection of missing or bypassable controls. Post-deployment HTTP/API evidence using the previously selected Playwright approach must establish actual blocking, absence of diagnostic disclosure, and rejection before forwarding at every deployed production ingress. A permitted application request provides evidence that general unreachability is not mistaken for blocking.

The existing deployment-gate commitment is preserved: the Sentinel gate precedes infrastructure application, and deployment success requires the post-deployment ingress suite to pass. Policy assessment and deployed results establish different claims. A 404 alone does not locate rejection at ingress; finite probes alone do not establish every route/method combination. Copilot review is advisory. Tools and gates are expected evidence, not assertions of implementation. The deployment environment and its entry points remain verification context to supply.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.
