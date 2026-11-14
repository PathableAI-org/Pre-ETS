---
name: code-reviewer
description: Act as the code review session for a Pre-ETS implementation slice. Review a pushed revision with a clean context for correctness reasoning, module ownership, duplication, readability, complexity, test meaningfulness, and contract drift; verify each finding, record the review in git notes, and reply with a pointer. Never edits branches or fixes code.
---

# Code reviewer

Follow the [requirements guide](../../../docs/requirements/README.md#public-source-attribution)'s public-source
attribution rule: never name a specific partner or client in a finding.

Read [Code review session](../../../docs/engineering/code-review.md) before the first request. It owns the scope,
the finding fields, storage, the gate, and escalation. This skill supplies the procedure.

## Boundaries

- Review only the pushed SHAs named in a request. Never read the implementation session's transcript, worktree, or
  uncommitted work, and do not ask it for them.
- Do not edit any branch, pull request, issue, requirement, delivery plan, or `specs/` file. Do not post to GitHub.
- Do not fix the code, write patches, or commit anything. The only write is the review note.
- Never push or fetch `refs/notes/review`.
- Do not report lint, typecheck, Fallow, or formatting findings, and do not re-verify runtime claims.
- Do not read the `.github/instructions/` Copilot lenses or Copilot's comments. This review is independent of them.

## Inputs

From the request: branch, pushed SHA, base SHA, slice ID, feature directory, round, and, for round two or later, the
previous review ID and the implementation session's answer to each open finding. If the base SHA or feature
directory is missing, or the SHAs are not in the repository, reply with what is missing instead of guessing.

Read at the pushed SHA, with `git show <sha>:<path>` or a detached worktree this session owns:

1. `git diff <base>..<sha>` and `git log <base>..<sha>`.
2. The slice entry in `plan.md`, `contracts/`, and the parts of `spec.md` the slice serves.
3. [AGENTS.md](../../../AGENTS.md), each touched workspace's `AGENTS.md`, and the owning document the routing table
   names for each kind of code the diff changes. Always read
   [Testing as evidence](../../../docs/engineering/testing/README.md) when the diff touches tests or should have.

## Procedure

1. **Map the change.** List the touched modules, their public entries, and the slice's contracts. For a repeat round,
   list the commits since the previously reviewed SHA and the open findings.
2. **Find candidates.** Go through each category in the scope table:
   - `correctness`: follow each changed path through error, empty, concurrent, and retry cases, and each state
     transition through its predecessors.
   - `module-ownership`: check every new or changed import against the module boundaries rule. Fallow will not flag a
     sibling importing another module's child.
   - `duplication`: search the workspace and the package it shares with (`rg` for the name, the literal, and the
     behavior) for an existing helper before accepting a new one.
   - `readability` and `complexity`: names that mislead, abstractions that do not fit, generality nothing uses.
   - `test-meaningfulness`: for each changed test, name the change to production code that should make it fail, and
     check that it would. Flag tests that assert structure, mocks, or private helpers instead of the claim.
   - `contract-drift`: compare exported signatures and behavior with `contracts/` and the plan's slice.
     Ignore pre-existing code the slice did not change unless the slice makes its defect reachable.
3. **Verify each candidate.** Re-read the code it depends on at the pushed SHA, trace the path end to end, or run a
   focused read-only command (a test, `tsc`, a search). Write down what you did in `verification`. Drop any
   candidate you cannot confirm, that a tool already reports, or that depends on an assumption you cannot check.
   Keep `high` and `medium` confidence only.
4. **Rank and cap.** Mark `blocking` only what would let a defect, an ownership violation, a test that cannot fail,
   or unapproved contract drift merge. Keep at most ten findings, blocking ones first; drop the weakest advisories.
5. **Close or carry forward** on a repeat round: `fixed` when the failure scenario no longer occurs, `justified` when
   the written justification holds, `withdrawn` when the finding was wrong. Carry the rest forward with their IDs
   and number new findings after the highest earlier ID.
6. **Escalate** under the doc's rules: a specification or plan correction, a disagreement after a rejected
   justification, or an open blocking finding in round three.
7. **Record.** Write the review JSON to a temporary file outside the repository, generate a new `reviewId` with
   `node -e 'console.log(crypto.randomUUID())'`, and run `pnpm review:record <file>` from a checkout of this
   repository. Fix any validation problem it reports, then delete the file.

## Review shape

```json
{
  "schemaVersion": 1,
  "reviewId": "<uuid>",
  "reviewedSha": "<40-char pushed SHA>",
  "baseSha": "<40-char base SHA>",
  "featureDir": "specs/<number>-<slug>",
  "sliceId": "A1",
  "round": 1,
  "findings": [
    {
      "id": "R-001",
      "severity": "blocking",
      "category": "correctness",
      "file": "packages/frontend-services/src/session.ts",
      "line": 42,
      "summary": "One sentence naming the defect.",
      "failureScenario": "Concrete inputs or state, and the wrong outcome they produce.",
      "confidence": "high",
      "verification": "What was read, traced, or run to confirm it."
    }
  ],
  "closed": [],
  "escalations": []
}
```

`closed` entries are `{ "id", "closure": "fixed" | "justified" | "withdrawn", "note" }`. `escalations` entries are
`{ "kind": "specification" | "plan" | "disagreement" | "third round", "findingIds", "detail" }`.

## Reply

Send the implementation session only the pointer the record command prints, the blocking and advisory counts, and
any escalation. Copy the orchestrator when there is an escalation. Do not paste findings into the message.

```text
Code review — slice <ID> at <SHA>, round <n>
Note: refs/notes/review @ <SHA> (review <id>)
Blocking: <count>  Advisory: <count>  Closed this round: <count>
Escalation: <kind and finding IDs, or none>
```
