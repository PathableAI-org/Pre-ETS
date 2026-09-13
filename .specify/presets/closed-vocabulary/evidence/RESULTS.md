# Evidence

Two things are recorded here, and they are not the same kind of thing.

**Section 1** is composition verification and a reproducible bench, both run on
device on 18 August 2026. **Section 2** is a measurement taken on a private
corpus. It is the motivation for the check, not evidence anyone else can verify.
It is labelled as such.

---

## 1 · Composition — verified on device

Android/Termux, Python 3.13, `specify` 0.16.4.dev0.

```
$ specify preset add --dev ~/cvpreset/closed-vocabulary
✓ Preset 'Closed Vocabulary Check' v1.0.0 installed (priority 10)

$ specify preset resolve speckit.analyze
  speckit.analyze: .specify/presets/closed-vocabulary/commands/speckit.analyze.md
    (top layer from: closed-vocabulary v1.0.0)
  Composition chain:
    1. [base]   core (bundled)           → templates/commands/analyze.md
    2. [append] closed-vocabulary v1.0.0 → .specify/presets/closed-vocabulary/…
```

The core survives intact — confirmed by direct inspection of the composed file,
not assumed from the append strategy declared in `preset.yml`:

```
$ wc -l SKILL.md
383

$ grep -n "Severity Assignment\|Additional pass" SKILL.md
161:### 5. Severity Assignment          ← core, untouched
269:## Additional pass: closed-set…     ← the added pass
```

Without the preset the same composed file is 264 lines and ends at `## Context`.
Lines 1–268 are the core, unmodified. The added pass runs from 269 to the end.
An upstream change to `analyze.md` propagates without touching this preset.

## 2 · Detection — verified against the shipped fixtures

**What this section is, precisely.** The detection rules described in
`commands/speckit.analyze.md` were implemented as a standalone, read-only
instrument and run against the three fixtures under `fixtures/` — the same
files that ship in this repository, not local copies. This is mechanical
verification of the rules. It is not an agentic invocation of
`/speckit.analyze`: no model read the composed prose and applied it to these
fixtures. That is declared as a limit in §4, not implied here.

### 001-divergent — MUST FIRE

`order status` (spec.md) and `status` (plan.md) name the same set through a
morphological variant; grouped as one.

```
==================================================================
001-divergent
  COVERAGE  lines: 26    declarations recognised: 2
  named sets: 1     DIVERGENCES: 1
    group 'status'  (2 decl)
       plan.md:5  rel=False  {delivered, paid, pending, refunded, shipped}
       spec.md:6  rel=False  {cancelled, delivered, paid, pending, shipped}

  set: status
    plan.md:5  {delivered, paid, pending, refunded, shipped}
    spec.md:6  {cancelled, delivered, paid, pending, shipped}
    in spec not in plan: cancelled
    in plan not in spec: refunded
  -> OK
```

|                   |                           |
| ----------------- | ------------------------- |
| must fire         | yes                       |
| fired             | **yes**                   |
| coverage reported | lines: 26 · recognised: 2 |

### 002-agreeing — MUST NOT FIRE

Same three members as `001`'s sibling set, different order and separator —
the formatting-variance control.

```
==================================================================
002-agreeing
  COVERAGE  lines: 21    declarations recognised: 2
  named sets: 1     DIVERGENCES: 0
    group 'method'  (2 decl)
       plan.md:5  rel=False  {card, transfer, wallet}
       spec.md:6  rel=False  {card, transfer, wallet}
  -> OK
```

|                   |                           |
| ----------------- | ------------------------- |
| must fire         | no                        |
| fired             | **no**                    |
| coverage reported | lines: 21 · recognised: 2 |

### 003-declared-subset — MUST NOT FIRE

The subset relation is stated in the spec; the declared-relation exclusion
applies before grouping.

```
==================================================================
003-declared-subset
  COVERAGE  lines: 19    declarations recognised: 2
  named sets: 1     DIVERGENCES: 0
    group 'status'  (2 decl)
       spec.md:5  rel=False  {cancelled, delivered, paid, pending, shipped}
       spec.md:8  rel=True   {delivered, pending, shipped}
  -> OK
```

|                   |                           |
| ----------------- | ------------------------- |
| must fire         | no                        |
| fired             | **no**                    |
| coverage reported | lines: 19 · recognised: 2 |

### Result table

| fixture             | must fire | fired   | coverage reported         |
| ------------------- | --------- | ------- | ------------------------- |
| 001-divergent       | yes       | **yes** | lines: 26 · recognised: 2 |
| 002-agreeing        | no        | **no**  | lines: 21 · recognised: 2 |
| 003-declared-subset | no        | **no**  | lines: 19 · recognised: 2 |

