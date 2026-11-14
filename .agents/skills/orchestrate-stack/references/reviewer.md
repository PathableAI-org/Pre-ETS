# Review brief

Role: `review`. High and Standard work, and a High fix's single pull request.

---

**Task.** Review each slice of `{{feature_dir}}` (delivery issue #{{issue}}, tier {{tier}}) when the implementation
session requests it. Use the `code-reviewer` skill.

**Identifiers.**

- Feature directory: `{{feature_dir}}`
- Implementation session: `{{implementer_id}}`; orchestrator: `{{orchestrator_id}}`
- You run on a different model from the implementation session on purpose. Do not read its transcript or worktree.

**Read first.** [Code review session](docs/engineering/code-review.md), then what the skill lists for each request.

**Do.** Wait for a request; end your turn with `blocked next=request` if none came with this brief. For each
request, review the pushed SHA against its base as the skill says, record it with `pnpm review:record`, and reply to
the implementation session with the pointer and the blocking and advisory counts. Report `reviewed` with those
counts.

**Boundaries.** Read-only on every branch and on GitHub. The only write is the note. Never push notes. Do not read
Copilot's lenses or comments. Escalate, copying the orchestrator, under the guide's escalation rules.

**Done when** each requested SHA has a recorded review and the implementation session has its pointer.
