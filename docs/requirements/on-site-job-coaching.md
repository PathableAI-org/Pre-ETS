# On-site job-coaching service records

These proposed requirements derive from the maintainer-supplied **Initial on-site job-coaching service-record
workflow handoff**, provided on 2026-10-06, and the source review below. Drafting does not approve the obligations:
PREETS-ONSITE-001 through PREETS-ONSITE-008 remain `proposed` and `unverified`.

## Scope and product direction

This first workflow-specific area covers a coach recording an on-site job-coaching visit for a participant,
returning to their own records, updating them, and deleting them with immediate undo. A service record documents
a service event; it is not the full monthly progress report represented by the source form.

The current product decisions supplied in the handoff are the basis for the proposals below: capture the current
user and start time when starting a record; capture end time on an explicit action; permit time correction;
keep visit narratives optional; make the created record durable; allow subsequent updates without submission
or approval; limit this slice to the user's own records; and retain deleted records with immediate undo.
These are product directions, not findings that CVR has validated or already accepted register obligations.

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
- **Form:** [On-Site Progress Report.docx](https://drive.google.com/file/d/1HapgjYe1Q61FUgWzcEI4mRgUNyRy3T46/view),
  internally titled **Job Coaching Progress Report & Service Log**; reviewed as extracted text on 2026-10-06.
  The visit-log section contains date, coach, start/end, total, purpose of visit, observations, interventions,
  and next steps. The larger form also contains consumer/employment information, a monthly intervention plan,
  total hours, and coach/supervisor signatures. Field presence establishes what the artifact captures, not
  which fields are mandatory in practice or a required digital approval process. Visual layout and current
  template authority were not verified. Totals and monthly content are not adopted as obligations here.
- **Research:** [First Client Discovery — Forms & Documents](https://app.notion.com/p/3d87cbd04b6d80599084ce030fd54fce),
  “Evidence standard”; [02 — Business Processes & Handoffs](https://app.notion.com/p/3d87cbd04b6d8180a8b3ce28a300620b),
  “Placement, stabilization and continuing support” and “Authorization, reporting and billing”; and
  [05 — Discovery Questions & Validation Agenda](https://app.notion.com/p/3d87cbd04b6d812e8015cc461ed2d44d),
  “P1 — answer before designing the first workflow” and “Systems”; reviewed on 2026-10-06. They distinguish
  document evidence, inference, and unresolved operational questions. Report/submission and authorization
  concepts do not automatically become requirements for an individual service record.
- **Earlier design:** [08 — Consumer Service Log Database Blueprint](https://app.notion.com/p/3eb7cbd04b6d8160a3c0ce78e586ad5b),
  “Scope and naming,” “Business workflow,” and “Security and integrity rules”; reviewed on 2026-10-06.
  It explicitly requires SME validation and proposes broader models, approvals, finalized-report locking, and
  technical choices. This handoff scopes those ideas out of the initial record workflow. No accepted obligation
  is replaced by following the handoff; this proposal does not endorse or revise the blueprint.
- **Repository baseline:** GitHub `main` at `62972698fdad9fb7f73f825dc9ac066874948cd9`, fetched on 2026-10-06.
  The register guide, template, and existing areas were inspected before allocating IDs; no on-site workflow
  obligation was registered there. GitHub remains authoritative for product requirements and implementation
  state. This source review establishes no delivery or behavioral verification claim.

The planned CRV discovery engagement did not proceed and client SMEs are currently unavailable, according to
the handoff. Supplied forms and industry experience inform hypotheses; neither substitutes for independent
validation. The sources name the organization **Center for Vocational Rehabilitation (CVR)**; the handoff
uses **CRV**. This document preserves that attribution without treating the spelling difference as a second client.
**Project Reference Links.txt** was named but not supplied with an accessible location. Drive search did not
locate it; its contents were not reviewed. The form and linked research above were accessed directly.
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
- Which forms and fields are current and mandatory for CVR? What approvals/signatures apply to later reports?
  Optional narratives and absence of submission gates are current slice decisions, not claims about compliance
  with every paper-reporting obligation.
- How should time correction handle dates, time zones, overnight visits, invalid ordering, and concurrent changes?
  Agree validation and failure outcomes before delivering the affected interactions; no rounding or billing rule
  is inferred from the form's totals.
- How is a successful creation/update communicated, and when are edits saved? Decide save interaction, failed
  write/retry behavior, and concurrent-edit behavior before delivery. Durability of created records and successful
  updates is required below; per-keystroke autosave and offline operation are not established by this handoff.
- What makes immediate undo usable, how long is it available, and what happens on navigation or session expiry?
  Define the opportunity before delivering deletion. Later recovery, retention, purge authority, and permanent
  deletion remain discovery questions; normal workflow deletion must preserve the underlying record.

## Related requirements and current contracts

On GitHub main, [PREETS-SESSION-001](session-management.md#preets-session-001),
[PREETS-SESSION-003](session-management.md#preets-session-003), and
[PREETS-SESSION-005](session-management.md#preets-session-005) are accepted requirements for protected access,
user/tenant identity, and tenant binding. Their acceptance does not establish implementation.
Record access must respect those boundaries without treating a matching tenant as permission to access another
coach's records. Participant association and record ownership need application authorization decisions before delivery.

[Session state and domain persistence](../domain-persistence.md), “When the line is crossed,” provides current
engineering context for durable domain instances. This proposal requires durability from creation even while
narratives or end time are incomplete. It introduces no final-submit transition or persistence technology.

## PREETS-ONSITE-001

**Title:** Create a participant-associated record
**Classification:** Functional Requirement
**Lifecycle:** proposed
**Verification:** unverified

### Statement

A coach must be able to start an on-site job-coaching service record associated with the participant receiving the service, with the current authenticated user captured as the coach and the current time captured as the service start.

### Rationale and sources

Starting with known identity and time reduces paperwork before documenting the visit.

- Source: Handoff steps 1–2; Form, consumer information and visit-log date/coach/start fields. Source labels refer to the reviewed material above.
- Decision: Pending requirements review and maintainer acceptance; the handoff supplies the proposed product direction.

### Acceptance criteria

1. A coach can create an on-site record for the participant receiving the service, and the created record identifies that participant.
2. Starting the record captures the current authenticated user as coach and the current date/time as the service start without requiring manual coach or start-time entry.
3. Creation is possible before an end time or any of the four narrative values has been entered.

### Open questions

Participant source and association interaction are unresolved; multiple participants and on-behalf-of creation remain discovery questions.

### Verification evidence

No reviewed, executed evidence has been recorded. Source review does not establish product behavior.

## PREETS-ONSITE-002

**Title:** Capture and correct service times
**Classification:** Functional Requirement
**Lifecycle:** proposed
**Verification:** unverified

### Statement

A coach must be able to explicitly indicate that service has ended and have the current time captured as the end time, and must be able to edit the start and end times to reflect the service that actually occurred.

### Rationale and sources

The coach can capture the end without watching the clock while retaining the ability to correct recorded time.

- Source: Handoff steps 3–4; Form, visit-log start/end fields. Source labels refer to the reviewed material above.
- Decision: Pending requirements review and maintainer acceptance; the handoff supplies the proposed product direction.

### Acceptance criteria

1. On a record without an end time, the coach can explicitly indicate that service has ended; the record captures the current date/time as its end without manual time entry.
2. The coach can change the recorded start time and the recorded end time, including values initially captured automatically.
3. After a successful update, reopening the record displays the corrected times rather than reverting to the automatically captured values.
4. Recording an end time does not prevent subsequent editing or require submission or approval.

### Open questions

Date/time interpretation, validation, repeat end actions, and concurrent changes need decisions before delivery. No service-hour calculation or billable-time rule is established.

### Verification evidence

No reviewed, executed evidence has been recorded. Source review does not establish product behavior.

## PREETS-ONSITE-003

**Title:** Optional visit narratives
**Classification:** Functional Requirement
**Lifecycle:** proposed
**Verification:** unverified

### Statement

A coach must be able to document purpose of visit, observations, interventions, and next steps as independently optional free-text values on an on-site service record.

### Rationale and sources

These fields preserve familiar visit-log meaning without adding unsupported mandatory documentation gates.

- Source: Handoff step 5; Form, visit-log narrative column headings. Source labels refer to the reviewed material above.
- Decision: Pending requirements review and maintainer acceptance; the handoff supplies the proposed product direction.

### Acceptance criteria

1. The record supports separately identifiable free-text values for purpose of visit, observations, interventions, and next steps.
2. The coach can leave any or all four values empty when creating or updating a record.
3. The coach can enter, revise, and clear each narrative value independently without completing the other narratives.
4. A populated narrative is not required to capture service end or retain the record.

### Open questions

CVR mandatory-field expectations remain unvalidated; optionality is the supplied product decision for this slice. Content limits and failure outcomes need design before delivery.

### Verification evidence

No reviewed, executed evidence has been recorded. Source review does not establish product behavior.

## PREETS-ONSITE-004

**Title:** Durable records from creation
**Classification:** Functional Requirement
**Lifecycle:** proposed
**Verification:** unverified

### Statement

A coach’s created on-site service record and its successful updates must remain retrievable independently of the browser or authentication session in which they were created.

### Rationale and sources

A real service event already exists while the coach is documenting it; incomplete documentation must not make the entire record temporary.

- Source: Handoff steps 6–7; current domain-persistence context, “When the line is crossed.” Source labels refer to the reviewed material above.
- Decision: Pending requirements review and maintainer acceptance; the handoff supplies the proposed product direction.

### Acceptance criteria

1. A successfully created record remains retrievable after reload, browser closure, and a new authenticated session by the same user in the same tenant.
2. That durability applies when the record has no end time and all narratives are empty.
3. Successfully updated times and narratives remain available after reopening in a new authenticated session.
4. Session expiry or logout does not delete the created record or its successful updates.
5. No submission, approval, or completed-form transition is required to make the created record durable.

### Open questions

Save interaction and failure/retry outcomes need decisions before delivery. This promise does not establish durability for every unsaved keystroke. Deletion visibility follows PREETS-ONSITE-007.

### Verification evidence

No reviewed, executed evidence has been recorded. Source review does not establish product behavior.

## PREETS-ONSITE-005

**Title:** Find and access one’s own records
**Classification:** Functional Requirement
**Lifecycle:** proposed
**Verification:** unverified

### Statement

A coach must be able to see their previously created on-site service records and open an individual record for review; this slice must limit record visibility and access to the user’s own records.

### Rationale and sources

Coaches need continuity across visits; deferring team access must not silently grant access to others’ records.

- Source: Handoff steps 8–9. Source labels refer to the reviewed material above.
- Decision: Pending requirements review and maintainer acceptance; the handoff supplies the proposed product direction.

### Acceptance criteria

1. The coach can find their previously created, non-deleted on-site records, including records without an end time or narratives.
2. The coach can open an individual record and review its participant, coach, service times, and any recorded narratives.
3. Another user’s records are absent from the coach’s ordinary views.
4. A user cannot obtain another user’s record by opening it directly or requesting it through an application access path, even within the same tenant.

### Open questions

Record-list presentation and navigation need design. Supervisor/team visibility and organizational authorization models are deferred; no such access is granted by this slice.

### Verification evidence

No reviewed, executed evidence has been recorded. Source review does not establish product behavior.

## PREETS-ONSITE-006

**Title:** Update an existing record without approval gates
**Classification:** Functional Requirement
**Lifecycle:** proposed
**Verification:** unverified

### Statement

A coach must be able to reopen and update their own non-deleted on-site service record without a submission or approval lifecycle.

### Rationale and sources

The service record can be corrected as understanding develops without importing monthly-report governance.

- Source: Handoff steps 7–8. Source labels refer to the reviewed material above.
- Decision: Pending requirements review and maintainer acceptance; the handoff supplies the proposed product direction.

### Acceptance criteria

1. After creating and leaving a record, the coach can reopen it and update service times and optional narratives.
2. Successful changes update the existing record rather than requiring a replacement record to be created.
3. Editing remains available after an end time is recorded.
4. The workflow does not require draft/submitted/approved states, supervisor approval, signatures, or locking to create, review, or update the record.

### Open questions

Participant-association correction and coach reassignment are not settled. Save, conflict, and failure behavior need decisions before delivery.

### Verification evidence

No reviewed, executed evidence has been recorded. Source review does not establish product behavior.

## PREETS-ONSITE-007

**Title:** Delete from ordinary workflow without destroying the record
**Classification:** Functional Requirement
**Lifecycle:** proposed
**Verification:** unverified

### Statement

A coach must be able to delete their own on-site service record from the normal workflow, removing it from ordinary views while preserving the underlying record.

### Rationale and sources

Users can remove unwanted records while preserving the possibility of undo and future recovery decisions.

- Source: Handoff step 10. Source labels refer to the reviewed material above.
- Decision: Pending requirements review and maintainer acceptance; the handoff supplies the proposed product direction.

### Acceptance criteria

1. The coach can delete their own record from the normal record workflow.
2. After successful deletion, the record is absent from the coach’s ordinary record views, including after reload or a new authenticated session.
3. Deletion preserves the record and its participant/coach association, recorded times, and narratives.
4. Normal workflow deletion does not permanently destroy the underlying record.

### Open questions

Direct access to a deleted record, retention, later recovery, and permanent deletion policy remain unresolved. Immediate undo is specified separately in PREETS-ONSITE-008.

### Verification evidence

No reviewed, executed evidence has been recorded. Source review does not establish product behavior.

## PREETS-ONSITE-008

**Title:** Immediate deletion undo
**Classification:** Functional Requirement
**Lifecycle:** proposed
**Verification:** unverified

### Statement

Immediately after deleting their own on-site service record, a coach must have an opportunity to undo that deletion and restore the record to ordinary views.

### Rationale and sources

An accidental deletion can be reversed in the workflow without introducing a general trash interface.

- Source: Handoff step 10. Source labels refer to the reviewed material above.
- Decision: Pending requirements review and maintainer acceptance; the handoff supplies the proposed product direction.

### Acceptance criteria

1. Successful deletion immediately presents an undo opportunity within the current workflow.
2. Using that opportunity restores the same record to ordinary views with its participant/coach association, times, and narratives intact.
3. The restored record can again be opened, reviewed, and edited by its owner.
4. Immediate undo does not require finding a separate trash/recovery interface.

### Open questions

Undo duration, interaction and accessibility, navigation/session-expiry behavior, and failed undo outcomes need decisions before delivery. A later recovery interface is out of scope.

### Verification evidence

No reviewed, executed evidence has been recorded. Source review does not establish product behavior.
