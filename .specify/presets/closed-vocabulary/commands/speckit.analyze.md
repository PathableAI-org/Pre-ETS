---

## Additional pass: closed-set divergence

This pass runs after the analysis above. It only adds findings. It never removes,
downgrades, or overrides anything the core analysis produced.

### What this pass looks for

A **closed set** is a named set of admissible values enumerated in prose inside a
spec artifact: statuses, categories, kinds, roles, admissible types. Spec languages
usually have nowhere to declare such a set once, so it gets restated wherever it is
needed — and the restatements drift.

This pass finds the case where the same named set is enumerated in more than one
place and the enumerations do not agree on their members.

It is not a coverage gap: every requirement can be covered. It is not a structural
inconsistency between spec, plan and tasks: the artifacts can agree about what
exists. It is two statements of the same closed set that disagree about its members,
sitting inert until an execution path finally traverses it.

### Detection

**1. Collect declarations.** A declaration is a fragment that names a set and then
enumerates it. Recognise it by an introducer followed by two or more values:

```
introducers   :   is one of   must be one of   are   in   ∈   belongs to
separators    ,   |   /   or   and
```

Record for each declaration: the **name** that precedes the introducer, the member
list, the file, and the line.

**2. Group by name, not by content.** Two declarations belong to the same group only
when the name preceding the introducer is the same or an obvious morphological
variant (`order status` / `order statuses`).

> **Calibration rule — this is where the false positives come from.** Do not group
> declarations because they happen to share member values, and do not treat a bare
> word appearing somewhere in a sentence as a declaration of that set. Grouping on
> loose content similarity is the single largest source of noise in this check: in
> the reference calibration it produced 72 findings where 7 were real, and the 65
> extra were all triggered by a word appearing anywhere in the surrounding text.
> Require the name. If there is no name in front of the introducer, the fragment is
> not a declaration.

**3. Compare members within each group.** Order does not matter. Case and
surrounding punctuation do not matter.

### What to report

For each group holding two or more declarations whose member sets differ:

```
set name
  declaration A   file:line   members
  declaration B   file:line   members
  in A not in B   <members>
  in B not in A   <members>
```

Report the difference in both directions. "They disagree" is not actionable; which
member each side omits is.

### Coverage — required, and required even when nothing is found

Every run of this pass reports two numbers:

```
declarations inspected      NON-EMPTY LINES read across the artifacts
declarations recognised     how many yielded an enumeration this pass could parse
```

**The unit of `inspected` is the non-empty line, and it is fixed.** Not sentences, not
fragments that look like candidates. The figure exists so a zero is not read as a clean
corpus, and only a denominator anyone can recount without judgement can serve as a floor.
A denominator that depends on what the reader considers a candidate can be argued with,
and a figure that can be argued with bounds nothing. It reads low — most lines could
never carry a declaration — and that is correct: the low number is the honest one.

**A zero-divergence result without these two numbers does not state anything about
the spec.** It states something about what the pass managed to read.

This is not tidiness. In the reference implementation the extractor reported zero
divergences across a corpus that contained a real divergence in plain sight, because
it did not recognise one introducer and one separator; of 112 declarations inspected
it parsed 4. Read without the coverage figure, that zero says "the corpus is clean."
Read with it, it says "the instrument reached 4 per cent of the corpus."

A finding without declared coverage is not a finding about the system. It is a claim
about what the instrument looked at, wearing the costume of a claim about the system.

### Severity and behaviour

**WARNING. This pass never blocks and never fails a run.**

Two declarations that enumerate differently may be a defect, or may be two
legitimately different sets that happen to share a name — one section intending a
subset of another, two lifecycle stages with different admissible states. This pass
cannot tell those apart. Distinguishing them needs human judgement, and halting work
on something that needs judgement costs more than it saves.

Report it, put the evidence next to it, and continue.

### Do not report

- Enumerations that agree, in any order.
- A set enumerated exactly once.
- A declaration that explicitly states it is a subset, superset, or extension of
  another named set. The relation is declared, so the difference is intended.

  **This exclusion is evaluated before grouping and takes precedence over any
  ambiguity in the name.** In `The shipment status is a subset of the order status:
  pending, shipped, delivered`, the phrase before the introducer is _order status_
  while the subject is _shipment status_ — two defensible readings, two different
  groupings. Neither changes the outcome, because a declared relation removes the
  declaration from comparison whichever group it would land in. Stated here so the
  stability is by rule rather than by luck.
- Examples introduced as partial: `such as`, `for example`, `e.g.`, `including`,
  `among others`. These are open lists, not closed sets.
- Values differing only in case, whitespace, or surrounding punctuation.

### What this pass does not do

It compares declarations against each other, inside the spec. It cannot tell whether
a set that every declaration agrees on is the _right_ set. A specification that is
internally consistent and uniformly mis-transcribed from its source is
indistinguishable, to this pass, from a correct one. That gap is not a defect of this
check — it is outside what any comparison internal to the spec can reach, and it is
stated here so a clean result is not read as more than it is.
