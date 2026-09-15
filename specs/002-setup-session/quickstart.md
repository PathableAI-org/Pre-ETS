# Quickstart: Session Setup Validation

## Status and prerequisites

This is the implementation validation guide. This planning PR does not add Compose, session libraries,
or working session steps. The commands below that depend on those additions are intended for the
implementation branch. Current `test:bdd:dry` validates discovery only; it does not execute session logic.

Use Node >=24, the root-pinned pnpm, Docker with Compose, and the existing Playwright browser setup from
the root README. Run commands from the repository root. Use only synthetic tenant records and an
isolated local Redis service. Keep session settings in `packages/frontend/.env.local` (untracked).

## Start the implemented local service

```sh
pnpm install --frozen-lockfile
docker compose config
docker compose up -d --wait redis
docker compose exec redis redis-cli ping
```

Expect a single official pinned Redis service, bound to `127.0.0.1:6379`, and `PONG`. The Compose file
must not start frontend/backend, Postgres, or a broker.

Copy the frontend `.env.example` to `.env.local` if no local file exists; preserve existing settings.
Set `REDIS_URL=redis://127.0.0.1:6379`, leave `SESSION_TTL_SECONDS=86400` unless testing expiry, and set
`SESSION_STORE_TIMEOUT_MS=2000`. Generate `SESSION_SIGNING_SECRET` locally and retain it across frontend
restarts; the example must have no usable embedded key:

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
   write failure, and repeat access. Do not claim these doubles establish real Redis continuity.

2. Run real Redis adapter and HTTP acceptance checks through the existing session BDD harness:

   ```sh
   pnpm test:bdd:dry
   pnpm exec cucumber-js --config cucumber.mjs --tags '@session-setup'
   ```

   Implementation must extend fixtures to start/stop its own frontend processes, isolate Redis keys,
   and clean only scenario-owned records. Complete the existing pending steps before treating this as
   verification. Keep local development and production server settings isolated; do not reuse a build
   process with stale tenant settings. Production cookie tests need HTTPS browser transport or explicit
   raw header assertions; a Secure cookie on an HTTP browser is not continuity evidence.

3. Run the full `pnpm test:bdd` suite after session integration to protect existing tenant behavior.
   Adapt the existing server fixture to supply synthetic session settings and Redis to tenant cases.
   Do not skip tenant scenarios merely because they now need session infrastructure.

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

## Lifecycle evidence checklist

- First visit: successful existing tenant page without extra action; inspect response cookie and verify
  matching Redis record. At the lower layer prove persistence precedes cookie issuance and the first
  render receives that same id. Assert one create across repeated same-request access.
- Revisit/reload: browser keeps the same reference; Redis tenant/id/expiry stay unchanged. Stop only
  the frontend, restart with the same signing secret, and reload; continuity must still hold.
- Isolation: navigate to another tenant; browser must not send the first host's cookie. Separately
  force signed cross-tenant references via HTTP fixtures to exercise all cookie/record mismatch rows;
  none may expose or modify old state. Unknown/removed tenants retain 403 without cookies.
- Recovery: test missing, tampered, malformed, expired, unknown and evicted references. Unknown ids are
  never adopted; replacements have fresh ids. Compare record expiry and cookie expiry to the same clock.
- Failure: stop Redis with `docker compose stop redis`; request with a valid cookie and without one
  to exercise read and creation failures. Expect bounded 503, no tenant content and no new cookie.
  Restart with `docker compose start redis` and wait for `redis-cli ping` to succeed; retry must recover.
  A stopped/restarted Redis may lose records, so fresh setup is valid; intact-record reuse has a separate fixture.
- Resources: request an existing static/framework resource with an empty cookie jar; no session key or
  cookie is created. Forge the reserved context header on a tenant request; it cannot select an id/tenant.

## Shutdown

Stop the host-run frontend normally, then run `docker compose down`. Never run `FLUSHALL` or delete
unrelated session keys. Record observed outcomes and any environment limitations in the implementation
PR; this guide and a dry run alone are not proof that runtime behavior works.
