---
id: PREETS-ONSITE-009
classifications:
  - Functional
dependencies:
  - PREETS-SESSION-009
---

# Disable form inputs during detected connectivity failure

## Description

While an authorized user is using a server-dependent data-input form, the application must monitor connectivity through a
heartbeat endpoint, disable form inputs when that monitoring detects a connectivity failure, and re-enable
those inputs once connectivity is restored and authenticated access remains valid.

## Rationale

The user needs to know when the application cannot communicate with the server before continuing form entry.

## Sources

- Source: Maintainer clarification (2026-10-09): a heartbeat endpoint must detect network issues and disable form inputs until they are resolved.
- Scope refinement: Maintainer request (2026-10-09) separates shared data-input behavior from on-site policies; the historical ID is retained.
- Product direction: this clarification supplies the proposed behavior and endpoint constraint.

## Acceptance criteria

1. The application provides a heartbeat endpoint and monitors communication with it while the data-input form is in use.
2. When heartbeat monitoring detects a connectivity failure, form inputs become disabled and cannot be edited through pointer, keyboard, or touch interaction.
3. The form communicates the connectivity problem and disabled state accessibly, including an announcement for assistive technology users.
4. Once heartbeat monitoring establishes restored connectivity, form inputs become usable again if authenticated access remains valid; recovery does not bypass logout or session expiration.
5. Automatic heartbeat requests do not renew the idle deadline, consistent with [PREETS-SESSION-009](../session/PREETS-SESSION-009.md).
6. A successful heartbeat does not represent confirmation that a record creation or update has been saved; write success remains independently established under the adopting workflow’s save contract, including PREETS-ONSITE-004 where adopted.

## Design constraints

A heartbeat endpoint is explicitly requested. Its route, response contract, authentication behavior, and polling
mechanism remain design decisions; successful communication alone does not establish persistence availability.

## Open questions

Polling interval, timeout and failure/recovery thresholds; initial connectivity-check behavior; which service
failures count as connectivity failures; pending-write handling and the treatment of unsaved values; the scope
of other actions during the disabled state; and focus/announcement behavior during failure and recovery require
bounded decisions. Offline editing or queuing is not established by this requirement.

## Implementation dependencies

The product maintainer, with the UI and application delivery owners, must record the above decisions before
this form interaction is delivered. Named individuals remain to be assigned. Apply accepted protected-access
and session-expiration requirements throughout failure and recovery.

## Related requirements

Applied by [On-site job-coaching service records](../context/on-site-job-coaching.md#shared-data-input-requirements).

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Verification Plan

Browser/application Gherkin evidence under controlled heartbeat communication failure and recovery demonstrates input disabling across pointer, keyboard, and touch interaction, accessible communication, and re-enabling only with valid authenticated access. Manual accessibility evidence addresses announcements and focus under the selected interaction contract. Authoritative session evidence demonstrates that automatic heartbeats do not renew idle expiry; independent write evidence distinguishes heartbeat reachability from successful persistence. Thresholds and failure scope remain unresolved; finite cases do not establish detection of every network or storage failure.

Unresolved verification conditions follow the Open questions and shared context. The plan establishes no executed result or compliance claim.

## Shared context

The [shared data-input applicability and delivery decisions](../context/data-input-workflows.md) qualify this contract.
