# Security

## PREETS-SECURITY-001

**Title:** Exclude secret material from tenant configuration
**Classification:** Security Requirement
**Owner / responsible boundary:** Tenant configuration producers and frontend configuration contract
**Lifecycle:** accepted
**Verification:** unverified

### Statement

Tenant configuration is a non-secret application configuration artifact. Credentials, private keys, tokens, and
other secret material must be obtained through separate server-only mechanisms and must never be included in
tenant configuration. The full parsed configuration exposed
through the diagnostic interface must be safe to disclose without revealing such secrets. Avoid secret dependencies
where possible. When a capability needs a secret, the on-disk tenant configuration contains only a non-secret
lookup key; a vendor-agnostic server-only secrets provider resolves that key to the secret value. Provider credentials
and resolved values are never part of tenant configuration or diagnostic JSON.

### Rationale and sources

Returning complete parsed configuration is compatible with confidentiality only if the configuration contains no
credentials or secret key material. Server-only secret resolution must remain outside this configuration.

- Source: Security Requirement.
- Decision: Maintainer approval on 2026-10-03 authorizes recording this candidate security invariant as proposed.
  Maintainer approval of the review refinements on 2026-10-03 accepts the non-secret configuration invariant as
  a prerequisite for shipping full diagnostic disclosure. Implementation and enforcement evidence remain pending.
- Decision: Maintainer direction on 2026-10-03 resolves delivery decision B2: allow non-secret lookup keys in tenant
  files and express resolution through a vendor-agnostic server-only secrets provider. Selection and integration of
  a concrete cloud, Kubernetes, or Docker provider are deferred until cloud infrastructure work starts.

### Acceptance criteria

1. Tenant configuration contains no passwords, client secrets, private keys, access tokens, or other credentials
   or secret key material.
2. Any authentication capability requiring secrets obtains them separately from the tenant configuration returned
   by `GET /_test/tenant-config`. Tenant files contain only non-secret lookup keys when secrets are needed;
   a vendor-agnostic server-only provider resolves them. Provider credentials and resolved secrets are absent
   from tenant configuration and diagnostic responses.
3. The diagnostic endpoint still returns the full parsed configuration; this requirement does not introduce redaction
   or a separate diagnostic DTO.

### Design constraints

- Minimize the need for secrets in tenant configuration-dependent capabilities.
- Secret references are lookup keys, not embedded secret values or access credentials. Full diagnostic JSON includes
  these non-secret references under the existing full-configuration contract.
- Keep the provider contract vendor-agnostic. Concrete provider selection and integration belong to later cloud
  infrastructure delivery; no vendor SDK, credential scheme, or key format is selected here.

### Open questions

- How will externally managed configuration producers integrate the shared schema validation, and how will
  secret material placed inside otherwise allowed text fields be controlled? The planned runtime and CI checks
  do not establish the safety of all externally supplied content.

### Related requirements

- Constrains [PREETS-TENANT-004](tenant-resolution.md#preets-tenant-004) and
  [PREETS-TENANT-006](tenant-resolution.md#preets-tenant-006).
- Complements [PREETS-INFRA-001](infrastructure.md#preets-infra-001); ingress protection does not establish safe content.

### Verification plan

Use Copilot PR review as an initial semantic check, backed by repository review instructions recording these
practices: tenant configuration must not introduce secret-bearing fields; a `Config.secret` field in the tenant
configuration contract must be flagged; secrets required by authentication must remain in a separate server-only
provider; and diagnostic JSON must remain the complete permitted tenant configuration. Inspect field meaning,
types, data flow, and nested structures, not just suspicious names. `Config.secret` in a separate server-only
secret provider is not itself a violation. Copilot feedback is advisory review evidence, not proof of compliance
or a substitute for deterministic checks. The requirements-document review instructions are recorded in
[Copilot guidance](../../.github/instructions/requirements.instructions.md). Instructions for reviewing production
configuration code and the automated enforcement checks remain planned work.

Automate fixture and runtime configuration validation with Effect Schema using explicit permitted fields and
rejection of unexpected fields at relevant nested boundaries. Use Vitest with `@effect/vitest` to exercise the real
loader with allowed configurations and forbidden secret-bearing fields, including nested cases. Use a deterministic server-only provider implementation to resolve synthetic lookup keys during verification;
concrete production provider integration is deferred. Supply synthetic
secrets through that provider and assert that they never appear in the diagnostic
response. These checks support criteria 1 and 2; compare full diagnostic JSON with independently parsed permitted
configuration to support criterion 3 and the diagnostic contract.

Repository JSON files are fixtures; real tenant configuration is managed outside this repository. Apply the same
contract validation when real files are provisioned or loaded. CI demonstrates validator behavior and fixture
conformance, not the safety of every deployed configuration file. Schema enforcement excludes unsupported fields;
it cannot detect every secret pasted into an allowed text field. Record this limitation rather than claiming that
field-name checks, benign fixtures, or a clean Copilot review establish absence of all secret content.

### Verification evidence

No reviewed, executed evidence has been recorded. This documentation change does not establish runtime behavior.
