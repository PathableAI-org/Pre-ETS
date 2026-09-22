# Authentication and timeout E2E tests

Start the existing Compose services manually before running the suite:

```sh
docker compose up -d --wait redis keycloak
pnpm exec playwright install chromium
pnpm test:e2e
```

Compose requires the bootstrap administrator settings documented in
[local services](../docs/docker-compose.md). The imported realm must contain the
synthetic `demo` / `demo` user and `springfield-web` public client.

Leave port 3000 free. Playwright starts and stops its own development frontend
with static Springfield resolution from an isolated temporary tenant directory, a five-minute idle policy, fresh signing
secrets, and isolated Redis prefixes. It never manages Compose services or
changes local environment files. Existing servers are not reused.

```sh
pnpm test:e2e --headed
pnpm test:e2e --debug
pnpm exec playwright show-report playwright-report/e2e
```

Each test signs in through real Keycloak and the application callback. Timeout
fixtures age only the authenticated test session's activity timestamps while
preserving its absolute lifetime and Redis TTL. The application performs the
actual expiration. Focus revalidation exercises running-page recovery without
waiting five minutes or mocking authentication responses.

The suite covers login continuity, expired-cookie denial, keyboard recovery,
real SSO recovery, failed credentials and retry, and shared-tab expiration.
The temporary-content fixture only proves removal of that protected UI; it does
not prove general draft or saved-record persistence. Host-based tenant isolation,
production builds, provider outages, and CI execution are outside this suite.

Failures retain screenshots and traces in `test-results/e2e` and an HTML report
in `playwright-report/e2e`. Cleanup removes only this invocation's Redis keys.
