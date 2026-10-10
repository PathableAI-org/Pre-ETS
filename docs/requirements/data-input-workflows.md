# Generalized data-input workflows

Non-trivial product data in this workflow is assumed to be PHI under maintainer direction on 2026-10-09.
[HIPAA protection of product data](hipaa.md#scope-and-regulatory-basis) supplies the cross-cutting software
safeguards; operational requirements are deferred separately. This includes incomplete input, deleted records, identifying diagnostics,
and backups. Workflow deferrals do not waive applicable regulatory safeguards; ordinary editing and undo are
not substitutes for authorized amendment, audit, or retention processes.

## Scope and applicability

This area owns shared behavior for server-dependent record-entry workflows. On 2026-10-09 the maintainer
requested separation of generalized data-input requirements from on-site-specific requirements. The obligations
below originated in the on-site proposal; their existing IDs are preserved despite the historical area prefix.
Future requirements in this area use PREETS-INPUT IDs. Moving these proposals does not approve or verify them.

Heartbeat connectivity protection applies to server-dependent data-input forms. Durability from creation,
non-destructive deletion, and immediate undo apply to workflows that explicitly adopt those capabilities in
their area requirements. [On-site job-coaching](on-site-job-coaching.md#shared-data-input-requirements) adopts
all four. No deletion capability, owner-only policy, optional-field policy, or absence of approval gates is
imposed on other workflows merely because they contain inputs.

## Sources and delivery decisions

The initial workflow handoff and source review are documented in
[On-site sources and evidence limitations](on-site-job-coaching.md#sources-and-evidence-limitations).
The maintainer’s 2026-10-09 clarification supplies the heartbeat endpoint direction, and the subsequent
separation request supplies the generalized scope. Neither establishes source-provider validation.

Before delivering affected interactions, the product maintainer and application/UI delivery owners must name
responsible individuals and decide save acknowledgement, failure/retry and concurrency behavior; heartbeat
intervals, thresholds and initial-state behavior; and undo duration, keyboard/focus/announcements, navigation,
session expiry and failure outcomes. Adopting workflows define their field validation, record authorization,
and handling of unsaved values and pending writes. No autosave, offline queue, retention period, later recovery,
or permanent-deletion mechanism is selected here.

Protected access, tenant binding, and session expiration follow the accepted
[session requirements](session-management.md). Background heartbeats must not count as qualifying activity
under [PREETS-SESSION-009](session-management.md#preets-session-009). Shared behavior never expands a workflow’s
authorization policy. Evidence remains specific to the exercised workflow and application/persistence boundary;
verification in one workflow does not by itself verify every adopter.

## PREETS-ONSITE-004

**Title:** Durable records from creation
**Classification:** Functional Requirement
**Lifecycle:** proposed
**Verification:** unverified

### Statement

An authorized user’s created workflow record and its successful updates must remain retrievable independently of the browser, authentication session, or application process in which they were created.

### Rationale and sources

Once a workflow record has been successfully created, incomplete optional values must not make that record temporary.

- Source: Handoff steps 6–7; current domain-persistence context, “When the line is crossed.” Source labels refer to the source review in [On-site job-coaching service records](on-site-job-coaching.md#sources-and-evidence-limitations).
- Refinement: Maintainer-requested assessment changes (2026-10-09) clarify process-independent durability; approval and executed verification remain pending.
- Scope refinement: Maintainer request (2026-10-09) separates shared data-input behavior from on-site policies; the historical ID is retained.
- Decision: Pending requirements review and maintainer acceptance; the handoff supplies the proposed product direction.

### Acceptance criteria

1. A successfully created record remains retrievable after reload, browser closure, and a new authenticated session by the same authorized user in the same tenant.
2. That durability applies when the record has incomplete optional workflow values.
3. Successfully updated workflow values remain available after reopening in a new authenticated session.
4. Session expiry or logout does not delete the created record or its successful updates.
5. For workflows adopting durability from creation, no submission, approval, or completed-form transition is required to make the created record durable; later workflow approval rules remain separately defined.
6. Successfully created records and successful updates remain retrievable by an authorized user in the same tenant after a backend restart or equivalent replacement of the application process, including records with incomplete optional workflow values.

### Open questions

Save interaction and failure/retry outcomes need decisions before delivery. This promise does not establish durability for every unsaved keystroke. Deletion visibility follows PREETS-ONSITE-007.

### Verification plan

Planned evidence only: create an incomplete record and successfully update another record through the real
application/persistence path. Restart or replace the backend process, then retrieve both through fresh
application access as the same user and tenant and compare identity, associations, and workflow values. Exercise the real
persistence adapter; test-owned collections, canned adapters, browser reloads, and authentication changes alone
do not establish survival across this boundary. This does not establish backup recovery or disaster tolerance.

### Related requirements

Applied by [On-site job-coaching service records](on-site-job-coaching.md#shared-data-input-requirements).

### Verification evidence

No reviewed, executed evidence has been recorded. Source review does not establish product behavior.

## PREETS-ONSITE-007

**Title:** Delete from ordinary workflow without destroying the record
**Classification:** Functional Requirement
**Lifecycle:** proposed
**Verification:** unverified

### Statement

An authorized user must be able to delete a workflow record they are permitted to delete from the normal workflow, removing it from ordinary views while preserving the underlying record.

### Rationale and sources

Users can remove unwanted records while preserving the possibility of undo and future recovery decisions.

- Source: Handoff step 10. Source labels refer to the source review in [On-site job-coaching service records](on-site-job-coaching.md#sources-and-evidence-limitations).
- Scope refinement: Maintainer request (2026-10-09) separates shared data-input behavior from on-site policies; the historical ID is retained.
- Decision: Pending requirements review and maintainer acceptance; the handoff supplies the proposed product direction.

### Acceptance criteria

1. The authorized user can delete the record from the normal record workflow.
2. After successful deletion, the record is absent from the authorized user’s ordinary record views, including after reload or a new authenticated session.
3. Deletion preserves the record and its workflow associations and recorded values.
4. Normal workflow deletion does not permanently destroy the underlying record.

### Open questions

Direct access to a deleted record, retention, later recovery, and permanent deletion policy remain unresolved. Immediate undo is specified separately in PREETS-ONSITE-008.

### Related requirements

Applied by [On-site job-coaching service records](on-site-job-coaching.md#shared-data-input-requirements).

### Verification evidence

No reviewed, executed evidence has been recorded. Source review does not establish product behavior.

## PREETS-ONSITE-008

**Title:** Immediate deletion undo
**Classification:** Functional Requirement
**Lifecycle:** proposed
**Verification:** unverified

### Statement

Immediately after deleting a workflow record they are permitted to delete, an authorized user must have an opportunity to undo that deletion and restore the record to ordinary views.

### Rationale and sources

An accidental deletion can be reversed in the workflow without introducing a general trash interface.

- Source: Handoff step 10. Source labels refer to the source review in [On-site job-coaching service records](on-site-job-coaching.md#sources-and-evidence-limitations).
- Scope refinement: Maintainer request (2026-10-09) separates shared data-input behavior from on-site policies; the historical ID is retained.
- Decision: Pending requirements review and maintainer acceptance; the handoff supplies the proposed product direction.

### Acceptance criteria

1. Successful deletion immediately presents an undo opportunity within the current workflow.
2. Using that opportunity restores the same record to ordinary views with its workflow associations and recorded values intact.
3. The restored record can again be opened, reviewed, and edited by an authorized user.
4. Immediate undo does not require finding a separate trash/recovery interface.

### Open questions

Undo duration, interaction and accessibility, navigation/session-expiry behavior, and failed undo outcomes need decisions before delivery. A later recovery interface is out of scope.

### Related requirements

Applied by [On-site job-coaching service records](on-site-job-coaching.md#shared-data-input-requirements).

### Verification evidence

No reviewed, executed evidence has been recorded. Source review does not establish product behavior.

## PREETS-ONSITE-009

**Title:** Disable form inputs during detected connectivity failure
**Classification:** Functional Requirement
**Lifecycle:** proposed
**Verification:** unverified

### Statement

While an authorized user is using a server-dependent data-input form, the application must monitor connectivity through a
heartbeat endpoint, disable form inputs when that monitoring detects a connectivity failure, and re-enable
those inputs once connectivity is restored and authenticated access remains valid.

### Rationale and sources

The user needs to know when the application cannot communicate with the server before continuing form entry.

- Source: Maintainer clarification (2026-10-09): a heartbeat endpoint must detect network issues and disable form inputs until they are resolved.
- Scope refinement: Maintainer request (2026-10-09) separates shared data-input behavior from on-site policies; the historical ID is retained.
- Decision: Pending requirements review and maintainer acceptance; this clarification supplies the proposed behavior and endpoint constraint.

### Acceptance criteria

1. The application provides a heartbeat endpoint and monitors communication with it while the data-input form is in use.
2. When heartbeat monitoring detects a connectivity failure, form inputs become disabled and cannot be edited through pointer, keyboard, or touch interaction.
3. The form communicates the connectivity problem and disabled state accessibly, including an announcement for assistive technology users.
4. Once heartbeat monitoring establishes restored connectivity, form inputs become usable again if authenticated access remains valid; recovery does not bypass logout or session expiration.
5. Automatic heartbeat requests do not renew the idle deadline, consistent with [PREETS-SESSION-009](session-management.md#preets-session-009).
6. A successful heartbeat does not represent confirmation that a record creation or update has been saved; write success remains independently established under the adopting workflow’s save contract, including PREETS-ONSITE-004 where adopted.

### Design constraints

A heartbeat endpoint is explicitly requested. Its route, response contract, authentication behavior, and polling
mechanism remain design decisions; successful communication alone does not establish persistence availability.

### Open questions

Polling interval, timeout and failure/recovery thresholds; initial connectivity-check behavior; which service
failures count as connectivity failures; pending-write handling and the treatment of unsaved values; the scope
of other actions during the disabled state; and focus/announcement behavior during failure and recovery require
bounded decisions. Offline editing or queuing is not established by this requirement.

### Implementation dependencies

The product maintainer, with the UI and application delivery owners, must record the above decisions before
this form interaction is delivered. Named individuals remain to be assigned. Apply accepted protected-access
and session-expiration requirements throughout failure and recovery.

### Verification plan

Planned evidence only: exercise the real form and heartbeat path with controlled communication failure and
recovery. Establish that inputs cannot be edited through semantic interactions while disabled and become usable
after recovery; inspect focus and announcements. Separately exercise an expired or logged-out session during
recovery and observe continued access protection. Observe the authoritative idle deadline while automatic
heartbeats run. Distinguish a reachable heartbeat from a failed record write. These checks do not establish
that every possible network or persistence failure is detected.

### Related requirements

Applied by [On-site job-coaching service records](on-site-job-coaching.md#shared-data-input-requirements).

### Verification evidence

No reviewed, executed evidence has been recorded. Planned verification does not change the verification value.
