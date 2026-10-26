# Execution evidence: reference session enforcement

This record is separate from `verification.md`. It does not close delivery issue #219 and it does not
treat static checks, dry-run discovery, or a skipped test as runtime verification.

## Revision and environment

- Branch: `158-reference-session-enforcement-impl`
- Requirement baseline: `origin/main` at `f11843150903be95b62a759ea012f1a8bc966e2c`. The five cited session
  requirements match that revision. Issue #219 was still open on 2026-10-26 and its authorized outcome
  matches the specification. PREETS-SESSION-004 on that baseline already includes the 2026-10-17 freshness
  wording; B6 comparison, clock tolerance, and provider support remain open.
- Node.js 26.2.0. Effect 4.0.5. Next.js 16.4.3. `@pathableai/react` 0.3.0.
- Redis was already running on loopback and answered `PONG`. It was not started or stopped by this execution.
- Synthetic labels: Springfield, Shelbyville, and `subject-1`. No cookie values, session references, Redis
  keys, or provider secrets are retained here.

## Commands

- `pnpm --filter @pathableai/pre-ets-frontend-services test -- tests/lib/session.test.ts tests/unit/reference-session-enforcement.test.ts`
  passed, including the rest of that package's unit suite.
- `pnpm --filter @pathableai/pre-ets-frontend-services exec vitest run --config vitest.integration.config.ts tests/integration/session-redis.test.ts`
  passed. Cleanup deletes only keys under a validated `test:session:<uuid>:` prefix. This is not two
  application instances and it is not HTTP 403.
- Frontend unit scenarios for the reference page, action, and public-route wiring passed.
- `node --test tests/bdd/session/reference-session-enforcement.test.ts` passed one running-app case and
  skipped two cases, recorded below.
- `pnpm lint:gherkin` and `pnpm format:gherkin:check` passed.
- `pnpm test:bdd` built the app, then failed 9 browser scenarios because Playwright looked in an empty sandbox browser cache. Rerunning `cucumber-js --config cucumber.mjs` with the installed browser cache passed 43 scenarios and 559 steps. `pnpm test:bdd:dry` only discovered scenarios. `pnpm test:bdd:checks` passed 6 harness checks.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm check:unused`, `pnpm check:health`, and `pnpm check:changes` passed. They are repository quality, not V-001 through V-010.

## Claims

| Claim | Result                                                      | Observation                                                                                                                                                                                                                 |
| ----- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-001 | Pass at the exercised reference boundary                    | Request tenant is resolved before admission. A matching fixture session renders that tenant. A different tenant is not substituted.                                                                                         |
| V-002 | Incomplete                                                  | B6 freshness confirmation is not approved or functioning. The confirmed-fresh instance A to instance B case is skipped. A fixture, a redirect, or signed `auth_time` is not that confirmation.                              |
| V-003 | Pass at the running boundary                                | A direct HTTP request to instance B with Shelbyville's portful Host and Springfield's session cookie returned 403, the bounded forbidden heading, and no receipt.                                                           |
| V-004 | Pass for the reference page                                 | A request with no usable session, after tenant success, returned 307 to same-origin `/auth/login` with no protected content and no receipt.                                                                                 |
| V-005 | Pass for the rendered action                                | After the owned record was removed, the already rendered form returned denial, did not start login, and did not add a receipt.                                                                                              |
| V-006 | Incomplete for the running page                             | Redis was already shared by this machine, so it was not stopped. The disconnected-client service test still distinguishes `SessionServiceUnavailable` from absence and admission. This is not outage recovery.              |
| V-007 | Pass for the exercised public and tenant-failure boundaries | Cucumber reported 43 scenarios passed after the browser cache path was set. Public callback, login failure, and diagnostic resources stayed reachable. Host-mode tenant failures on `/` stayed 404 or 500 instead of login. |
| V-008 | Pass for the reference control                              | Tab reached "Record reference operation" with a visible outline or shadow, and Enter submitted it.                                                                                                                          |
| V-009 | Recorded, not proof of unexercised paths                    | See the inventory disposition below and `docs/session-state.md`.                                                                                                                                                            |
| V-010 | Pass for the admitted object                                | The rendered deadline and warning matched the object returned by `establish`, not a recomputed policy.                                                                                                                      |

## Inventory disposition

- Delivered protected consumers: `GET /` and `runReferenceOperation`, with the outcome table above.
- Delivered public consumers: `/auth/callback`, `/auth/login`, `/login-unavailable`, and `/_test/*`, including
  `GET /_test/tenant-config`, remain outside `readSessionRequest`.
- Reusable fixtures: the OIDC harness `sessionPrefix`, distributed Redis tests, two-process routing in the
  issue-level test, and receipt-count observation.
- Unexercised pages, Route Handlers, Server Actions, and direct or new resources remain with #154.
- Deferred: final forbidden and recovery UI, action HTTP 401, history and freshness, renewal, invalidation,
  and outage recovery.

## Approved limitation

Confirmed-fresh instance A to instance B stays incomplete until the B6 freshness policy is approved and
functioning. This record does not invent a contract to close it.
