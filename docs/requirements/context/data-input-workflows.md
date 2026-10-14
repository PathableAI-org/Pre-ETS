# Generalized data-input workflows

Non-trivial product data in this workflow is assumed to be PHI under maintainer direction on 2026-10-09.
[HIPAA protection of product data](hipaa.md#scope-and-regulatory-basis) supplies the cross-cutting software
safeguards; operational requirements are deferred separately. This includes incomplete input, deleted records, identifying diagnostics,
and backups. Workflow deferrals do not waive applicable regulatory safeguards; ordinary editing and undo are
not substitutes for authorized amendment, audit, or retention processes.

## Scope and applicability

This area owns shared behavior for server-dependent record-entry workflows. On 2026-10-09 the maintainer
requested separation of generalized data-input requirements from on-site-specific requirements. The shared obligations
originated in the on-site proposal; their existing IDs are preserved despite the historical area prefix.
Future requirements in this area use PREETS-INPUT IDs. Moving these proposals does not approve or verify them.

Heartbeat connectivity protection applies to server-dependent data-input forms. Durability from creation,
non-destructive deletion, and immediate undo apply to workflows that explicitly adopt those capabilities in
their workflow requirements. [On-site job-coaching](on-site-job-coaching.md#shared-data-input-requirements) adopts
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
[session requirements](../session/). Background heartbeats must not count as qualifying activity
under [PREETS-SESSION-009](../session/PREETS-SESSION-009.md). Shared behavior never expands a workflow’s
authorization policy. Evidence remains specific to the exercised workflow and application/persistence boundary;
verification in one workflow does not by itself verify every adopter.
