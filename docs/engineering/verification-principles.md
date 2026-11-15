# Verification principles

This guide records how Pre-ETS thinks about verification: what we are trying to know, and what makes evidence
worth having. It describes the reasoning, not the current tooling or how far the repository has adopted it. Where
the current setup or an owner document differs, that is a question for a person: a gap to close, or a deliberate
decision to record. It is not a reason to change this guide silently, or to act against the owner.

The [constitution](../../.specify/memory/constitution.md) governs, in particular
[Principle V](../../.specify/memory/constitution.md#v-meaningful-behavioral-tests) and
[Principle VI](../../.specify/memory/constitution.md#vi-simplicity-and-verifiable-quality). Procedures live
elsewhere and are not restated here. [Durable requirements](../requirements/README.md) owns the form of a
requirement and its verification plan. [Testing as evidence](testing/README.md) owns how to choose a test.
[The verification harness](verification-harness.md) owns the verification loop and its records. Read this guide to
understand why those documents ask for what they do, and to weigh a proposal to change them. Judging an individual
test or piece of evidence stays with Testing as evidence.

## The goal

A person defines the product. Agents produce the software. The person's confidence in a release comes from evidence
that the release matches the product's definition, not from reading its code.

That evidence has two jobs:

- **Before release:** detect, as early and as cheaply as possible, a release that does not fit the definition.
- **At runtime:** act as the failsafe, detecting a deviation that got past everything before release.

Auditors need the same evidence, presented as a record: each part of the definition, how it was checked, against
which revision, and with what result.

## The product definition is made of discrete, verifiable parts

The definition of the product is its accepted requirements. Each requirement is made of discrete parts: acceptance
criteria and observability obligations. Each part must be something we can verify. A part that cannot be checked is a
hole in the definition, even when the prose is clear, because nothing would tell us that a release violated it. The
requirement stays the unit of traceability, as Durable requirements says: evidence references the requirement, and its
stated claims say which parts it supports.

Each part has a boundary where it holds, and through that an interface used to observe it:

| Who depends on it | Interface that expresses their intent                                   |
| ----------------- | ----------------------------------------------------------------------- |
| A user            | What they can perceive and operate: accessible roles, names, and states |
| An API client     | The HTTP requests, statuses, headers, and bodies the contract names     |
| An operator       | The telemetry facts the requirement's observability obligations name    |

These interfaces are deliberate. Accessible roles and names are the formal statement of what a user can interact
with. That is what a requirement is about, so a check written against them survives any implementation that still
meets the requirement.

## Two kinds of evidence

Every check answers one of two questions. This is the distinction
[Principle V](../../.specify/memory/constitution.md#v-meaningful-behavioral-tests) draws between feature verification
and module-contract evidence, seen from the product's side. Knowing which question a check answers keeps it
meaningful and keeps its ownership clear.

|                          | Conformance evidence                              | Implementation evidence                                         |
| ------------------------ | ------------------------------------------------- | --------------------------------------------------------------- |
| Question                 | Does this release match the product's definition? | Does this module keep its contract? Where exactly did it break? |
| Owned by                 | The requirement it checks                         | The module whose contract it protects                           |
| Observes                 | The product boundary, through the interface above | A module's public interface, under the module-boundary rules    |
| Lives as long as         | The requirement                                   | The module's contract. It changes or goes with the module.      |
| Establishes the product? | Yes                                               | No, unless a person explicitly accepts it as a substitute       |

Implementation evidence is real evidence of its own claims. Module-contract tests and integration tests make a
conformance failure quick to locate and make refactoring safe. What they establish is that a module keeps its
contract, not that the release fits the product's definition. A module contract can be correct while the product
built from it is wrong.

To tell the two apart, ask: **if the implementation were rewritten from scratch to the same requirements, would this
check still be valid without change?** If not, it is implementation evidence, whatever its execution boundary. An
end-to-end test that asserts the DOM structure its author just wrote is implementation detail presented as
conformance evidence. It gives no confidence about the product and breaks on every honest refactor.

Some behavior cannot be reached at the product boundary at reasonable cost. Implementation evidence may then stand in
for conformance evidence, but only by a person's explicit decision, recorded where the evidence is presented (an
"Evidence substitution" in a pull request's Decisions for the reviewer), so the record never overstates what was
observed.

## What makes a check worth trusting

A check adds confidence only when all of these hold:

- **It observes intent.** It uses the interface the requirement is about and asserts the outcome the requirement
  names, not the structure that happens to produce it.
- **It is tied to a part of the definition.** We can say which acceptance criterion or obligation it checks, and a
  part with no check is visible as a gap.
- **It has been seen to fail.** A check that cannot fail when the behavior is broken is worse than none, because it
  reports confidence that does not exist. For conformance evidence, demonstrate at least once that a deliberate,
  realistic break in the product makes the check fail. Describing a broken product the check would still pass is the
  quickest way to find a vacuous one.
- **It is stable.** A check that fails intermittently teaches people and agents to ignore red. A flaky conformance
  check is a defect to fix promptly, not noise to retry past.

The number of checks is not a measure of confidence. One check that meets all four is worth more than many that do
not.

## Runtime: the failsafe

Some deviations only appear in production: real traffic, real timing, real configuration. Telemetry is how the
product's definition is checked there.

That needs telemetry that speaks in the definition's terms. Request spans and runtime metrics help with diagnosis,
but they rarely state a requirement-level fact. Signals such as "a session was renewed", "a session expired", or "a
cross-tenant request was denied" can. Where a part of the definition has a runtime signal, a monitor can watch it and
name the part it guards when it fires.

For every part of the definition, the requirement should make clear whether it has a runtime signal, or is not
observable at runtime and why. A requirement's Observability section is the natural place. Many parts will not be
observable. Deciding that deliberately is what matters.

Runtime signals follow the same safety rules as all telemetry, which
[Principle V](../../.specify/memory/constitution.md#v-meaningful-behavioral-tests) and the data classes in
[Observability](../observability.md) own. A fact that cannot be emitted safely is verified another way. A monitor is
runtime evidence, not a durable test of telemetry.

## The release is the unit of conformance

Evidence gathered on each change shows that the change did what it set out to do. Auditors and the person accepting
a release need more: every part of the definition checked against one exact revision. A regression in one part,
caused by a change aimed at another, is only caught by checking the whole definition.

So conformance evidence accumulates on the product's definition, not on individual changes. The record for a release
is generated by a tool from the evidence itself: each requirement, its checks and the claims they support, their
results at the release revision, any accepted substitutes, and runtime signals. Parts with no check, or only partial
checks, appear as gaps. The record is never maintained by hand inside the requirements. Durable requirements decides
when such a derived view is introduced. This guide states the direction, not the timing.

## The definition changes over time

Accepted requirements are the target. What the product promises at a given revision is that target minus what has not
been built yet. A new requirement is implemented in steps, so for a while the product promises only part of it.
Conformance at a revision is always relative to what that revision promises.

Each part of the definition moves through a lifecycle, and its checks move with it:

| State of the part        | Its conformance checks                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------- |
| Accepted, not started    | May already exist, written from the requirement, but are not expected to pass. Pending. |
| In progress              | Gate for the parts that are built; the rest stay pending                                |
| Implemented              | Gate on every change, for as long as the requirement stands                             |
| Superseded by a new part | Retired, in the same change that brings in what replaces it                             |

### The promise only grows

The set of parts the product promises grows as work lands and never shrinks quietly. A check that stops gating, or
gets weaker, is one of two things: a change to the definition that a person approved, referenced as such, or a
suppression. This is the same rule as never silencing a failing check, applied to the product's definition.

Writing conformance checks early, straight from the requirement, makes progress visible. A pending check that starts
passing before anyone expected it to is a signal: either the part is now built and the check should start gating, or
the check cannot fail.

### Behavior between steps

Between steps, users could see behavior that belongs to neither the old definition nor the new one. In order of
preference:

1. **Keep unfinished behavior out of users' reach** until the steps that complete it have landed, so what users see
   still matches a definition the product has promised.
2. **Order the steps so each leaves a coherent product:** add the new behavior beside the old, move to it, then remove
   the old. Every step is then a product that matches some definition you could stand behind.
3. **Declare a transitional expectation** only when neither is practical. It is checked like any other part, labeled
   as transitional, and names the step that removes it. The work is not finished while any remain. A transitional
   check left in place becomes a permanent test of an intermediate state nobody intended to keep.

Behavior that users can see but that no definition describes is what an auditor will ask about first.

### What a release promises

A release is a revision whose promised parts are what we are willing to stand behind. Its record says which
requirements are implemented and with what evidence, which are in progress and how their unfinished behavior is kept
from users, and which are accepted but not started, so that what is not promised is as clear as what is.

## Verifying a change

Checking the whole definition on every change takes too long. A change is verified against what it could affect:

- **No regression:** every promised part the change puts at risk still holds.
- **Its own claims:** the parts this change says it delivers now hold, and their checks start gating.
- **The promise only grows,** unless a person approved a change to the definition.

### Choosing what is at risk is itself a claim

Deciding which parts a change puts at risk is a claim, and it can be wrong. A regression usually lands in the part the
author did not think about. So:

- What is at risk is decided from the change itself, in a way anyone can repeat. An author's or agent's statement of
  what a change affects may add parts to check, but never removes any.
- A change to something everything depends on puts everything at risk.
- A small set of the most consequential parts is checked on every change, whatever the selection says. It is cheap
  insurance against a selection that is quietly wrong.
- The whole definition is still checked regularly, and always on a release. That full check is the backstop.
- When the full check finds a regression that change-level selection did not check, treat it as a defect in the
  selection as well as in the code, and fix the selection so the same kind of change catches it next time. How often
  this happens is the measure of whether selection works.

Faster checks are better than cleverer selection. Making checks faster adds no new way to be wrong; selecting fewer of
them does. Weigh any selection scheme's complexity against the time it saves, and start with the least machinery that
works.

## Choose techniques for fit, not preference

No technique is good everywhere. Choose by the claim and by what the evidence costs to build and keep.
[Testing as evidence](testing/README.md) and [Property-based testing](testing/property-based-testing.md) own the
rules for choosing between examples and properties. The reasoning behind them is this:

- Generated inputs keep the author's assumptions from choosing the cases. That is worth most where the input space is
  broad and the rule can be stated without restating the implementation, which mostly means pure logic.
- Generators are code to maintain. When they cost more than the behavior they check, or produce only a handful of
  values, examples are the better evidence.
- Heavier techniques, such as generated sequences of actions or design-level models checked across interleavings,
  suit protocols whose risk is in the order of events. They are expensive and, for models, check a design rather than
  code. Reach for them when cheaper evidence has missed defects, not in advance.

A technique the team likes is not a reason to use it. Adding a tool or layer must answer a current need.

## Machines do the mechanical work, judgment stays independent

Running checks is mechanical. It belongs in deterministic tools such as CI, which cannot skip a step, misread a
result, or be persuaded. Judging whether evidence means anything takes judgment: whether these are the right checks
for this part of the definition, whether they can fail, whether a model matches the code. That work belongs to people
and to review agents.

Judgment is worth most when it is independent of the author. A reviewer that starts from a fresh context, runs on a
different model, and receives a brief the author did not write is more likely to notice a check that cannot fail.
Tools run the checks and generate the record; independent judgment decides whether what the record contains means
anything. An author's own review before sharing work speeds it up but does not count as evidence.

### Where verification runs

Verification that runs automatically on every change should be deterministic, finish in a reasonable time, need only
setup that can be reproduced, and need no judgment to read. Anything that gates a change should meet that bar, because
a gate is only as trustworthy as anyone's ability to run it again and get the same answer.

Work that needs judgment or exploration runs in agent sessions instead: assessing whether claims match the
definition, observing runtime behavior, demonstrating that a check fails, or anything whose setup is too costly to
repeat on every change. A session's result counts as evidence only when it is recorded with its revision, environment,
actions, and limits, and even then it is weaker than a result anyone can reproduce. Over time, gating work that can be
made deterministic should move out of sessions and into the automatic runs.

## Overhead is a cost

Every check and every layer costs something to build, run, maintain, and read. Each should earn its place by catching
a class of defect nothing else catches at lower cost.

Be able to say which layer owns which kind of defect: a wrong rule, a rule broken in some interleaving, code that does
not follow the design, an integration or wiring failure, a deviation in production. When a defect escapes, ask which
layer owned it and fix that layer, rather than adding a new one.

## Questions for a change to how we verify

These are for proposals about the verification system: a new layer, tool, channel, or rule. For a single test, use
[Review a proposed test](testing/README.md#review-a-proposed-test).

- Which parts of the product's definition does it help verify, and through which interface?
- Does it produce conformance evidence or implementation evidence, and is it presented as what it is?
- Which kind of defect does it own that nothing cheaper already catches?
- Does it run in a deterministic tool, or does it depend on someone remembering?
- For a change, how does it decide what is at risk, and how would we learn that the decision was wrong?
- Does it work before release, at runtime, or both?
- What does it cost to build, run, maintain, and read?
