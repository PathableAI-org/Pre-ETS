---
name: delivery-review
description: Review Pre-ETS delivery plans and proposed issue decomposition against accepted criteria, dependencies, and evidence boundaries. Report findings without editing by default.
---

# Delivery review

Read the [delivery guide](../../../docs/delivery/README.md), [plan template](../../../docs/delivery/templates/plan.md),
[issue template](../../../.github/ISSUE_TEMPLATE/delivery.md), [requirements guide](../../../docs/requirements/README.md),
and [Testing as evidence](../../../docs/engineering/testing/README.md). Review requested plans and their source entries.

Check each selected AC against the recorded requirement revision and current accepted promise. Trace all selected
criteria to work, reviewed evidence, an explicit blocker, or justified deferral. Check partial conditions and ensure
proposed/retired requirements have not become accepted scope. Respect approved design constraints and workspace ownership.
Historical specs are context; do not request synchronization or override the register with old behavior.

Assess independently understandable outcomes, supported enabling work, included/excluded scope, issue-ready bodies,
valid links, and justified shared verification slices. Check dependency targets, cycles, real sequencing, and shipping
prerequisites. Parent containment does not imply blocking. Verify existing issue links and inspect duplicates with
read-only access when available; record incomplete access as a limitation, not proof of absence.

Walk the proposed execution order using only observations available at each step. Flag evidence that depends on
a later endpoint, harness, or integration; suggest moving that enabling work earlier or choosing a distinct useful
boundary. Check each observable increment, retained tests/harness, incomplete claims, and the convergence to final
verification. Temporary assertions may evolve, but disposable suites need justification. Check that intermediate
responses exercise real configuration/request behavior, have an explicit replacement step, and do not claim final
contract satisfaction. Security gates must precede disclosure. Do not require every slice to execute the entire
requirement verification plan or duplicate evidence at every layer.

Inspect implementation observations and any claimed evidence. Existing code, test links, planned tools, static
checks, issue closure, and agent review do not establish runtime verification. Evidence must name its consumer,
responsible boundary, covered conditions, execution reference, and limitations. Flag invented policy and approval;
explicit unresolved policy and unverified requirements are legitimate gaps. Check state transitions and preserved
approval/issue history when plans change.

Return actionable findings with plan location, slice/requirement AC, consequence, and suggested correction. Separate
confirmed defects, unresolved decisions, and assessment limits. If no defects remain, say so within the review scope.
Do not edit by default; requested corrections remain delivery-document changes. Do not approve plans, alter requirements,
implement code/tests, commit automatically, publish GitHub changes, or add Spec Kit integration or RTM/Projects tooling.
