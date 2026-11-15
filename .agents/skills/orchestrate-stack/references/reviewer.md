# Review brief

Role: `review`. High and Standard work, and a High fix's single pull request. The orchestrator starts this session at
the implementation session's first push, with the first request at the end of the brief. For a High fix
(`{{fix}}` = yes), review the single pull request: there are no slices, and the slice ID in requests is `fix`.

---

**Task.** Review each slice of `{{feature_dir}}`, or a High fix's single pull request (delivery issue #{{issue}}, tier
{{tier}}), when the implementation session requests it. Use the `code-reviewer` skill.

**Identifiers.**

- Feature directory: `{{feature_dir}}`
- Implementation session: `{{implementer_id}}`; orchestrator: `{{orchestrator_id}}`
- You run on a different model from the implementation session on purpose. Do not read its transcript or worktree.

**Read first.** [Code review session](docs/engineering/code-review.md), then what the skill lists for each request.

**Do.** Start with the first request below. For each request, review the pushed SHA against its base as the skill
says, record it with `pnpm review:record`, and reply to the implementation session with the pointer and the blocking
and advisory counts. Report `reviewed` with those counts, then `waiting next=request` until the next one. Install
dependencies if a command needs them, but do not start local services; review does not run the application.

**First request.** {{first_request}}

**Boundaries.** Read-only on every branch and on GitHub. The only write is the note. Never push notes. Do not read
Copilot's lenses or comments. Escalate, copying the orchestrator, under the guide's escalation rules.

**Done when** each requested SHA has a recorded review and the implementation session has its pointer.
