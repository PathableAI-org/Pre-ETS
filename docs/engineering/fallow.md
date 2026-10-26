# Fallow during development

Use Fallow to understand architecture, check a change while it is still cheap to revise, and
finish with the repository gates. The commands below match the installed Fallow 3.35.0 CLI.
Prefer the pnpm scripts when they perform the same check.

Root [`.fallowrc.json`](../../.fallowrc.json) ignores `packages/**`. Run a workspace command with
`pnpm --filter` so Fallow loads that workspace's `.fallowrc.json`. Package names are
`@pathableai/pre-ets-frontend`, `@pathableai/pre-ets-frontend-services`,
`@pathableai/pre-ets-backend`, and `@pathableai/pre-ets-domain`.

`pnpm check:unused`, `pnpm check:health`, and `pnpm check:changes` each run the matching
`fallow:*` script in the root, frontend, frontend-services, backend, and domain scopes,
and fail if any scope fails.
A path filter such as `architecture --file` or `health --complexity <path>` still builds that
workspace graph. Use it instead of repeating the all-scope scripts while editing.

## Before implementation

Inspect architecture before editing when the change introduces modules, modifies imports,
reorganizes source files, or changes application structure. For an ordinary localized edit, skip
this inspection.

In the frontend, see which zone and import directions apply to the files you expect to create or
change:

```sh
pnpm --filter @pathableai/pre-ets-frontend exec fallow guard src/features/onsite/visit-state.ts
```

`fallow guard` reports rules for those paths. It does not build the import graph. When the zone
map itself is unfamiliar, list it:

```sh
pnpm --filter @pathableai/pre-ets-frontend exec fallow list --boundaries
```

Backend, domain, frontend-services, and the repository root have no boundary zones.
`fallow guard` there reports that none are configured. Leave them unconfigured, including
frontend-services: its Effect modules are not Bulletproof zones. Ownership rules in each
workspace `AGENTS.md` remain the constraint Fallow does not encode.

## During implementation

Run a workspace-scoped check when the edit can introduce a boundary violation, an import cycle,
unused code or dependencies, unnecessary coupling, excess function complexity, or duplicated
logic. Fix that finding before continuing. Skip the check when the edit cannot introduce that
kind of issue.

| Check                                         | Command                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Boundaries and cycles after an edit           | `pnpm --filter <package> exec fallow architecture --file <path>`                                       |
| Boundaries only, or cycles only               | Add `--boundaries` or `--cycles` to the architecture command                                           |
| Unused code or dependencies in specific files | `pnpm --filter <package> exec fallow dead-code --file <path>`                                          |
| Why an export or dependency looks unused      | `pnpm --filter <package> exec fallow dead-code --trace <file>:<export>` or `--trace-dependency <name>` |
| Complexity of a file or directory             | `pnpm --filter <package> exec fallow health --complexity <path>`                                       |
| Possible duplication                          | `pnpm --filter <package> exec fallow dupes`                                                            |
| Semantically similar functions (advisory)     | `pnpm --filter <package> exec fallow similar-code`                                                     |

`fallow dupes` uses the shared `duplicates.mode` of `semantic`, so renamed identifiers and changed
literals count as the same structure. The completion audit includes those structural clones for
changed files. A full duplication report stays advisory: it does not fail on a duplication
percentage. `fallow explain <issue-type>` describes one finding type and does not analyze the
repository: `pnpm exec fallow explain boundary-violation`.

`fallow similar-code` is a separate review. It does not run inside `fallow dupes`, `fallow audit`,
bare `fallow`, or the three completion commands. Check readiness first:

```sh
pnpm --filter @pathableai/pre-ets-frontend exec fallow similar-code status
```

When the pinned local model is missing, ask a person to run `fallow similar-code setup --local`.
Agents do not run setup or approve the download. Project config cannot select or download the
model. Run discovery in the workspace you are changing; a root run skips `packages/**`. A
candidate is not a finding. Its score is not a probability, a proof that two functions behave the
same, or permission to merge them. Inspect both functions, their callers, and their tests before
suggesting a consolidation.

`fallow dead-code` still reports cycles and boundary findings, so a targeted dead-code run can
surface them. Prefer `fallow architecture` when that is the question.

## Before completing implementation

From the repository root, run:

- `pnpm check:unused` — dead code, dependency hygiene, cycles, and boundary findings for every scope. The workspace script is `fallow:unused` (`fallow dead-code`).
- `pnpm check:health` — functions over the complexity ceilings for every scope. The workspace script is `fallow:health` (`fallow health --complexity`).
- `pnpm check:changes` — changed-file audit for every scope. Each workspace script is `fallow audit --gate new-only` with its own gate marker (`root`, `frontend`, `frontend-services`, `backend`, or `domain`).

`check:unused` and `check:health` examine each whole scope. `check:changes` fails on findings the
changeset introduced and reports inherited findings without failing on them. Set
`FALLOW_AUDIT_BASE` to pin the comparison commit, for example
`FALLOW_AUDIT_BASE=origin/main pnpm check:changes`. CI sets that variable to the event's base
commit. The pre-commit hook runs `pnpm check:changes` once, after lint-staged, and includes
unstaged and untracked work.

Also run `pnpm typecheck`, `pnpm build`, `pnpm lint`, and `pnpm format:check`.

Report every unresolved finding and whether it is pre-existing or introduced.
`pnpm check:changes` is the attribution check. A finding that appears in a whole-scope command
and not in that audit is pre-existing or outside the changed files.

Broader analysis is advisory. `pnpm fallow` analyzes root-owned files. `pnpm --filter <package> exec fallow` analyzes one workspace. Use either when a targeted command does not answer the question.

