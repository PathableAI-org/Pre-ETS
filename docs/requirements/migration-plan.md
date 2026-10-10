# Existing requirements migration plan

This is a separate migration proposal, not authorization to migrate contracts or new product obligations.
The governance update leaves all existing requirement documents, IDs, criteria, and evidence artifacts unchanged.

## Inventory and destination proposal

| Current document        | IDs to preserve                | Proposed destination                                |
| ----------------------- | ------------------------------ | --------------------------------------------------- |
| `tenant-resolution.md`  | PREETS-TENANT-001 through 006  | `tenant/`, with 001 and 002 in `deprecated/tenant/` |
| `infrastructure.md`     | PREETS-INFRA-001 and 002       | `infrastructure/`                                   |
| `security.md`           | PREETS-SECURITY-001            | `security/`                                         |
| `session-management.md` | PREETS-SESSION-001 through 013 | `session/`                                          |

There are 22 IDs, including two superseded historical tenant contracts. Destination directory choices do not
change area tokens or IDs. These ranges inventory this migration only; they are not an ongoing requirement index.

## Proposed migration sequence

1. Review Git/PR history and source decisions for each contract. PREETS-INFRA-002 has a legacy `proposed` label;
   if merged into `main`, the new governance treats it as accepted. Confirm history without inventing approval
   or silently rewriting its obligation.
2. Extract each contract to its ID-only file, preserving statement, criteria, rationale, source decisions,
   approved design constraints, open questions, and historical context. Convert classification into a YAML list;
   distinguish legacy “Functional Requirement” source labels from actual source attribution.
3. Move PREETS-TENANT-001 and 002 into deprecated history with their existing retirement reasons and replacement
   links. Retain forward links and replacement backlinks. Do not delete historical requirement files without
   explicit human authorization; resolve the old area containers' disposition in migration review.
4. Carry shared session scope, source limitations, and contract-context notes into the affected files or a linked
   contextual document so extracting sections loses no qualifications. Update relative links and review inbound
   links across documentation, delivery artifacts, and evidence without changing their conventions or behavior.
5. Identify true hard prerequisites before adding structured dependencies. Existing “Related requirements” lists
   mix replacements, context, and potential prerequisites; do not mechanically convert every link.
6. Add Observability sections only from existing approved obligations or human decisions. Where the source does
   not settle operational expectations, ask the human; do not invent telemetry promises or assert Not applicable
   merely to complete a template.
7. Recast verification plans as high-level external claims, preserving meaningful scope and known limitations.
   Internal service/property strategies in tenant and session plans belong to engineering; detailed commands in
   PREETS-INFRA-002 belong to a manual procedure. Preserve useful context in appropriate documentation when
   authorized, without implementing evidence or creating authoritative inferred relationships.
8. Remove manual status fields and synchronized evidence inventories after preserving historical decisions and
   any substantive evidence context in appropriate artifacts or Git history. Assess evidence relationships
   semantically and submit new associations for human approval. Review every original ID and obligation for
   continuity; no CI validator or generated index is part of this migration.

## Decisions and boundaries

The existing documents have no dedicated Observability sections. New operational promises need human decisions.
Existing open questions remain unresolved, including tenant configuration-failure policy, diagnostic access under
session authentication, session defaults, timing, synchronization, and OIDC freshness. Migration must not answer
those questions, collapse failure categories, expand scope, or split contracts merely to fit the new layout.

Acceptance criteria numbering and existing references to it can remain readable locators; no new stable criterion
IDs are needed. Do not migrate tests or change delivery-planning conventions in the governance update.
Authorize the migration separately, with a reviewable mapping of preserved content, adjusted links, evidence
implications, and any product decisions before changing accepted contracts.
