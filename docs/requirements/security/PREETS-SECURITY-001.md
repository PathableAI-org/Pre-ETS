---
id: PREETS-SECURITY-001
classifications:
  - Security
---

# Exclude secret material from tenant configuration

**Owner / responsible boundary:** Tenant configuration producers and frontend configuration contract

## Description

Tenant configuration is a non-secret application configuration artifact. Credentials, private keys, tokens, and
other secret material must be obtained through separate server-only mechanisms and must never be included in
tenant configuration. The full parsed configuration exposed
through the diagnostic interface must be safe to disclose without revealing such secrets. Avoid secret dependencies
where possible. When a capability needs a secret, the on-disk tenant configuration contains only a non-secret
lookup key; a vendor-agnostic server-only secrets provider resolves that key to the secret value. Provider credentials
and resolved values are never part of tenant configuration or diagnostic JSON.

## Rationale

Returning complete parsed configuration is compatible with confidentiality only if the configuration contains no
credentials or secret key material. Server-only secret resolution must remain outside this configuration.

## Sources

- Legacy source label: Security Requirement; obligation attribution is recorded in the maintainer decisions below.
- Decision: Maintainer approval on 2026-10-03 authorizes recording this candidate security invariant as proposed.
  Maintainer approval of the review refinements on 2026-10-03 accepts the non-secret configuration invariant as
  a prerequisite for shipping full diagnostic disclosure. Implementation and enforcement evidence remain pending.
- Decision: Maintainer direction on 2026-10-03 resolves delivery decision B2: allow non-secret lookup keys in tenant
  files and express resolution through a vendor-agnostic server-only secrets provider. Selection and integration of
  a concrete cloud, Kubernetes, or Docker provider are deferred until cloud infrastructure work starts.

## Acceptance criteria

1. Tenant configuration contains no passwords, client secrets, private keys, access tokens, or other credentials
   or secret key material.
2. Any authentication capability requiring secrets obtains them separately from the tenant configuration returned
   by `GET /_test/tenant-config`. Tenant files contain only non-secret lookup keys when secrets are needed;
   a vendor-agnostic server-only provider resolves them. Provider credentials and resolved secrets are absent
   from tenant configuration and diagnostic responses.
3. The diagnostic endpoint still returns the full parsed configuration; this requirement does not introduce redaction
   or a separate diagnostic DTO.

## Design constraints

- Minimize the need for secrets in tenant configuration-dependent capabilities.
- Secret references are lookup keys, not embedded secret values or access credentials. Full diagnostic JSON includes
  these non-secret references under the existing full-configuration contract.
- Keep the provider contract vendor-agnostic. Concrete provider selection and integration belong to later cloud
  infrastructure delivery; no vendor SDK, credential scheme, or key format is selected here.

## Open questions

- How will externally managed configuration producers integrate the shared schema validation, and how will
  secret material placed inside otherwise allowed text fields be controlled? The planned runtime and CI checks
  do not establish the safety of all externally supplied content.

## Related requirements

- Constrains [PREETS-TENANT-004](../tenant/PREETS-TENANT-004.md) and
  [PREETS-TENANT-006](../tenant/PREETS-TENANT-006.md).
- Complements [PREETS-INFRA-001](../infrastructure/PREETS-INFRA-001.md); ingress protection does not establish safe content.

## Verification Plan

Semantic configuration and data-flow assessment, externally meaningful configuration validation, and diagnostic HTTP evidence must establish absence of secret-bearing configuration fields, separation of server-only secret resolution, absence of synthetic resolved secrets and provider credentials in diagnostic output, and preservation of the complete permitted configuration. Copilot review may assist semantic assessment but is advisory, not proof of compliance. Evidence must consider field meaning and nested structures rather than names alone; a separate server-only secret provider is compatible with this contract.

Fixture conformance and validator behavior do not establish safety of every externally managed or deployed configuration. Schema enforcement cannot detect every secret pasted into allowed text. Concrete provider integration remains deferred; the producer/content-control questions in Open questions limit the claim. Existing engineering strategy is preserved in the pre-migration Git history rather than prescribed here.

## Delivery references

- [Tenant delivery parent #115](https://github.com/PathableAI-org/Pre-ETS/issues/115): coordinates the selected criteria.
- [S4 — Establish the non-secret tenant configuration contract before disclosure #119](https://github.com/PathableAI-org/Pre-ETS/issues/119): AC 1–2 and enabling schema work for AC 3.
- [S1 — Load and expose the selected non-secret tenant configuration #116](https://github.com/PathableAI-org/Pre-ETS/issues/116): diagnostic absence portion of AC 2 and full-response AC 3.

Published work is tracked in the [tenant delivery plan](../../delivery/tenant-resolution.md). These links do not
establish executed verification evidence.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.
