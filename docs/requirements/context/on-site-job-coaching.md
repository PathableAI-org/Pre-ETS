# On-site job-coaching service records

These proposed requirements derive from the maintainer-supplied **Initial on-site job-coaching service-record
workflow handoff**, provided on 2026-10-06, and the source review below. Drafting does not approve the obligations:
Git and PR review govern acceptance; source review does not establish implementation or executed verification.

Non-trivial product data in this workflow is assumed to be PHI under maintainer direction on 2026-10-09.
[HIPAA protection of product data](hipaa.md#scope-and-regulatory-basis) supplies the cross-cutting software
safeguards; operational requirements are deferred separately. This includes incomplete input, deleted records, identifying diagnostics,
and backups. Workflow deferrals do not waive applicable regulatory safeguards; ordinary editing and undo are
not substitutes for authorized amendment, audit, or retention processes.

## Scope and product direction

This first workflow-specific area covers a coach recording an on-site job-coaching visit for a participant,
returning to their own records, updating them, and deleting them with immediate undo. A service record documents
a service event; it is not the full monthly progress report represented by the source form.

The first increment replaces the visit-log entry activity. It does not establish complete paper-form retirement.
Employment/report context, monthly intervention planning and support fading, visit duration and total hours,
report generation, and coach/supervisor attestation require separately scoped requirements before claiming
that the whole paper workflow has been replaced. This boundary does not add those capabilities to this slice.

The current product decisions supplied in the handoff are the basis for the linked proposals: capture the current
user and start time when starting a record; capture end time on an explicit action; permit time correction;
keep visit narratives optional; make the created record durable; allow subsequent updates without submission
or approval; limit this slice to the user's own records; and retain deleted records with immediate undo.
These are maintainer product directions; source-provider validation remains unavailable. Acceptance into the
requirements register depends on Git and human PR review, not on these source findings.

The adoption strategy is incremental. An organization should not need to replace its participant-management
processes to adopt service recording. Participant management and integration with the authoritative participant
source are separate discovery problems. Participant association is required here; its source and interaction
need a bounded product decision before delivery. No participant registry, enrollment, intake, or replacement
of an existing system is promised by this specification.

The existing paper form is the user's mental model. A form-like experience is permitted UX direction, not a
requirement for a visual replica or a domain model shaped like the paper. Monthly report generation from service
records is a future value hypothesis. Cross-service event capture, including group services, is an emerging
pattern to investigate rather than a committed abstraction.

Submission states, supervisor approval, signatures, locking, monthly intervention plans, report generation,
billing, supervisor/team visibility, and a general trash/recovery interface are outside this slice.

## Sources and evidence limitations

- **Handoff:** Maintainer-supplied workflow and discovery context (2026-10-06), including numbered happy-path
  steps 1–10 and known uncertainties. This supplies product intent; it is not client SME validation.
- **Form:** **On-Site Progress Report.docx**,
  internally titled **Job Coaching Progress Report & Service Log**; reviewed as extracted text on 2026-10-06.
  The visit-log section contains date, coach, start/end, total, purpose of visit, observations, interventions,
  and next steps. The larger form also contains consumer/employment information, a monthly intervention plan,
  total hours, and coach/supervisor signatures. Field presence establishes what the artifact captures, not
  which fields are mandatory in practice or a required digital approval process. Visual layout and current
  template authority were not verified. Totals and monthly content are not adopted as obligations here.
- **Research:** **First Client Discovery — Forms & Documents**,
  “Evidence standard”; **02 — Business Processes & Handoffs**,
  “Placement, stabilization and continuing support” and “Authorization, reporting and billing”; and
  **05 — Discovery Questions & Validation Agenda**,
  “P1 — answer before designing the first workflow” and “Systems”; reviewed on 2026-10-06. They distinguish
  document evidence, inference, and unresolved operational questions. Report/submission and authorization
  concepts do not automatically become requirements for an individual service record.
- **Earlier design:** **08 — Consumer Service Log Database Blueprint**,
  “Scope and naming,” “Business workflow,” and “Security and integrity rules”; reviewed on 2026-10-06.
  It explicitly requires SME validation and proposes broader models, approvals, finalized-report locking, and
  technical choices. This handoff scopes those ideas out of the initial record workflow. No accepted obligation
  is replaced by following the handoff; this proposal does not endorse or revise the blueprint.
- **Repository baseline:** GitHub `main` at `62972698fdad9fb7f73f825dc9ac066874948cd9`, fetched on 2026-10-06.
  The register guide, template, and existing areas were inspected before allocating IDs; no on-site workflow
  obligation was registered there. GitHub remains authoritative for product requirements and implementation
  state. This source review establishes no delivery or behavioral verification claim.

The planned client discovery engagement did not proceed and client SMEs are currently unavailable, according to
the handoff. Supplied forms and industry experience inform hypotheses; neither substitutes for independent
validation.
**Project Reference Links.txt** was named but not supplied with an accessible location. Drive search did not
locate it; its contents were not reviewed. The form, research, and earlier design above were accessed directly;
their identifying source locations are withheld from the public repository under the register's attribution rule.
Industry facts, product obligations, implementation choices, and technical guidance remain distinct.

## Open discovery questions and delivery gates

- Can one on-site record involve multiple participants? The proposal covers the stated single-participant
  happy path without asserting that multiple participants are prohibited in the domain.
- Do coaches create records on behalf of another coach? This slice captures the current user; delegation,
  coach reassignment, and creator-versus-service-provider distinctions remain unresolved.
- What source owns participant information, and how can this slice associate a record with the correct person
  without requiring participant-management replacement? Decide the minimal association interaction before delivery.
- What supervisor/team access is needed? No role hierarchy, team membership, or organizational sharing policy
  is inferred. Any future visibility needs separate discovery and authorization decisions.
- Which forms and fields are current and mandatory for the source provider? What approvals/signatures apply to later reports?
  Optional narratives and absence of submission gates are current slice decisions, not claims about compliance
  with every paper-reporting obligation.
- How should time correction handle dates, time zones, overnight visits, invalid ordering, and concurrent changes?
  Agree validation and failure outcomes before delivering the affected interactions; no rounding or billing rule
  is inferred from the form's totals.
- How is a successful creation/update communicated, and when are edits saved? Decide save interaction, failed
  write/retry behavior, and concurrent-edit behavior before delivery. Durability of created records and successful
  updates is required by the linked contracts; per-keystroke autosave and offline operation are not established by this handoff.
- What makes immediate undo usable, how long is it available, and what happens on navigation or session expiry?
  Define the opportunity before delivering deletion. Later recovery, retention, purge authority, and permanent
  deletion remain discovery questions; normal workflow deletion must preserve the underlying record.

### Decision ownership and affected delivery gates

The roles below identify decision responsibilities, not assigned individuals or completed decisions. Name the
responsible person and record the decision in the affected delivery plan before its gate is crossed.

| Decision                                                                                     | Responsible role                                                                  | Gate                                                        |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Participant source and minimal association                                                   | Product maintainer, informed by the participant source owner when available       | Before delivering creation (-001)                           |
| Save acknowledgement, failed writes/retries, and concurrent edits                            | Product maintainer with the application delivery owner                            | Before delivering creation or updates (-001–-004, -006)     |
| Date/time interpretation, ordering, overnight visits, and repeated end actions               | Product maintainer with the application delivery owner                            | Before delivering time capture/correction (-002)            |
| Ownership enforcement and denied-operation outcomes                                          | Application delivery owner, with product maintainer review of observable outcomes | Before delivering any record access or mutation (-001–-008) |
| Undo duration, keyboard/focus/announcement behavior, navigation/session expiry, and failures | Product maintainer with the UI delivery owner                                     | Before delivering deletion and undo (-007, -008)            |
| Complete paper replacement and remaining monthly-report responsibilities                     | Product maintainer; source-provider validation remains unavailable                | Before expanding this slice or claiming paper retirement    |

These gates preserve the documented uncertainties; they do not select autosave, offline support, a participant
registry, a reporting lifecycle, or a permanent-deletion policy.
Participant-association correction remains unresolved and requires separately scoped requirements before delivery;
PREETS-ONSITE-006 promises updates to service times and narratives only.

## Shared data-input requirements

This workflow adopts the following obligations from [Generalized data-input workflows](data-input-workflows.md).
Individual contracts in `data-input/` own those promises; this context supplies their on-site applicability.

- [PREETS-ONSITE-004](../data-input/PREETS-ONSITE-004.md): records are durable from creation, including when the end time and all narratives are empty; successful time and narrative updates survive session and backend process changes.
- [PREETS-ONSITE-007](../data-input/PREETS-ONSITE-007.md): deletion removes records from ordinary views while preserving participant/coach association, times, and narratives.
- [PREETS-ONSITE-008](../data-input/PREETS-ONSITE-008.md): immediate undo restores the same record with those values intact.
- [PREETS-ONSITE-009](../data-input/PREETS-ONSITE-009.md): the service-record form monitors heartbeat connectivity and disables inputs during detected failure, subject to valid authenticated access on recovery.

Owner-only authorization is defined by PREETS-ONSITE-005. Optional narratives, absence of submission/approval
states, and the specific fields remain on-site policies. Shared requirements do not grant additional access.

## Related requirements and current contracts

On GitHub main, [PREETS-SESSION-001](../session/PREETS-SESSION-001.md),
[PREETS-SESSION-003](../session/PREETS-SESSION-003.md), and
[PREETS-SESSION-005](../session/PREETS-SESSION-005.md) are accepted requirements for protected access,
user/tenant identity, and tenant binding. Their acceptance does not establish implementation.
Record access must respect those boundaries without treating a matching tenant as permission to access another
coach's records. Participant association and record ownership need application authorization decisions before delivery.

[Session state and domain persistence](../../domain-persistence.md), “When the line is crossed,” provides current
engineering context for durable domain instances. This proposal requires durability from creation even while
narratives or end time are incomplete. It introduces no final-submit transition or persistence technology.
