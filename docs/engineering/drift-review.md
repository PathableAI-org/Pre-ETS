# Drift review

Per-pull-request checks see one diff at a time. Lint, Fallow, Copilot, the verifier, and the code reviewer each judge
whether a change is acceptable, not whether an area of the codebase still matches what its owning document promises
after many acceptable changes. The drift review looks for that slow decay. It reviews one area as it stands, files what
it can verify as GitHub issues labelled `drift`, and leaves triage and fixes to a person.

This guide owns the area list, the review scope, the finding shape, and the issue format. The `drift-review` skill
supplies the procedure. A weekly cloud scheduled task runs the skill against the default branch.

## Scope

The review reads the area's owning documents, its code, and its tests at the reviewed commit, and looks for:

| Category              | Drift it looks for                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contract-drift`      | Code that no longer does what its owning document says, or a document that describes behavior the code no longer has                                                                                                                  |
| `module-ownership`    | The [module boundaries](../../AGENTS.md#module-boundaries) rule that Fallow does not enforce: a sibling importing another module's child, or a child re-exported with no current consumer                                             |
| `duplication`         | Two helpers, constants, types, or concepts that mean the same thing, within the workspace or across the packages that share it                                                                                                        |
| `complexity`          | A module whose responsibilities have grown or blurred, or flexibility nothing uses: options, parameters, or abstractions with one caller ([Principle VI](../../.specify/memory/constitution.md#vi-simplicity-and-verifiable-quality)) |
| `test-meaningfulness` | A promise in the owning document that no test would notice breaking, or a test that would still pass if the behavior it names broke, judged by [Testing as evidence](testing/README.md)                                               |
| `readability`         | Names or structure that now mislead a maintainer because the code around them changed                                                                                                                                                 |
| `correctness`         | A defect found while reviewing for the above; the review does not hunt for bugs                                                                                                                                                       |

Fallow, lint, and typecheck findings are out of scope. The review may read their output as context but never files
one. It also does not review requirements, delivery plans, or `specs/`.

The review is read-only. It edits no file, branch, or pull request, opens no pull request, and pushes nothing. It
writes only GitHub issues and issue comments labelled `drift`.

## Findings

Findings use the same fields as the code reviewer's findings, so a person triages both the same way:

- `severity`: `blocking` when the code reviewer would block a slice that introduced it today (a broken documented
  promise, an ownership violation, a test that cannot fail); otherwise `advisory`
- `category` from the table above
- `file` and `line` at the reviewed commit
- `summary`: the drift in one sentence
- `failureScenario`: concrete inputs or state and the wrong outcome they produce, or for maintainability drift the
  concrete change a maintainer would get wrong
- `confidence`: `high` or `medium`; the review drops anything less
- `verification`: how the review confirmed the finding: what it read, traced, searched, or ran

Every candidate is verified before it is reported, and unconfirmed candidates are dropped. One run reports at most
five findings, highest severity and confidence first. Fewer, verified findings are the goal; a run with no finding is a
valid result.

## Issues

Each finding is one open issue labelled `drift`, titled `drift(<area>): <summary>`. Its body lists the finding fields
and the reviewed commit, and ends with a marker the next run uses to find it:

```text
<!-- drift-finding area=<area> category=<category> file=<file> -->
```

Before filing, the review compares each finding with the open `drift` issues for the area and with the ones closed as
not planned. When a finding matches an open issue, the review comments on that issue with the new commit and any new
evidence instead of filing another. It does not refile a finding a person closed as not planned unless the code has
changed in a way that makes the original decision no longer apply, and then it says why.

Every run also comments on the tracking issue, **Drift review log**, also labelled `drift`. The comment names
the area, the reviewed commit, the area's churn since its last review, and the issues filed or updated, or says there
were no verified findings. Its first line is a marker:

```text
<!-- drift-review area=<area> sha=<full sha> -->
```

That comment is the record of the review. The next run reads the latest marker for each area to find its last
reviewed commit.

Issue titles, bodies, and comments follow the requirements guide's
[public-source attribution](../requirements/README.md#public-source-attribution) rule: never name a partner or client.
They hold no credentials, tokens, session references, or record data.

## Choosing an area

Each run reviews one area. For each area, churn is the number of commits since the area's last reviewed commit that
touch its paths, documents included; an area never reviewed counts commits from the last 90 days. The review takes the
area with the most churn, breaking ties by the oldest review, then by the order below. It skips an area with no commit
since its last review. When every area is unchanged, the run records that on the tracking issue and stops.

## Areas

Each area names its owning documents and its paths as Git pathspecs relative to the repository root, so
`git log <sha>..HEAD -- <paths>` measures its churn. Paths include the area's tests and owning documents. An area may
share a document with another. When code moves or a new owning document appears, update this list in the same pull
request.

### `session-store`

The `SessionService`, its Redis record, and the opaque reference.

- Owners: [session state](../session-state.md) (opening sections), [domain persistence](../domain-persistence.md)
- Paths:
  - `docs/session-state.md`
  - `packages/frontend-services/src/session.ts`
  - `packages/frontend-services/src/session`
  - `packages/frontend-services/src/opaque-token.ts`
  - `packages/frontend-services/tests/lib/session*.test.ts`
  - `packages/frontend-services/tests/integration/session-redis*.test.ts`
  - `packages/frontend-services/tests/helpers/session.ts`
  - `packages/frontend-services/tests/helpers/redis.ts`

### `entry-protection`

The default protection gate, protected Server Actions, and the access-denial responses.

- Owners: [default entry-point protection](../session-state.md#default-entry-point-protection)
- Paths:
  - `docs/session-state.md`
  - `packages/frontend-services/src/next/protection.ts`
  - `packages/frontend-services/src/next/session.ts`
  - `packages/frontend-services/src/next/handler.ts`
  - `packages/frontend-services/src/next/request.ts`
  - `packages/frontend-services/src/next/cookies.ts`
  - `packages/frontend/src/proxy.ts`
  - `packages/frontend/src/app/layout.tsx`
  - `packages/frontend/src/app/forbidden.tsx`
  - `packages/frontend/src/app/(app)/layout.tsx`
  - `packages/frontend/src/app/(app)/page.tsx`
  - `packages/frontend/src/app/(app)/actions.ts`
  - `packages/frontend/src/app/(app)/session-request.ts`
  - `packages/frontend/src/features/access-responses.ts`
  - `packages/frontend/src/features/access-responses`
  - `packages/frontend/src/features/session-reference.ts`
  - `packages/frontend/src/features/session-reference`
  - `packages/frontend/src/features/history-protection.ts`
  - `packages/frontend/src/features/history-protection`
  - `packages/frontend-services/tests/unit/protection.test.ts`
  - `packages/frontend-services/tests/unit/reference-session-enforcement.test.ts`
  - `packages/frontend-services/tests/integration/protection-redis.test.ts`
  - `packages/frontend/tests/unit/proxy.test.ts`
  - `packages/frontend/tests/unit/reference-session-enforcement.test.ts`
  - `tests/bdd/requirements/default-entry-protection.feature`
  - `tests/bdd/requirements/expiration-protection.feature`

### `authentication`

OIDC login, callback, freshness, and the authentication transaction.

- Owners: [authentication](../authentication.md)
- Paths:
  - `docs/authentication.md`
  - `packages/frontend-services/src/authentication.ts`
  - `packages/frontend-services/src/authentication`
  - `packages/frontend-services/src/config/authentication.ts`
  - `packages/frontend-services/src/next/login.ts`
  - `packages/frontend-services/src/next/callback.ts`
  - `packages/frontend/src/app/auth`
  - `packages/frontend/src/app/login-unavailable`
  - `packages/frontend-services/tests/lib/authentication*.test.ts`
  - `packages/frontend-services/tests/unit/authentication-entry*.test.ts`
  - `packages/frontend-services/tests/integration/authentication-redis.test.ts`
  - `packages/frontend-services/tests/helpers/authentication.ts`
  - `packages/frontend/tests/unit/authentication-*.test.ts`
  - `tests/bdd/requirements/authentication-public-resources.feature`
  - `tests/bdd/requirements/tenant-oidc-*.feature`
  - `tests/bdd/requirements/fresh-oidc-recovery.feature`
  - `tests/bdd/steps/authentication.ts`
  - `tests/bdd/steps/fresh-recovery.ts`

### `session-coordination`

Cross-tab activity, expiration, logout, and recovery in the browser, and the coordination Route Handlers.

- Owners: [cross-tab activity and logout coordination](../session-state.md#cross-tab-activity-and-logout-coordination)
- Paths:
  - `docs/session-state.md`
  - `packages/frontend/src/features/session-coordination.ts`
  - `packages/frontend/src/features/session-coordination`
  - `packages/frontend/src/features/coordination-fixtures.ts`
  - `packages/frontend/src/features/coordination-fixtures`
  - `packages/frontend/src/providers`
  - `packages/frontend/src/shared/session-recovery.ts`
  - `packages/frontend/src/shared/session-recovery`
  - `packages/frontend/src/app/session`
  - `packages/frontend/src/app/(app)/coordination`
  - `packages/frontend-services/src/next/coordination.ts`
  - `packages/frontend-services/src/next/coordination-snapshot.ts`
  - `packages/frontend/tests/unit/session-coordination.test.ts`
  - `packages/frontend-services/tests/unit/coordination.test.ts`
  - `packages/frontend-services/tests/integration/coordination-redis.test.ts`
  - `tests/bdd/requirements/session-tab-coordination.feature`
  - `tests/bdd/requirements/expired-*.feature`
  - `tests/bdd/steps/session-coordination.ts`
  - `tests/bdd/steps/expiration.ts`
  - `tests/bdd/steps/expired-recovery.ts`

### `tenant`

Tenant selection, configuration files, effective session policy, and tenant failure mapping.

- Owners: [multi-tenancy](../multi-tenancy.md)
- Paths:
  - `docs/multi-tenancy.md`
  - `packages/frontend-services/src/tenant.ts`
  - `packages/frontend-services/src/tenant`
  - `packages/frontend-services/src/config/tenant-resolution.ts`
  - `packages/frontend-services/src/request-host.ts`
  - `packages/frontend-services/src/next/tenant.ts`
  - `packages/frontend-services/src/next/tenant-failure.ts`
  - `packages/frontend/src/app/tenant-context.ts`
  - `packages/frontend/src/app/%5Ftest/tenant-config`
  - `fixtures/tenant-config`
  - `packages/frontend-services/tests/lib/tenant*.test.ts`
  - `packages/frontend-services/tests/unit/tenant-*.ts`
  - `tests/bdd/requirements/tenant-context.feature`
  - `tests/bdd/requirements/tenant-failures.feature`
  - `tests/bdd/requirements/tenant-resolution.feature`
  - `tests/bdd/steps/tenant.ts`

### `observability`

Server OpenTelemetry startup and export, browser tracing, and redaction.

- Owners: [observability](../observability.md)
- Paths:
  - `docs/observability.md`
  - `packages/frontend-services/src/observability.ts`
  - `packages/frontend-services/src/observability`
  - `packages/frontend-services/src/config/otel.ts`
  - `packages/frontend-services/src/next/browser-tracing.ts`
  - `packages/frontend/src/shared/browser-tracing.ts`
  - `packages/frontend/src/shared/browser-tracing`
  - `packages/frontend/src/instrumentation.ts`
  - `packages/frontend/src/instrumentation-client.ts`

### `runtime-config`

The frontend-services runtime, startup configuration, and its public entries.

- Owners: [configuration is decoded once at startup](effect-guidance.md#configuration-is-decoded-once-at-startup),
  [frontend-services guidance](../../packages/frontend-services/AGENTS.md)
- Paths:
  - `docs/engineering/effect-guidance.md`
  - `packages/frontend-services/AGENTS.md`
  - `packages/frontend-services/src/runtime.ts`
  - `packages/frontend-services/src/production-runtime.ts`
  - `packages/frontend-services/src/config.ts`
  - `packages/frontend-services/src/index.ts`
  - `packages/frontend-services/src/next.ts`
  - `packages/frontend-services/tests/lib/config.test.ts`

### `onsite-domain`

The backend service, shared domain schemas, migrations, and the onsite feature that consumes them.

- Owners: [domain persistence](../domain-persistence.md), [backend guidance](../../packages/backend/AGENTS.md),
  [domain guidance](../../packages/domain/AGENTS.md)
- Paths:
  - `docs/domain-persistence.md`
  - `packages/backend`
  - `packages/domain`
  - `packages/frontend/src/features/onsite.ts`
  - `packages/frontend/src/features/onsite`
  - `packages/frontend/src/app/%5Ftest/onsite`
  - `packages/frontend/tests/unit/onsite-*.test.ts`
  - `tests/bdd/requirements/onsite-prototype.feature`
  - `tests/bdd/smoke`

### `requirements-bdd`

The shared BDD harness and steps, and the traceability between scenarios and requirements.

- Owners: [requirements-backed BDD](testing/requirements-bdd.md), [BDD commands](../../features/README.md)
- Paths:
  - `docs/engineering/testing/requirements-bdd.md`
  - `features`
  - `cucumber.mjs`
  - `cucumber.smoke.mjs`
  - `tests/bdd/support`
  - `tests/bdd/steps/http.ts`
  - `tests/bdd/steps/presentation.ts`
  - `tests/bdd/steps/README.md`
