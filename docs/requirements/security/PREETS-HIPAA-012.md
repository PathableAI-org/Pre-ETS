---
id: PREETS-HIPAA-012
classifications:
  - Regulatory
---

# Application support for access, amendment, and disclosure accounting

## Owner / responsible boundary

Application record retrieval, amendment, and disclosure-information boundaries

## Description

Where the product maintains a designated record set or accountable disclosures for a covered entity, the application must support authorized retrieval/copy, incorporation or linkage of accepted amendments, and retrieval of applicable disclosure-accounting information.

## Rationale

The software supplies the records and amendment/accounting capability needed for separately authorized rights fulfillment; ordinary coach editing and undo do not satisfy that broader contract.

## Sources

- Source: [45 CFR 164.504(e)(2)(ii)(E)–(G)](https://www.ecfr.gov/current/title-45/section-164.504), [164.524](https://www.ecfr.gov/current/title-45/section-164.524), [164.526](https://www.ecfr.gov/current/title-45/section-164.526), and [164.528](https://www.ecfr.gov/current/title-45/section-164.528). Reviewed 2026-10-09; amendment/accounting and business-associate sources rechecked 2026-10-10.
- Scope decision: Maintainer direction (2026-10-10) retains supporting software capabilities and separates infrastructure from application requirements. This scope decision does not approve the detailed obligation or establish verification.

## Acceptance criteria

1. A requester with the separately approved rights-fulfillment authorization can retrieve/copy the records within the approved designated-record-set and tenant scope, including retained records hidden by ordinary deletion; out-of-scope and unauthorized requests disclose no protected contents.
2. The application incorporates or links an amendment accepted by the authorized decision maker to the affected records so later authorized retrieval includes the amendment; unauthorized amendment attempts leave those records unchanged.
3. For disclosures subject to accounting, the application preserves and supplies date, recipient, data description, and purpose within the applicable accounting window, including the six-year statutory window where applicable and its exceptions.
4. These capabilities enforce the approved authorization and selected audit contracts without expanding ordinary coach access or requiring a participant portal.

## Open questions

Designated-record-set and disclosure-category contract, authorized retrieval/amendment/accounting interface, copy format, amendment linkage, and failure outcomes. Human request verification, rights decisions, response deadlines, and contract allocation are deferred operational work; no participant portal or routine supervisor-sharing policy is selected.

## Related requirements

- [PREETS-HIPAA-002](PREETS-HIPAA-002.md) and [PREETS-HIPAA-004](PREETS-HIPAA-004.md) define access and audit safeguards.
- [PREETS-HIPAA-011](PREETS-HIPAA-011.md) defines application retention/disposal.
- [PREETS-ONSITE-005](../on-site-job-coaching/PREETS-ONSITE-005.md) retains owner-only ordinary access.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Verification Plan

Application evidence demonstrates authorized record retrieval/copy, accepted amendment linkage in subsequent retrieval, and disclosure-accounting fields within applicable windows and exceptions, including retained ordinarily deleted records. Denial evidence covers unauthorized and out-of-scope access and unchanged state after denied amendments. Designated-record-set, disclosure-category, authorization, and interface decisions remain conditions; this evidence does not establish human rights decisions or response-deadline compliance.

Unresolved verification conditions follow the Open questions and shared context. The plan establishes no executed result or compliance claim.

## Shared context

The [HIPAA scope, regulatory basis, and software boundaries](../context/hipaa.md) qualify this contract.
