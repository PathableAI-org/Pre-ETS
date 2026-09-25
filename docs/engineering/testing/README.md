# Testing as evidence

This guide helps humans and agents choose tests for Pre-ETS. Start with the expectation someone depends on,
then choose evidence that could reveal a meaningful violation. For a practical introduction to generated tests,
read [Property-based testing with fast-check](property-based-testing.md).

## From a consumer to evidence

Use this sequence when planning a change:

**Consumer → claim → possible violation → evidence → limitations**

An invariant is an expectation that remains true under stated conditions. For example, qualifying activity
must preserve a session's absolute expiry. The consumer is the session policy enforcement code; the violation
is activity extending the maximum lifetime; a property test can compare expiry before and after the transformation.
That evidence says nothing by itself about whether Redis stores the result correctly or the browser enforces access.

State the conditions as carefully as the outcome. “Activity cannot revive an expired session” belongs to the
operation that checks validity and updates stored state. It is not a promise made by every helper that touches
activity timestamps. Missing records, anonymous sessions, and authenticated sessions can have different rules.

A test is useful when it would fail for a meaningful violation of its claim. Passing supports that claim only
within the exercised inputs, dependencies, observations, and assumptions. Neither examples nor ordinary finite
property-test runs constitute a mathematical proof.

## Meaning before coverage

Coverage can point to unexplored code. It cannot tell us whether assertions protect tenant isolation, expiration,
or a user's ability to recover access. Executing every line with weak assertions can leave all three unprotected.
A function, class, branch, or architectural layer does not create a testing obligation merely by existing.

Choose the smallest boundary that produces convincing evidence. Add broader checks when composition, real
infrastructure, or a user's experience introduces a distinct uncertainty. Two tests about the same feature can
protect different expectations; two tests at different layers can still repeat the same weak observation.

Prefer semantic assertions that survive an implementation change. A recovery test should establish that a user
can regain access through the intended interaction. The presence of a button, a particular DOM ancestry, or the
use of a particular messaging API does not establish that outcome. Follow the
[constitution's meaningful behavioral testing rules](../../../.specify/memory/constitution.md).

## Choose a boundary for the claim

These are examples of evidence to select, not a mandatory suite for every change or a claim that every obligation
is already covered. Read the [session contract](../../session-state.md), [tenant contract](../../multi-tenancy.md),
and current tests before deciding what is missing.

| Consumer and claim                                                | Meaningful violation                                              | Suitable evidence                                                           | What it does not establish                                        |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Session policy: activity preserves absolute expiry                | Activity extends maximum access lifetime                          | A property over the session transformation, plus explicit deadline examples | Stored updates, concurrent requests, or browser behavior          |
| Tenant: requests cannot use another tenant's session              | A session for one host grants access on another                   | Tenant resolution checks and real HTTP isolation scenarios                  | Every deployment proxy or host configuration                      |
| HTTP consumer: invalid access receives the documented outcome     | A protected request succeeds or returns the wrong redirect/status | Actual responses at the HTTP boundary                                       | What the user sees or whether recovery works                      |
| Session store: expiration remains authoritative during renewal    | Late or racing activity restores ended access                     | Integration checks of our Redis adapter, including renewal/clear ordering   | Correctness of every Redis operation or real browser coordination |
| User: inactivity ends protected access and offers usable recovery | Protected content remains usable, or keyboard recovery fails      | Focused browser outcomes; real-Keycloak E2E for authentication completion   | General draft persistence or every identity-provider failure      |

The frontend owns tenant configuration, OIDC, and temporary session/UI state. Backend business rules and durable
domain persistence belong to the backend. Session Redis tests are not evidence of durable business-record storage;
see [domain persistence](../../domain-persistence.md).

Property testing describes how cases are generated and checked. Unit, integration, and end-to-end describe
execution boundaries: a property can run against a pure function or a real adapter. BDD is a way to discover and
express behavior. Writing a Gherkin scenario does not decide whether it should execute through a browser.

## Existing suites and execution references

Run commands from the repository root. Use the linked guides for infrastructure, isolation, and cleanup requirements.

| Suite                        | Entry point                                            | Evidence and execution reference                                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend Vitest              | `pnpm --filter @pathableai/pre-ets-frontend test:unit` | [Workspace script](../../../packages/frontend/package.json), [configuration](../../../packages/frontend/vitest.config.ts), and [tests](../../../packages/frontend/tests/unit); inspect each test's doubles and real dependencies |
| Cucumber application         | `pnpm test:bdd:application`                            | Production application functions; some scenarios use Redis                                                                                                                                                                       |
| Cucumber HTTP                | `pnpm test:bdd:http`                                   | Actual HTTP responses, partitioned by production/development execution                                                                                                                                                           |
| Cucumber browser             | `pnpm test:bdd:browser`                                | Browser interactions; seeded authentication is not proof of a completed login                                                                                                                                                    |
| Playwright real-Keycloak E2E | `pnpm test:e2e`                                        | Real login and recovery journeys; [E2E setup and limits](../../../e2e/README.md)                                                                                                                                                 |

[Capability commands and evidence](../../../features/README.md) is the authoritative Cucumber execution guide.
Its dry-run command validates discovery, not runtime behavior. [Step guidance](../../../tests/bdd/steps/README.md)
explains boundary ownership; the [traceability ledger](../../../features/TRACEABILITY.md) records surviving evidence
and gaps. The backend currently has no dedicated test script; do not imply a frontend test validates backend behavior.

For Effect behavior, follow [Effect development guidance](../effect-guidance.md): deterministic test Layers can
isolate dependencies, but a simulated adapter does not establish the real adapter's semantics.

## Preserve useful knowledge

A durable test protects an expectation future implementations must continue to satisfy. A temporary experiment
may characterize unfamiliar code, probe a library assumption, or verify an intermediate refactor. Its usefulness
during construction does not automatically justify permanent maintenance.

Before retaining a test, identify the continuing claim and the distinct evidence it contributes. Preserve important
regressions and boundary examples alongside general properties. When consolidating tests, name the surviving
evidence for each obligation; when an expectation changes, explain the requirement change. Do not weaken assertions,
exclude inconvenient generated inputs, or delete failing tests just to make the current implementation pass.

These principles guide ordinary review. They do not introduce a new approval gate, immutable-test mechanism, or
Spec Kit workflow. Existing project requirements still govern changes and validation.

## Background

The repository guides apply the broader ideas in these references to current Pre-ETS contracts and tooling.
Readers do not need access to those discussions to follow this guide.

- [Testing AI Code Practices discussion](https://chatgpt.com/share/6ab67b92-4fd0-83e9-bbe8-7178bbf99dc8)
- [Property testing and engineering design discussion](https://chatgpt.com/share/6ab67b84-d8b8-83e9-b2b7-0120ad615fff)

## Review a proposed test

- Who depends on this behavior, and under what conditions?
- What meaningful violation would make this test fail?
- Does its observation exercise the boundary responsible for that claim?
- Does existing verification already provide enough evidence?
- Should this claim constrain future implementations?
- What inputs, dependencies, interactions, or outcomes remain unverified?
