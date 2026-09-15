# Quickstart: Session Setup Validation

## Status and prerequisites

This is the implementation validation guide for the session-setup delivery. Compose Redis,
session libraries, Proxy/AppLayout integration, unit contracts, and Cucumber session steps are
on this branch. Prefer `pnpm test:bdd:session` for runtime verification; `test:bdd:dry` only
validates discovery.

Use Node >=24, the root-pinned pnpm, Docker with Compose, and the existing Playwright browser setup from
the root README. Run commands from the repository root. Use only synthetic tenant records and an
isolated local Redis service. Keep session settings in `packages/frontend/.env.local` (untracked).

**Rollback reminder**: if enabling session setup causes 503s that block tenant pages, revert the
Proxy/session integration; Redis Compose may remain. Prefer safe outcome-class diagnostics only (reuse /
create / 403 / 500 / 503)—never secrets, cookies, or session ids.

## Start the implemented local service

```sh
pnpm install --frozen-lockfile
docker compose config
docker compose up -d --wait redis
docker compose exec redis redis-cli ping
```

Expect a single official pinned Redis service, bound to `127.0.0.1:6379`, and `PONG`. The Compose file
must not start frontend/backend, Postgres, or a broker. `docs/docker-compose.md` must describe this
Redis-only layout in the same implementation slice that introduces it.

Copy the frontend `.env.example` to `.env.local` if no local file exists; preserve existing settings.
Set `REDIS_URL=redis://127.0.0.1:6379` (plain URL allowed only for loopback; non-local deployments must
use `rediss://` or equivalent with authenticated ACL or mTLS), leave `SESSION_TTL_SECONDS=86400` unless
testing expiry, and set `SESSION_STORE_TIMEOUT_MS=2000`. Generate `SESSION_SIGNING_SECRET` locally and
retain it across frontend restarts; the example must have no usable embedded key. Session settings are
parsed lazily—clean checkout build/typecheck must succeed before `.env.local` exists:

```sh
node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))'
```

Use the existing documented `TENANT_CONFIG_RECORDS_JSON` format for known Springfield/Shelbyville
records. Start `pnpm dev:frontend` and open `http://springfield.localhost:3000/`. Also repeat using the
existing development-only static configuration on `http://localhost:3000/`. Do not add tenant records
or a tenant override to Redis. For production testing, use the existing production fixture and original
Host transport; local static settings must not enable production localhost access.

## Validation order

1. Run frontend unit contracts and existing tenant regression tests:

   ```sh
   pnpm --filter @pathableai/pre-ets-frontend test:unit
   ```

   Add cookie/schema/ordering/failure tests to this existing suite during implementation. Validate
   exact expiry using an injected clock, asynchronous read-before-tenant order, mismatched tenants,
   write failure, repeat access, rejection of non-positive/non-representable TTL (without a raw
   `SESSION_TTL_SECONDS` vs `SESSION_STORE_TIMEOUT_MS` integer compare), lazy missing-config 500,
   and TLS/authenticated URL validation. Do not claim these doubles establish real Redis continuity.

2. Run real Redis adapter and HTTP/browser acceptance checks through the session BDD harness:

   ```sh
   pnpm test:bdd:dry
   pnpm test:bdd:session:contract
   pnpm test:bdd:session
   ```

   CI runs `pnpm test:bdd:session:contract` (`@session-setup and @contract and not @http`) until
   T017/T021/T025/T028 close the HTTP/browser partition. Run full `pnpm test:bdd:session` locally
   when exercising lifecycle, recovery, and local-service scenarios.

   Equivalent: `CUCUMBER_SESSION=1` with the session tag partition used by `test:bdd:session`.
   Implementation must extend fixtures to start/stop its own frontend processes, set a unique
   `SESSION_KEY_PREFIX` (or isolated Redis DB) in the child process environment, track scenario-owned
   ids/keys, and clean only that namespace—never `FLUSHALL`. Constructor injection alone is insufficient
   for spawned processes. Complete the existing pending steps before treating this as verification.

   Tag lifecycle cases that need a real cookie jar with `@browser` (or run an explicit Playwright
   partition). Keep local development and production server settings isolated; do not reuse a build
   process with stale tenant settings. Production cookie tests need HTTPS browser transport or explicit
   raw header assertions; a Secure cookie on an HTTP browser is not continuity evidence.