## Frontend Bulletproof zones

[`packages/frontend/.fallowrc.json`](../../packages/frontend/.fallowrc.json) sets the Bulletproof
preset and requires every analyzed source file to match a zone. These are the zones Fallow
reported for this workspace:

| Zone       | Patterns                                                                                                                                                                   | May import                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `app`      | `src/app/**`                                                                                                                                                               | `features`, `shared`, `server`, and `app` |
| `features` | `src/features/**`                                                                                                                                                          | `shared`, `server`, and `features`        |
| `server`   | `src/server/**`                                                                                                                                                            | `shared` and `server`                     |
| `shared`   | `src/components/**`, `src/hooks/**`, `src/lib/**`, `src/utils/**`, `src/utilities/**`, `src/providers/**`, `src/shared/**`, `src/types/**`, `src/styles/**`, `src/i18n/**` | `shared`                                  |

Same-zone imports are allowed. `src/lib` and `src/components` are both `shared`, so Fallow allows
imports between them. Read the zone from `fallow guard` for the file you are changing. A
directory name alone does not grant a permission.

`src/lib` is absent. Effect services for the frontend process live in
`packages/frontend-services`, not in this zone. The onsite feature lives in
`src/features`. The public entry `src/features/onsite.ts` owns the private files
under `src/features/onsite/`. App routes and tests import that entry. Only that
parent imports its children for external use. Internal sibling imports inside
the feature remain as they already were. `src/components` and `src/server` are
absent on purpose. Nothing is shared UI yet, and the Bulletproof `shared` zone
stays configured for later shared UI. `src/server` stays absent until a server
module has a real caller that cannot live in `src/app`. Fallow may warn that
`shared` and `server` match no files. That warning is expected until those
zones have real files. Do not add empty directories or placeholder modules to
silence it.

`src/instrumentation.ts` and `src/proxy.ts` are the configured `allowUnmatched` files: they have
no zone, and their imports are unrestricted. `fallow guard` marks other unmatched paths with
`coverage_required`. A reachable file in that state is a boundary-coverage error. Frontend tests
sit outside the zones; `fallow architecture --boundaries` does not currently report them, so
leave tests where they are. Boundary violations and boundary-coverage gaps are error severity.

## Recursive modules

The root [AGENTS.md](../../AGENTS.md) module rule still applies. A public entry such as
`packages/frontend-services/src/tenant.ts` owns the private modules under `src/tenant/`.
Only that parent imports its children. Siblings and external tests use the public entry.

Bulletproof does not encode that rule. An import of a private child can stay inside `shared` and
pass Fallow. Follow the module rule when Fallow reports no boundary violation.

When a finding disagrees with an established module boundary, or the preset zone does not match
the intended design, keep the current layout. Explain the conflict and ask for human review
before changing `.fallowrc.json` or moving files to satisfy the preset.

## Complexity, dead code, and type-aware analysis

Shared [`.fallowrc.shared.json`](../../.fallowrc.shared.json) fails complexity above cyclomatic
10, cognitive 10, and CRAP 30. Two overrides are already authorized, with reasons in config:

- Root [`tests/bdd/support/server.ts`](../../tests/bdd/support/server.ts): CRAP 60 for `response.on("end")`, `signalProcessGroup`, `stopSite`, and `waitUntilReady`.
- Frontend [`src/features/onsite/visit-state.ts`](../../packages/frontend/src/features/onsite/visit-state.ts): cyclomatic 15 for `transitionVisit`.

Frontend dead-code analysis runs in production mode. Production code counts as live only when it
is reachable from Next.js framework entry points, including routes, layouts, proxy, and
instrumentation. Library files, ordinary helpers under `app`, and server-action modules need an
import from reachable app code. Unit tests and repository BDD fixtures do not establish that
liveness, and no frontend source-directory glob grants it. Production mode applies to dead-code
analysis. Audit health and duplication checks still include frontend tests and tooling files.
Backend and root analysis keep their normal test and tooling reachability.

The root configuration records the dprint npm plugins and the Effect language-service schema
dependency as tooling references. It also ignores the `effect` and `@effect/platform-node`
dependencies declared at the root.

Type-aware analysis is enabled in best-effort mode against each scope's `tsconfig.json`. It
confirms symbol use for Fallow findings and does not replace `pnpm typecheck`. A partial or
unavailable checker result keeps the finding. `private-type-leaks` is an error.
An exported signature must not reference a same-file type that callers cannot name.
Export that type, or change the signature so it uses an exported type.

## Responding to a finding

1. Read the finding. Run `pnpm exec fallow explain <issue-type>` when the type is unclear.
2. Fix a violation this change introduced.
3. Leave a pre-existing finding in place and report it as pre-existing, using `pnpm check:changes` to separate introduced findings from inherited ones.
4. When a finding looks like a false positive or a legitimate exception, investigate it, explain the conflict, and ask for human review.

Coding agents must not add `fallow-ignore` comments, `@expected-unused` tags, ignore patterns,
`allowUnmatched` entries, baselines, or weaker severities or ceilings. Do not restructure code
only to change an analysis metric. Do not install or rewrite Fallow hooks. The same prohibition
covers ESLint, TypeScript, and other checks: see the root [AGENTS.md](../../AGENTS.md) and
[`.cursor/rules/no-check-disable-comments.mdc`](../../.cursor/rules/no-check-disable-comments.mdc).
`require-suppression-reason` is an error, and Fallow is configured not to suggest inline
suppressions. Only a human developer may approve an exception. Leave the authorized overrides and
ignore entries above as they are written.
