# Security

## PREETS-SECURITY-001

**Title:** Exclude secret material from tenant configuration
**Classification:** Security Requirement
**Owner / responsible boundary:** Tenant configuration producers and frontend configuration contract
**Lifecycle:** proposed
**Verification:** unverified

### Statement

Tenant configuration must contain no credentials or secret key material. The full parsed configuration exposed
through the diagnostic interface must be safe to disclose without revealing such secrets.

### Rationale and sources

Returning complete parsed configuration is compatible with confidentiality only if the configuration contains no
credentials or secret key material. Server-only secret resolution must remain outside this configuration.

- Source: Security Requirement.
- Decision: Maintainer approval on 2026-10-03 authorizes recording this candidate security invariant as proposed.
  Acceptance and enforcement remain pending.

### Acceptance criteria

1. Tenant configuration contains no passwords, client secrets, private keys, access tokens, or other credentials
   or secret key material.
2. Any authentication capability requiring secrets obtains them separately from the tenant configuration returned
   by `GET /_test/tenant-config`.
3. The diagnostic endpoint still returns the full parsed configuration; this proposal does not introduce redaction
   or a separate diagnostic DTO.

### Open questions

- How will configuration producers and the runtime enforce absence of secret material? This proposal specifies
  the required content, not an approved enforcement mechanism.

### Related requirements

- Constrains [PREETS-TENANT-004](tenant-resolution.md#preets-tenant-004) and
  [PREETS-TENANT-006](tenant-resolution.md#preets-tenant-006).
- Complements [PREETS-INFRA-001](infrastructure.md#preets-infra-001); ingress protection does not establish safe content.

### Verification plan

Review the tenant configuration contract and producers for secret-bearing fields. Once an enforcement mechanism
is chosen, exercise it with representative secret-bearing configurations and inspect diagnostic output and the
separate secret-resolution boundary. Schema review and benign fixtures alone do not establish absence of secrets
in arbitrary configuration or all deployed tenant files.

### Verification evidence

No reviewed, executed evidence has been recorded. This documentation change does not establish runtime behavior.
