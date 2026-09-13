# Closed Vocabulary Check

A preset for [spec-kit](https://github.com/github/spec-kit). Appends one pass to
`/speckit.analyze`: it flags closed sets of values that are enumerated more than
once with different members, and it reports how much of the spec it managed to read.

Requested in [github/spec-kit#4106](https://github.com/github/spec-kit/issues/4106).

## Install

```bash
specify preset add --from https://github.com/yunusdim/spec-kit-preset-closed-vocabulary/archive/refs/tags/v1.0.1.zip
```

Requires spec-kit with preset composition strategies.
The preset composes onto the core speckit.analyze with strategy append:
it adds a pass after the core analysis and replaces none of it.

From a local checkout instead:

```bash
specify preset add --dev ./closed-vocabulary
```

## The problem

When a spec declares a closed set of values — statuses, categories, admissible kinds
— and more than one part of the spec refers to it, the set gets restated in each
place. There is usually nowhere to declare it once. So it multiplies, and any error
in it multiplies with it.

That divergence is invisible to the checks that already run. It is not a coverage
gap: every requirement is covered. It is not a structural inconsistency between
spec, plan and tasks: the artifacts agree about what exists. It is two statements of
the same closed set that disagree about its members, sitting inert until an execution
path finally traverses it.

The analogous check over numeric constants — a threshold declared twice with two
values — is standard. The same defect over a set of names goes straight through.

## What it does

Appends a pass to `/speckit.analyze` that:

1. Collects declarations of named closed sets across the artifacts.
2. Groups them **by the name in front of the introducer**, never by content
   similarity.
3. Reports, for each group whose members disagree, both directions of the
   difference — what each side omits.
4. Reports its own coverage on every run: declarations inspected, declarations
   recognised.

It is a **warning**. It never blocks.

## Two design decisions worth stating

**Coverage is not optional.** A zero-divergence result without a coverage figure
says nothing about the spec; it says something about what the pass managed to read.
The reference implementation reported zero across a corpus that had a divergence in
plain sight, because it failed to recognise one introducer and one separator, and it
had parsed 4 per cent of what it inspected. Read without the coverage number, that
zero reads as "clean."

**It warns, it does not gate.** Two declarations that enumerate differently may be a
defect, or may be two legitimately different sets that share a name. The pass cannot
tell those apart, and halting work on something that needs human judgement costs more
than it saves.

## Install

```
specify preset install closed-vocabulary
```

Requires spec-kit `>=0.8.0` — composition strategies (`prepend`, `append`, `wrap`)
landed there ([#2133](https://github.com/github/spec-kit/pull/2133)). On anything
older the `append` strategy is unavailable and the preset would replace the core
command instead of extending it.

## Shape

Uses `strategy: "append"`. It carries no copy of `templates/commands/analyze.md`, so
it does not have to track upstream changes to that file.

```
preset.yml
commands/speckit.analyze.md      the appended pass, self-contained
evidence/RESULTS.md              bench + field measurement, separated
evidence/fixtures/
  001-divergent                  must fire
  002-agreeing                   must not fire — formatting variance control
  003-declared-subset            must not fire — declared subset control
```

Two of the three fixtures are negative controls. A check that only demonstrates that
it bites has not demonstrated that it stays quiet, and staying quiet is the harder
half.

## Limits

The pass compares declarations against each other, inside the spec. It cannot tell
whether a set that every declaration agrees on is the right set. A specification
that is internally consistent and uniformly mis-transcribed from its source is
indistinguishable, to this pass, from a correct one. That is outside what any
comparison internal to the spec can reach, and it is stated so a clean result is not
read as more than it is.

See `evidence/RESULTS.md` for the full record.

## Author

Diego Gabriel Impieri · ORCID [0009-0003-9082-650X](https://orcid.org/0009-0003-9082-650X)

The case that motivated it: _When the Defect Is in the Specification_,
https://doi.org/10.5281/zenodo.21879238, with its correction at
https://doi.org/10.5281/zenodo.21926137 — the errata narrows what this check would
and would not have caught, and is worth reading alongside the report.

MIT.
