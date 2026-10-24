import { NodeHttpServer } from "@effect/platform-node"
import { ConfigProvider, Context, Effect, Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createServer } from "node:http"
import test from "node:test"
import { Client } from "pg"

import { devAppLayer } from "../dist/index.js"
import { VisitSaveError, VisitStore, VisitStoreLive } from "../dist/visit.js"

const openVisit = {
  coachId: "synthetic-coach",
  participantRef: "synthetic-participant",
  startedAt: "2026-10-21T12:00:00Z",
  tenantId: "synthetic-tenant"
}

const withServerLayer = (storeLayer, run) =>
  Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const server = HttpRouter.serve(devAppLayer).pipe(
      Layer.provide(storeLayer),
      Layer.provideMerge(NodeHttpServer.layer(createServer, { host: "127.0.0.1", port: 0 }))
    )
    const services = yield* Layer.build(server)
    const { address } = Context.get(services, HttpServer.HttpServer)
    assert.equal(address._tag, "InetAddressV4")
    return yield* Effect.promise(() => run(`http://127.0.0.1:${address.port}/visits`))
  })))

const withServer = (insert, run) => withServerLayer(Layer.succeed(VisitStore, VisitStore.of({ insert })), run)

const withDatabaseServer = (databaseUrl, run) =>
  withServerLayer(
    VisitStoreLive.pipe(Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({
      BACKEND_DATABASE_URL: databaseUrl
    })))),
    run
  )

const create = (url, body) =>
  fetch(url, {
    body: JSON.stringify(body),
    headers: { connection: "close", "content-type": "application/json" },
    method: "POST"
  })

test("returns the generated id only after one successful store call", async () => {
  const saved = []
  await withServer((visit) => {
    saved.push(visit)
    return Effect.succeed("9b9ac91d-4caf-459a-988f-b1bb2cf0f084")
  }, async (url) => {
    const response = await create(url, { ...openVisit, interventions: "Synthetic note" })
    assert.equal(response.status, 201)
    assert.match(response.headers.get("content-type"), /application\/json/u)
    assert.equal(response.headers.get("location"), null)
    assert.deepEqual(await response.json(), { id: "9b9ac91d-4caf-459a-988f-b1bb2cf0f084" })
  })
  assert.equal(saved.length, 1)
  assert.equal(saved[0].participantRef, "synthetic-participant")
  assert.equal(saved[0].interventions, "Synthetic note")
  assert.equal("endedAt" in saved[0], false)
  assert.equal("purposeOfVisit" in saved[0], false)
})

test("rejects invalid input before invoking the store", async () => {
  let calls = 0
  await withServer(() => {
    calls++
    return Effect.succeed("unexpected")
  }, async (url) => {
    for (
      const invalid of [
        { ...openVisit, participantRef: "" },
        { ...openVisit, tenantId: "unverified-tenant" },
        { ...openVisit, id: "caller-supplied-id" },
        { ...openVisit, observations: null },
        { ...openVisit, startedAt: "not-a-date" }
      ]
    ) {
      const response = await create(url, invalid)
      assert.equal(response.status, 400)
      assert.deepEqual(await response.json(), { error: "Invalid visit input" })
    }

    const malformed = await fetch(url, {
      body: "{not-json",
      headers: { "content-type": "application/json" },
      method: "POST"
    })
    assert.equal(malformed.status, 400)
    assert.deepEqual(await malformed.json(), { error: "Invalid visit input" })
  })
  assert.equal(calls, 0)
})

test("reports a single failed store call as 500 without leaking input", async () => {
  let calls = 0
  await withServer(() => {
    calls++
    return Effect.fail(new VisitSaveError({}))
  }, async (url) => {
    const response = await create(url, { ...openVisit, observations: "Synthetic private note" })
    assert.equal(response.status, 500)
    const body = await response.text()
    assert.deepEqual(JSON.parse(body), { error: "Could not save visit" })
    assert.doesNotMatch(body, /Synthetic private note|synthetic-coach/u)
  })
  assert.equal(calls, 1)
})

test("cannot enable local visit writes in production", () => {
  const result = spawnSync(process.execPath, ["dist/main.js"], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    env: {
      ...process.env,
      BACKEND_ENABLE_DEV_VISIT_WRITE: "true",
      NODE_ENV: "production"
    },
    timeout: 5000
  })
  assert.equal(result.status, 1)
  assert.match(`${result.stdout}${result.stderr}`, /Local visit writes require NODE_ENV=development/u)
})

