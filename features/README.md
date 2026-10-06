# Requirements BDD

Executable acceptance scenarios live under [`tests/bdd/requirements/`](../tests/bdd/requirements/).
They observe a running Next.js application over HTTP. Tests never connect to Redis or other
backing services directly; Compose (or CI services) may still run for the app process.

The historical Spec Kit capability suite has been removed. Surviving dispositions for retired
scenarios remain in the [migration ledger](TRACEABILITY.md) (not an active runner).

## Run

From the repository root, with Redis available when the app needs it (the runner never manages
Compose):

```sh
pnpm --filter @pathableai/pre-ets-frontend build   # when scenarios use production mode
pnpm test:bdd:dry
pnpm test:bdd
```

`REDIS_URL` defaults to `redis://127.0.0.1:6379` for the owned Next process. Each scenario owns a
temporary tenant directory and random session signing material. Cleanup removes only that
scenario's resources.

| Command                | Evidence                                                                          |
| ---------------------- | --------------------------------------------------------------------------------- |
| `pnpm test:bdd:dry`    | Parse features and discover step bindings; no runtime evidence                    |
| `pnpm test:bdd`        | Run requirements scenarios against an owned Next process via HTTP                 |
| `pnpm test:bdd:checks` | Harness regression checks that still protect fixtures used by BDD/E2E             |
| `pnpm test:e2e`        | Separate real-Keycloak authentication journeys; see [E2E setup](../e2e/README.md) |

Optional `@development` selects `next dev`; otherwise scenarios use production `next start` (requires
a frontend build). Dependency tags such as `@redis` are not required—the app receives `REDIS_URL`
whenever the harness starts it.

Step definitions stay HTTP-only. See [step guidance](../tests/bdd/steps/README.md).

CI runs discovery separately and executes the runtime suite on relevant PRs, main, and manual
dispatch. Real-Keycloak E2E stays manual.