3. Run the full tenant suite after session integration to protect existing tenant behavior:

   ```sh
   pnpm test:bdd
   ```

   Adapt the existing server fixture to supply synthetic session settings and Redis to tenant cases.
   Provision Redis (and the same synthetic env) in `.github/workflows/ci-bdd.yml` for the jobs that run
   `pnpm test:bdd` and `pnpm test:bdd:session:contract` (green `@contract and not @http` partition until
   T017/T021/T025/T028) / full `pnpm test:bdd:session` locally before session steps are required
   to pass. Extend that workflow's path filters so frontend session source changes (for example
   `packages/frontend/src/**`, especially `proxy.ts` and `lib/session/**`) trigger BDD detection—not only
   `features/**` / `tests/bdd/**`. Do not skip tenant scenarios merely because they now need session
   infrastructure. There is no root `ci.yml`; do not document or edit a non-existent workflow file.

4. Run repository checks before committing:

   ```sh
   pnpm typecheck
   pnpm build
   pnpm lint
   pnpm format:check
   pnpm check:unused
   git diff --check
   ```

   Explicitly format/check `specs/002-setup-session` if root formatting does not include nested spec
   files. If fixes are needed, apply lint fixes before formatting; preserve normal commit hooks.
   Confirm `pnpm build` / `pnpm typecheck` still pass in a clean tree without session secrets.

## Lifecycle evidence checklist

- First visit: successful existing tenant page without extra action; inspect response cookie and verify
  matching Redis record. At the lower layer prove persistence precedes cookie issuance and the first
  render / `AppLayout` receives that same id. Assert one create across repeated same-request access.
- Revisit/reload: browser keeps the same reference; Redis tenant/id/expiry stay unchanged. Stop only
  the frontend, restart with the same signing secret, and reload **without discarding the browser
  cookie jar** (preserve context or capture/replay the raw cookie); continuity must still hold.
- Isolation: navigate to another tenant; browser must not send the first host's cookie. Separately
  force signed cross-tenant references via HTTP fixtures to exercise all cookie/record mismatch rows;
  none may expose or modify old state. Unknown/removed tenants retain 403 without cookies. Forge
  `x-pathable-session-context`, `x-preets-tenant-slug`, `x-preets-tenant-origin`, and other
  `x-preets-tenant-*` headers; none can select id/tenant or skip checks.
- Recovery: test missing, tampered, malformed, expired, unknown and evicted references. Unknown ids are
  never adopted; replacements have fresh ids. Compare record expiry and cookie expiry to the application
  clock; Redis `EXAT` uses those same seconds. After a create write-timeout 503, retry may mint a new id.
- Failure: stop Redis with `docker compose stop redis`; request with a valid cookie and without one
  to exercise read and creation failures. Expect bounded 503, no tenant content and no new cookie.
  Restart with `docker compose start redis` and wait for `redis-cli ping` to succeed; retry must recover.
  A stopped/restarted Redis may lose records, so fresh setup is valid; intact-record reuse has a separate fixture.
- Resources: request an existing static/framework resource with an empty cookie jar; no session key or
  cookie is created.
- Modes: prove host-mode Springfield and static-mode `http://localhost:3000/` both establish sessions
  without regressing Display Name or local-config error guidance.

## Shutdown

Stop the host-run frontend normally, then run `docker compose down`. Never run `FLUSHALL` or delete
unrelated session keys. Record observed outcomes and any environment limitations in the implementation
PR; this guide and a dry run alone are not proof that runtime behavior works.

## Implementation evidence (this branch)

| Gate                                                               | Status                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit / Redis adapter contracts                                     | Pass (`pnpm --filter @pathableai/pre-ets-frontend test:unit`; Redis integration skips when Redis is down)                                                                                                                                         |
| Cucumber dry-run                                                   | Pass (`pnpm test:bdd:dry`)                                                                                                                                                                                                                        |
| Contract-only session scenarios (`pnpm test:bdd:session:contract`) | Pass in CI (`@session-setup and @contract and not @http`)                                                                                                                                                                                         |
| Full `pnpm test:bdd:session` HTTP/browser partition                | Partial — free-port harness and step implementations are in place; remaining failures cluster on production `next start` churn, Redis stop/start fixtures, and a few HTTP cookie-jar assertions. Tracked by open tasks T017 / T021 / T025 / T028. |
| Clean checkout build/typecheck without session secrets             | Pass for lazy config parse                                                                                                                                                                                                                        |