test("cannot direct local visit writes to a remote database", () => {
  const result = spawnSync(process.execPath, ["dist/main.js"], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    env: {
      ...process.env,
      BACKEND_DATABASE_URL: "postgresql://synthetic-user:synthetic-secret@remote.invalid/synthetic_test",
      BACKEND_ENABLE_DEV_VISIT_WRITE: "true",
      NODE_ENV: "development"
    },
    timeout: 5000
  })
  assert.equal(result.status, 1)
  assert.match(`${result.stdout}${result.stderr}`, /BACKEND_DATABASE_URL must name a local PostgreSQL server/u)
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /synthetic-secret/u)
})

test("cannot override the local database host through connection parameters", () => {
  const result = spawnSync(process.execPath, ["dist/main.js"], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    env: {
      ...process.env,
      BACKEND_DATABASE_URL: "postgresql://127.0.0.1/synthetic_test?host=remote.invalid",
      BACKEND_ENABLE_DEV_VISIT_WRITE: "true",
      NODE_ENV: "development"
    },
    timeout: 5000
  })
  assert.equal(result.status, 1)
  assert.match(`${result.stdout}${result.stderr}`, /BACKEND_DATABASE_URL must name a local PostgreSQL server/u)
})

test("client error events do not terminate the backend", async () => {
  const connect = Client.prototype.connect
  Client.prototype.connect = async function() {
    this.emit("error", new Error("Synthetic socket failure"))
    throw new Error("Synthetic socket failure")
  }
  try {
    await withDatabaseServer("postgresql://127.0.0.1/synthetic_test", async (url) => {
      const response = await create(url, openVisit)
      assert.equal(response.status, 500)
      assert.deepEqual(await response.json(), { error: "Could not save visit" })
    })
  } finally {
    Client.prototype.connect = connect
  }
})

test("a connection failure responds 500 without returning database details", async () => {
  await withDatabaseServer("postgresql://synthetic-user:synthetic-secret@127.0.0.1:1/synthetic_test", async (url) => {
    const response = await create(url, openVisit)
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: "Could not save visit" })
  })
})

const testDatabaseUrl = process.env.BACKEND_TEST_DATABASE_URL
test("Postgres generates the stored visit UUID and preserves optional fields", {
  skip: !testDatabaseUrl && "Set BACKEND_TEST_DATABASE_URL to an isolated migrated local test database"
}, async () => {
  const databaseUrl = new URL(testDatabaseUrl)
  assert.match(databaseUrl.hostname, /^(127\.0\.0\.1|localhost)$/u)
  assert.match(databaseUrl.pathname, /_test$/u)

  const db = new Client({ connectionString: testDatabaseUrl })
  const tenantId = `synthetic-test-${randomUUID()}`
  let id
  try {
    await db.connect()
    await withDatabaseServer(testDatabaseUrl, async (url) => {
      const response = await create(url, {
        ...openVisit,
        endedAt: "2026-10-21T13:00:00Z",
        purposeOfVisit: "",
        tenantId
      })
      assert.equal(response.status, 201)
      const body = await response.json()
      assert.deepEqual(Object.keys(body), ["id"])
      assert.match(body.id, /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u)
      id = body.id
    })

    const { rows } = await db.query(
      "SELECT id, tenant_id, coach_id, participant_ref, started_at, ended_at, purpose_of_visit, observations, interventions, next_steps FROM onsite.visit WHERE id = $1",
      [id]
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, id)
    assert.equal(rows[0].tenant_id, tenantId)
    assert.equal(rows[0].coach_id, "synthetic-coach")
    assert.equal(rows[0].participant_ref, "synthetic-participant")
    assert.equal(rows[0].started_at.toISOString(), "2026-10-21T12:00:00.000Z")
    assert.equal(rows[0].ended_at.toISOString(), "2026-10-21T13:00:00.000Z")
    assert.equal(rows[0].purpose_of_visit, "")
    assert.equal(rows[0].observations, null)
    assert.equal(rows[0].interventions, null)
    assert.equal(rows[0].next_steps, null)
  } finally {
    if (id) await db.query("DELETE FROM onsite.visit WHERE id = $1", [id])
    await db.end()
  }
})