**All three as expected.** Each exercises a different rule, and each negative
control reaches the comparison before declining to report:

```
001   group 'status', 2 decl, rel=False   compared · members differ · FIRES
002   group 'method', 2 decl, rel=False   compared · members agree · quiet
                                          (different order, different separator)
003   group 'status', 2 decl, rel=True    grouped · declared relation excludes it
```

## 3 · What building the instrument found — kept because it is evidence too

Four runs were needed to reach the result in §2. Three were wrong, and only the
per-run coverage figure and per-group detail distinguished a correct run from
an incorrect one that printed the same summary line.

**Run 1 — passed, and compared nothing.** Grouping never matched either
control's declarations, so both stayed quiet because the comparison was never
reached, not because the rule declined to report. A negative control that never
reaches comparison proves nothing.

**Run 2 — improved name extraction, lost the true positive.** Grouping on the
full noun phrase makes the group depend on how the sentence is written:
`the order status is one of:` yields `order status`; `the order status in {…}`
yields `status`. Same set, two groups, the real finding never compared.

**Run 3 — grouping on the head noun. Correct.** `order status` and `status`
are recognised as the same set.

**Run 4 — run against the fixtures actually shipped in this repository, not
local copies:**

```
001-divergent
  COVERAGE  lines: 26    declarations recognised: 2
  named sets: 2     DIVERGENCES: 0
    group 'pend'    (1 decl)  {delivered, g, paid, refunded, shipped}
    group 'status'  (1 decl)  {cancelled, delivered, paid, pending, shipped}
  -> !! expected 1
```

Cause, found by diffing the local and shipped copies of `001-divergent/plan.md`:
the shipped fixture uses `∈` as the introducer; the instrument's regex had not
been extended to recognise it, and the line split at the wrong point, producing
a phantom set named `pend` with a member `g`. Result before the fix: zero
divergences reported, coverage 2 of 26 lines, over a fixture with the
divergence in plain sight — reproducing, in this instrument, the exact failure
mode the pass itself cites as the reason coverage is mandatory (§4). Fixed by
adding `∈` to the introducer set; the run in §2 is the corrected one.

This is kept in the evidence rather than cleaned up because a check whose own
construction caught a coverage failure of this kind is better-supported
evidence than a single clean run would have been.

## 4 · Declared limit on this section

`/speckit.analyze` has not been invoked end-to-end by an agent against these
fixtures. What is verified above is composition (§1, on device) and the
detection rules, mechanically, against the exact fixtures shipped in this
repository (§2–3). Whether a model reading the composed prose in
`commands/speckit.analyze.md` applies the same rules identically is not
established by this evidence.

---

## 5 · Field measurement — not reproducible here

A read-only checker of the same shape, run over six architecture contracts in
a private ecosystem on 13 August 2026. Reported for motivation, not as
evidence of this preset's behaviour — nobody outside that device can verify it.

```
contract          inspected  recognised   divergences
ocgs_ref            112        4  (4%)         1
ocgs_fab             122        4  (3%)         0
ocgs_pru             122        4  (3%)         0
prueba_fabrica       126        0  (0%)         0
operator_engine       21        0  (0%)         0
governed_core         50        2  (4%)         0
```

**The one divergence found**, previously unreported by any verification in
that ecosystem:

```
struct State.invariants
"clase en separador|regulador|cobertura|canonico" 4 members

sig invariant_taxonomy.clase_de
"separador, regulador, cobertura, canonico,
redundante o incompatible" 6 members
```

It is not documentary: the implementation admits the four and raises on any
other value, so a state carrying one of the other two is legal according to
the signature and fails at runtime.

Two things from that run shaped this preset, and both are failures rather than
successes. The first extractor reported zero across every contract, including
the one above — it did not recognise `en` as an introducer or `|` as a
separator, parsing 4 per cent of what it inspected. A sibling check in the
same ecosystem reported 72 findings where 7 were real, all from treating a
bare word anywhere in the surrounding text as a declaration — which is why
this pass groups on the name preceding the introducer and refuses to group on
content similarity.

## 6 · Declared limits

- The pass compares declarations against each other, inside the spec. It
  cannot tell whether a set every declaration agrees on is the _right_ set. A
  specification that is internally consistent and uniformly mis-transcribed
  from its source is indistinguishable, to this pass, from a correct one.
- It is judgemental. It finds silence, not error. A divergence it reports may
  be two legitimately different sets sharing a name.
- It reports and continues. It never blocks a run.
- See §4 for the limit specific to how this evidence was produced.
