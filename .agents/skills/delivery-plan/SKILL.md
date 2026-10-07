---
name: delivery-plan
description: Create or update a repo-local delivery plan from accepted Pre-ETS requirements, proposing coherent issues without publishing them. Independent of Spec Kit.
---

# Delivery plan

Follow the [requirements guide](../../../docs/requirements/README.md#author-a-requirement)’s public-source
attribution rule: never name a specific partner or client in public repository artifacts or GitHub titles/bodies.
Use generic attribution and check prose, examples, quotations, filenames, link labels, and URLs for identifying
names or abbreviations. Preserve evidence meaning and approval boundaries without publishing the identity.

Read the [delivery guide](../../../docs/delivery/README.md), [plan template](../../../docs/delivery/templates/plan.md),
[requirements guide](../../../docs/requirements/README.md), and [issue template](../../../.github/ISSUE_TEMPLATE/delivery.md).
These own format, authority, states, and coverage conventions.

Read requested entries, related requirements, implementation dependencies, and approved constraints. Resolve selected
ACs from the register; proposed and retired entries are dependency/history context, not accepted implementation scope.
Ask about material intent conflicts; independent work can proceed with explicit blockers. Do not invent policy.

Inspect relevant architecture, current implementation, assertions and execution evidence, and existing plans/issues.
Use read-only GitHub access when available; report unavailable access or incomplete searches. Existing code can reduce
remaining work but does not establish requirement satisfaction or verification. Record revision and inspection limits.
Respect workspace routing when inspecting Effect design. Do not demand historical Spec Kit synchronization.

Before decomposing work, identify the observations and harnesses needed by planned verification. Order enabling
observability before behavior that relies on it; prefer small independently testable increments when they avoid
throwaway tests. For each slice name the observable increment, evidence available at completion, tests/harness
carried forward, and requirement conditions still incomplete. Tests may establish a narrower public-service claim;
not every slice must complete the overall requirement verification plan. Temporary responses must observe real
application behavior, have a named replacement step, and must not be presented as the final contract. Preserve
security prerequisites and distinguish intermediate mergeability from final shipping readiness.

Create or update a draft plan under docs/delivery and index it in the guide. Preserve existing issue links and approval
history. Group work into outcomes with local slice IDs, exact criterion coverage, included/excluded conditions, real
sequencing dependencies, shipping gates, and issue-ready proposals. Use the issue template and source-pinned full URLs
inside issue bodies. Keep parent containment distinct from blocking. Explain enabling work and any separate shared
verification slice through the supported accepted criteria.

Read [Testing as evidence](../../../docs/engineering/testing/README.md). Identify plausible responsible evidence
boundaries and limitations without fabricating executions. Account for every selected AC, including partial coverage,
blocked paths, justified deferrals, and any actual reviewed evidence. Review links, duplication, coverage, and issue
coherence; report remaining decisions. Leave approval pending unless a maintainer decision is explicitly supplied.

Stay within delivery documentation. Do not approve decomposition, alter requirements, implement code/tests, change
Spec Kit, commit automatically, write to GitHub, or introduce RTM/Projects automation. Planning authorization is not
publication authorization. Report changed artifacts, coverage gaps, decisions, and evidence/access limitations.
