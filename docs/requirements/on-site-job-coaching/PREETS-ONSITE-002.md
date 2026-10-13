---
id: PREETS-ONSITE-002
classifications:
  - Functional
---

# Capture and correct service times

## Description

A coach must be able to explicitly indicate that service has ended and have the current time captured as the end time, and must be able to edit the start and end times to reflect the service that actually occurred.

## Rationale

The coach can capture the end without watching the clock while retaining the ability to correct recorded time.

## Sources

- Source: Handoff steps 3–4; Form, visit-log start/end fields. Source labels refer to the shared source context linked below.
- Product direction: the handoff supplies the proposed product direction.

## Acceptance criteria

1. On a record without an end time, the coach can explicitly indicate that service has ended; the record captures the current date/time as its end without manual time entry.
2. The coach can change the recorded start time and the recorded end time, including values initially captured automatically.
3. After a successful update, reopening the record displays the corrected times rather than reverting to the automatically captured values.
4. Recording an end time does not prevent subsequent editing or require submission or approval.

## Open questions

Date/time interpretation, validation, repeat end actions, and concurrent changes need decisions before delivery. No service-hour calculation or billable-time rule is established.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Verification Plan

Application and browser Gherkin/BDD evidence demonstrates explicit end capture, correction of both service times, retention of successful corrections on reopening, and continued editing without submission or approval. Date/time, validation, repeated-action, and concurrency decisions remain verification conditions; no billable-time or duration-calculation claim is made.

Unresolved verification conditions follow the Open questions and shared context. The plan establishes no executed result or compliance claim.

## Shared context

The [on-site scope, source review, adoption, and delivery gates](../context/on-site-job-coaching.md) qualify this contract.
