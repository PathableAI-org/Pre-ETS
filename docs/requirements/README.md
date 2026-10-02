# Durable requirements

This register holds versioned statements of required product and system behavior. Requirements remain relevant
after a delivery issue closes or an implementation changes. Review changes to these promises through ordinary
repository pull requests.

## Register

No requirements have been registered yet. The [area template](templates/area.md) contains placeholders only;
it is not an approved product contract. Existing specifications have not been migrated into this register.

As areas are added, list links to their documents here. Group related requirements in one Markdown file per
coherent product area, such as `session-management.md`, rather than creating a file for every requirement.
This list is a navigation index, not a separate status or traceability matrix.

## Author a requirement

1. Read the supplied intent and sources. Distinguish discovery, proposed decisions, and approved obligations.
   Existing code can explain the current behavior; it does not by itself establish what the product must promise.
2. Search the register for the same obligation before adding one. Copy the area template into an area document
   or extend an existing document. Replace every placeholder and omit optional references that do not exist.
3. Assign an ID in the form `PREETS-AREA-NNN`, using an uppercase area token and a zero-padded number starting
   at `001`. Reuse the existing token for an area and allocate the next unused number after its highest ID.
   Search all area documents, including retired entries, to avoid collisions. Templates do not allocate IDs.
4. Describe who depends on the behavior, the relevant conditions, and the observable outcome. Include rationale,
   attributable sources, and acceptance criteria that can establish whether the obligation is met.
5. Start new requirements as `proposed` and `unverified`. Record unresolved questions explicitly; do not fill
   gaps with invented policy. Request review of the proposed promise through the normal repository workflow.

Use relative Markdown links for repository sources and full URLs for external sources, issues, and PRs.
Identify the relevant source section, decision, test title, or scenario rather than linking only to a large file.
If a source cannot be accessed, preserve its attribution and describe the limitation; access is not a prerequisite
for drafting a proposal from supplied material. Keep credentials and sensitive client data out of the register.

## Lifecycle and verification

Lifecycle describes the decision about the requirement:

| Value        | Meaning                                                       |
| ------------ | ------------------------------------------------------------- |
| `proposed`   | A candidate obligation awaiting a product decision.           |
| `accepted`   | An approved obligation, whether or not it is implemented.     |
| `deprecated` | Retained for history but no longer an active obligation.      |
| `superseded` | Replaced by requirements identified in its replacement links. |

Record the decision reference when accepting or retiring a requirement. Do not infer acceptance from a passing
test, an existing implementation, or a closed issue. An agent records approval supplied by the maintainer or
documented in a source; authoring a proposal does not approve it.

Verification describes the available evidence independently:

| Value        | Meaning                                                                |
| ------------ | ---------------------------------------------------------------------- |
| `unverified` | No reviewed, executed evidence establishes the acceptance criteria.    |
| `partial`    | Reviewed, executed evidence supports only some criteria or conditions. |
| `verified`   | Reviewed, executed evidence supports all criteria within stated scope. |

For evidence, record the covered criteria, responsible boundary, test or scenario, execution result reference
and date or revision, and limitations. A test link alone, a TODO, a dry run, or passing formatting/type checks
does not demonstrate product behavior. Use [Testing as evidence](../engineering/testing/README.md) to assess
whether the assertions establish the claimed outcome. Document manual verification with its procedure,
observations, execution context, and limitations when applicable.

When a statement or criterion changes, reassess its evidence and downgrade verification if the old evidence
no longer supports the new promise. Do not describe `verified` as a permanent guarantee or certification.

## Update and retire

Preserve an ID while refining the same obligation. Explain material changes to accepted promises in the PR
and record the approving decision. If replacing an obligation with different promises, assign new IDs, retain
the old entry as `superseded`, and link it to its replacements. Add a backlink from replacements to the old ID.
Use `deprecated` when withdrawing an obligation without a replacement. Never delete or reuse retired IDs.

Review source conflicts, duplicate obligations, testable criteria, lifecycle decisions, replacement links, and
evidence scope. Missing implementation or verification is a legitimate recorded gap, not a reason to invent links.

## Traceability and agent use

Each requirement owns its source, optional design decisions, delivery issue/PR links, and verification references.
Issues describe work; closing one does not close the requirement. An eventual requirements traceability matrix
(RTM) will be generated from these references as a derived view. No generator or manually maintained matrix is
provided in this version.

Repository-local skills support this workflow:

- `$requirements-author Draft requirements from these notes` creates or updates proposals using this format.
- `$requirements-review Review docs/requirements/<area>.md` reports findings without editing by default.

The skills live in [.agents/skills](../../.agents/skills). This workflow does not require active Spec Kit state,
change its commands or artifacts, or automatically synchronize feature specs. It adds no GitHub writes,
automatic commits, or external account requirements.
