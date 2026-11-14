## Decisions for the reviewer

<!-- Required first section. 3–5 bullets, each labeled Tradeoff, Contract change, Accepted limitation, Beyond plan,
Evidence substitution, or Outstanding manual check. Every limitation, not established or blocked result,
workaround, and pending manual check below must appear here. With nothing to decide, write: None: conforms to the
approved contract, with no limitations. Policy: docs/engineering/git-workflow.md, "Decisions for the reviewer". -->

-

## Review objective

One-pull-request change: a fix inside an approved contract, or Light work such as a refactor, tooling,
documentation, or a dependency update. Approval means the change is correct and stays inside the contract it names.
New behavior or a contract change belongs in a specification pull request instead.

## Tier

- Risk tier: High / Standard / Light
- Triggers that matched, or why none applies:
- Why a stack does not apply:
- Issue and the approved contract this stays inside (requirement IDs, docs, or feature):

## Change

## Evidence

<!-- High tier: list the claims the fix establishes, each with its observation and channel, then summarize the
verification report for them. Name the verified SHA, and give results, run conditions, limits, and forbidden data
observed. Standard and Light: name the tests that cover the change. -->

| Claim | Result | Evidence | Limits |
| ----- | ------ | -------- | ------ |
|       |        |          |        |

Use `Closes #<issue>` only when this pull request satisfies the issue. Otherwise use `Contributes to #<issue>`.

## Validation

- [ ] Repository checks from `AGENTS.md` "Before committing", with results, and what was not run
- [ ] Docs under `docs/` updated where current behavior changed
- [ ] Temporary probes and generated output are absent
