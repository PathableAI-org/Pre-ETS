---
name: drift-review
description: Review one Pre-ETS area of the codebase for slow architectural and maintainability drift from its owning documents, verify and cap the findings, and file or update GitHub issues labelled drift. Read-only on the repository. Use for the weekly scheduled drift review or when a person asks for a drift review of an area.
---

# Drift review

Read [Drift review](../../../docs/engineering/drift-review.md) first. It owns the area list, the scope and categories,
the finding fields, the issue format, and how an area is chosen. This skill supplies the procedure. Also read
[AGENTS.md](../../../AGENTS.md) and [Testing as evidence](../../../docs/engineering/testing/README.md).

Follow the [requirements guide](../../../docs/requirements/README.md#public-source-attribution)'s public-source
attribution rule: never name a partner or client in any issue, comment, or report.

## Arguments

- `scheduled`: a scheduled run. File and update issues without asking, then end with the report.
- Otherwise the run is interactive: show the findings and the exact issue changes, and write nothing to GitHub until
  the person approves.
- `area=<id>`: review that area instead of choosing by churn.
- `dry-run`: choose, review, and report, but write nothing to GitHub.

## Boundaries

- Never edit, create, or delete a repository file, branch, commit, or pull request. Never push.
- Do not install dependencies, start services, or reach any host other than GitHub. Verify by reading, tracing,
  searching, and Git history.
- Write to GitHub only issues and issue comments labelled `drift`, through `gh api` REST calls. `gh issue` and `gh pr`
  use GraphQL, which cloud sessions cannot reach.
- Never print or file credentials, tokens, cookies, session references, or record data.
- Do not file Fallow, lint, or typecheck findings. Their output is context only.

## Procedure

### 1. Set up

1. From the repository root, derive the repository slug from the `origin` URL's last two path segments, without
   `.git`, and set `R=<owner>/<repo>`. Find the default branch with `gh api repos/$R --jq .default_branch`.
2. If `git rev-parse --is-shallow-repository` prints `true`, run `git fetch --unshallow origin`. Run
   `git fetch origin <default>` and set `SHA=$(git rev-parse origin/<default>)`. This is the reviewed commit.
3. If `HEAD` is not `SHA`, read files with `git show $SHA:<path>`, or add a detached worktree at `SHA` under a
   temporary directory outside the repository and remove it when done. Never switch the current checkout.
4. Check the label with `gh api repos/$R/labels/drift`. If it is missing: in an interactive run, ask the person before
   creating it (`gh api repos/$R/labels -f name=drift -f color=5319e7 -f description="Slow architectural or maintainability drift found by the drift review"`);
   in a scheduled run, create nothing and end with a report that the label is missing.
5. Find the tracking issue: the issue titled `Drift review log` among
   `gh api "repos/$R/issues?labels=drift&state=all&per_page=100" --paginate` (skip entries with a `pull_request`
   field). If none exists, create it in a scheduled run, or with approval in an interactive run, with label `drift` and
   a body that links to the drift review guide and says each comment records one run.

### 2. Choose the area

1. Read the tracking issue's comments
   (`gh api repos/$R/issues/<n>/comments --paginate`) and take, for each area, the latest comment whose first line is
   `<!-- drift-review area=<area> sha=<sha> -->`. If that commit no longer exists (`git cat-file -e <sha>^{commit}`
   fails), use the comment's `created_at` as the area's last review date instead.
2. Read each area's paths from the guide's `## Areas` section: the backticked list items under `Paths`. Count churn as
   the guide defines it:

   ```bash
   doc=docs/engineering/drift-review.md
   paths_of() { awk -v a="### \`$1\`" '$0==a{f=1;next} /^### /{f=0} f && /^  - `/{gsub(/^  - `|`$/,"");print}' "$doc"; }
   mapfile -t p < <(paths_of "$area")
   git rev-list --count "$last..$SHA" -- "${p[@]}"          # reviewed before, by commit
   git rev-list --count --since="$date" "$SHA" -- "${p[@]}" # reviewed before, commit gone
   git rev-list --count --since=90.days "$SHA" -- "${p[@]}" # never reviewed
   ```

3. Choose the area with the most churn, then the oldest review, then guide order, unless `area=<id>` was given. If
   every area has zero churn, go to step 6 and record that no area changed.
4. List the commits since the last review that touch the area
   (`git log --format='%h %s' <range> -- "${p[@]}"`). They show where drift is likely, but review the area as it
   stands at `SHA`, not only the diff.

### 3. Review

Read the area's owning documents in full, every source file and test under its paths, and the workspace `AGENTS.md`
for each workspace it touches. Then look for each category in the guide's scope table. Useful checks:

- **contract-drift**: take each concrete promise in the owning document (an outcome, status, header, ordering,
  ownership statement, or named operation) and find the code that keeps it. Check that names, paths, pages, and
  operations the document mentions still exist, and that statements about what is deferred or not yet built are still
  true. Compare the area's documents with each other and with other owning documents that describe the same code: two
  documents that disagree are drift. Code comments that restate a document's promise count too.
- **duplication** of a pattern: when several siblings follow one pattern (for example self-contained response
  documents, or handlers that share a preamble), check that each still follows it, and report the ones that fell
  behind.
- **module-ownership**: for each parent module with a child directory, search the workspace for imports of a child
  path from anywhere other than its parent (tests included). Check that each re-export from a parent has a current
  consumer outside the parent.
- **duplication**: for each helper, constant, type, and schema in the area, search the owning workspace and the package
  it shares behavior with (frontend-services and the Next app share cookies, cache headers, and host handling) for
  another that means the same thing.
- **complexity**: look for modules that now hold several unrelated responsibilities, and for options, parameters,
  generic types, or abstractions with a single caller or a single value in use.
- **test-meaningfulness**: for each documented promise, find the test that would fail if it broke. Report a promise
  with no such test, or a test whose assertions would survive the behavior breaking.

Do not report: style preferences; anything the owning document already lists as a known gap, accepted limitation, or
linked open issue; Fallow, lint, or typecheck findings; or a change that would merely be nicer. A single unused
parameter, a redundant local, or a naming nit is not drift unless it misleads a maintainer about behavior. One
finding can cover several locations of the same drift: report it once and list the other locations in its summary or
failure scenario.

### 4. Verify and cap

For each candidate, before keeping it:

1. Re-read the cited code at `SHA` and the document passage it depends on, and trace the path end to end.
2. Try to refute it: look for an approved exception in the owning document, `AGENTS.md`, the constitution, or the
   feature's `specs/` record, a caller or test you missed, or an open issue that already covers it.
3. Write the `failureScenario` with concrete inputs or state and the wrong outcome, or the concrete change a
   maintainer would get wrong. If you cannot, drop the candidate.
4. Record in `verification` what you read, traced, searched, or ran.

Keep only `high` and `medium` confidence findings. Sort by severity, then confidence, and keep at most five.

### 5. Deduplicate

List the open `drift` issues and those closed as not planned
(`gh api "repos/$R/issues?labels=drift&state=closed&per_page=100" --paginate`, keeping `state_reason` of
`not_planned`). The `drift-finding` marker's area, category, and file narrow the candidates; read each candidate's
summary to decide. Several issues can share a marker, and the same drift is a match even when its line moved.

- Matches an open issue: plan a comment instead of a new issue.
- Matches an issue closed as not planned: drop it, unless the code changed so the closing decision no longer applies;
  then file a new issue that links the closed one and says what changed.
- No match: plan a new issue.

### 6. File and record

In an interactive run, show the person the planned issues, comments, and tracking comment in full, and wait for
approval. Apply their edits. In a `dry-run`, show them and stop.

New issue (`gh api repos/$R/issues -f title=... -f body=... -f 'labels[]=drift'`), titled
`drift(<area>): <summary>`:

```markdown
**Area:** `<area>` ([drift review](https://github.com/<R>/blob/<default>/docs/engineering/drift-review.md))
**Reviewed commit:** <SHA>
**Severity:** <severity> · **Category:** <category> · **Confidence:** <confidence>
**Location:** [`<file>:<line>`](https://github.com/<R>/blob/<SHA>/<file>#L<line>)
**Owning document:** <absolute link to the document section at `<SHA>`>

<summary>

**Failure scenario.** <failureScenario>

**Verification.** <verification>

<!-- drift-finding area=<area> category=<category> file=<file> -->
```

Update to an open issue (`gh api repos/$R/issues/<n>/comments -f body=...`): `Still present at <SHA>`, the current
location, and only evidence the issue does not already have.

Issue text is not rendered in the repository, so every link in it is an absolute GitHub URL.

Then comment on the tracking issue, every run, including runs with no findings:

```markdown
<!-- drift-review area=<area> sha=<SHA> -->

**<area>** reviewed at <SHA> · <n> commits since <last sha or date, or "first review">
Filed: #a, #b · Updated: #c · Dropped after verification: <count>
```

When no finding survives, say `No verified findings.` in place of the issue lists. When no area changed, use
`area=none` in the marker and say every area is unchanged since its last review.

### 7. Report

End with: the area and why it was chosen (the churn table), the reviewed commit, links to issues filed and updated,
the tracking comment's link, and how many candidates were dropped and why, in one line each. Remove any temporary
worktree.
