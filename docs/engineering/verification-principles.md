# Verification principles

This guide records how Pre-ETS thinks about verification: what we are trying to know, and what makes evidence
worth having. It describes the reasoning, not the current tooling or how far the repository has adopted it. Where
the current setup differs, that is a gap to assess, not a reason to change this guide.

The [constitution](../../.specify/memory/constitution.md) governs, in particular
[Principle V](../../.specify/memory/constitution.md#v-meaningful-behavioral-tests) and
[Principle VI](../../.specify/memory/constitution.md#vi-simplicity-and-verifiable-quality). Procedures live
elsewhere and are not restated here. [Durable requirements](../requirements/README.md) owns the form of a
requirement and its verification plan. [Testing as evidence](testing/README.md) owns how to choose a test.
[The verification harness](verification-harness.md) owns the verification loop and its records. Read this guide to
understand why those documents ask for what they do, and to judge a proposal they do not cover.

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
hole in the definition, even when the prose is clear, because nothing would tell us that a release violated it.

Each part names the boundary where it holds, and through that the interface used to observe it:

| Who depends on it | Interface that expresses their intent                                   |
| ----------------- | ----------------------------------------------------------------------- |
| A user            | What they can perceive and operate: accessible roles, names, and states |
| An API client     | The HTTP requests, statuses, headers, and bodies the contract names     |
| An operator       | The telemetry facts the requirement's observability obligations name    |

These interfaces are deliberate. Accessible roles and names are the formal statement of what a user can interact
with. That is what a requirement is about, so a check written against them survives any implementation that still
meets the requirement.

## Two kinds of evidence

Every check serves one of two purposes. Knowing which keeps checks meaningful and keeps their ownership clear.

|                     | Conformance evidence                              | Diagnostic evidence                                          |
| ------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| Question            | Does this release match the product's definition? | Where exactly did it break? Is this change to the code safe? |
| Owned by            | The part of the definition it checks              | The code it sits beside                                      |
| Observes            | The product boundary, through the interface above | Anything useful, including internals                         |
| Lives as long as    | The requirement                                   | The code. It is rewritten or deleted with it.                |
| Counts as evidence? | Yes                                               | No, unless a person explicitly accepts it as a substitute    |

Diagnostic evidence is valuable. Unit and integration tests around the implementation make a conformance failure
quick to locate and make refactoring safe. Their value is in localizing and protecting the code, not in establishing
the product.

To tell the two apart, ask: **if the implementation were rewritten from scratch to the same requirements, would this
check still be valid without change?** If not, it is diagnostic, whatever its execution boundary. An end-to-end test
that asserts the DOM structure its author just wrote is diagnostic evidence presented as conformance evidence. It
gives no confidence about the product and breaks on every honest refactor.

Some behavior cannot be reached at the product boundary at reasonable cost. A diagnostic check may then stand in
for conformance evidence, but only by a person's explicit decision, recorded where the evidence is presented, so the
record never overstates what was observed.

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

Every part of the definition should either state its runtime signal or state that it is not observable at runtime,
and why. Many parts will not be observable. Deciding that deliberately is what matters.

Runtime signals follow the same safety rules as all telemetry. They carry no PHI, personal data, credentials, or
session references. A fact that cannot be emitted safely is verified another way. A monitor is runtime evidence, not
a durable test of telemetry.

## The release is the unit of conformance

Evidence gathered on each change shows that the change did what it set out to do. Auditors and the person accepting
a release need more: every part of the definition checked against one exact revision. A regression in one part,
caused by a change aimed at another, is only caught by checking the whole definition.

So conformance evidence accumulates on the parts of the definition, not on individual changes. The record for a
release is generated from the evidence itself: each part, its checks, their results at the release revision, any
accepted substitutes, and its runtime signal. Parts with no check, or only partial checks, appear as gaps. The record
is never maintained by hand inside the requirements.

## Choose techniques for fit, not preference

No technique is good everywhere. Choose by the claim and by what the evidence costs to build and keep.

- **Examples** communicate named decisions and edge rules. Most checks should be examples.
- **Generated properties** suit pure logic with a broad input space and a rule that can be stated as a relation:
  round-trips, invariants, monotonicity, or comparison with a much simpler model. They stop the author's assumptions
  from choosing the cases. They are a poor fit when the generator has only a few values (an example table in
  disguise), when the expected result is computed the same way as the code (the implementation restated), or when
  building the generators costs more than the behavior they check.
- **Generated sequences of actions** through a public interface suit stateful protocols where the order of events
  matters, such as several tabs sharing a session. They are powerful and expensive, so reserve them for genuinely
  concurrent behavior.
- **Design-level models**, checked across every interleaving within bounds, suit designs whose risk is in
  interleavings. They check a model, not the code, so they need conformance checks to tie the model to the
  implementation. Reach for them when cheaper evidence has missed defects, not in advance.

A technique the team likes is not a reason to use it. Adding a tool or layer must answer a current need.

## Machines do the mechanical work, judgment stays independent

Running checks is mechanical. It belongs in deterministic tools such as CI, which cannot skip a step, misread a
result, or be persuaded. Judging whether evidence means anything takes judgment: whether these are the right checks
for this part of the definition, whether they can fail, whether a model matches the code. That work belongs to people
and to review agents.

Judgment is worth most when it is independent of the author. A reviewer that starts from a fresh context, runs on a
different model, and receives a brief the author did not write is more likely to notice a check that cannot fail.
Independent judgment produces the conformance record. An author's own checks before sharing work speed it up but do
not count as evidence.

## Overhead is a cost

Every check and every layer costs something to build, run, maintain, and read. Each should earn its place by catching
a class of defect nothing else catches at lower cost.

Be able to say which layer owns which kind of defect: a wrong rule, a rule broken in some interleaving, code that does
not follow the design, an integration or wiring failure, a deviation in production. When a defect escapes, ask which
layer owned it and fix that layer, rather than adding a new one.

## Questions for any verification proposal

- Which part of the product's definition does this check, and through which interface?
- Is it conformance or diagnostic evidence? Would it survive a rewrite to the same requirements?
- What realistic broken release would it catch? Has it been seen to fail?
- Is there a runtime signal for the same part, or a stated reason there is none?
- Will a deterministic tool run it, or does it depend on someone remembering?
- What does it cost to keep, and which defect class does it own that nothing cheaper already catches?
