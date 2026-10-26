import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import http from "node:http"
import path from "node:path"
import { describe, it } from "node:test"

import "./fixture-hooks.mjs"
import "./fixture-register.mjs"
import {
  applicationBrowser,
  freePort,
  type SiteOptions,
  spawnFrontend,
  stopProcess,
  waitUntilReady
} from "../../support/oidc/harness.ts"
import { forbidden, NextResponse, notFound, redirect, stubExportsReady, unauthorized } from "./fixture-stubs.mjs"

const directory = path.resolve("fixtures/tenant-config")
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
const sessionPrefix = `test:session:reference:${randomUUID()}:`
const transactionPrefix = `test:oidc:reference:${randomUUID()}:`

const ownedSessionPrefix = /^test:session:reference:[0-9a-f-]{36}:$/

interface ResponseSnapshot {
  readonly body: string
  readonly location: string | undefined
  readonly setCookieCount: number
  readonly status: number
}

const siteOptions = (staticAlias: string | undefined): SiteOptions => ({
  allowInsecureLoopback: true,
  baseHostname: staticAlias === undefined ? "localhost" : undefined,
  callbackOrigins: {
    shelbyville: "http://shelbyville.localhost:3000",
    springfield: "http://springfield.localhost:3000"
  },
  directory,
  redisUrl,
  runtime: "production",
  sessionPrefix,
  staticAlias,
  transactionPrefix,
  transactionTtlSeconds: 600
})

const request = (
  port: number,
  host: string,
  requestPath: string,
  cookie?: string
): Promise<ResponseSnapshot> =>
  new Promise((resolve, reject) => {
    const incoming = http.request(
      {
        headers: {
          host,
          ...(cookie === undefined ? {} : { cookie: `pathable-session=${cookie}` })
        },
        hostname: "127.0.0.1",
        method: "GET",
        path: requestPath,
        port
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk)
        })
        response.on("end", () => {
          const setCookie = response.headers["set-cookie"]
          resolve({
            body: Buffer.concat(chunks).toString("utf8"),
            location: response.headers.location,
            setCookieCount: setCookie === undefined ? 0 : setCookie.length,
            status: response.statusCode ?? 0
          })
        })
      }
    )
    incoming.on("error", reject)
    incoming.end()
  })

const runFixture = (mode: "delete" | "establish"): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--import",
      path.resolve("tests/bdd/session/fixture-register.mjs"),
      "--input-type=module",
      "-e",
      fixtureSource
    ], {
      cwd: path.resolve("packages/frontend-services"),
      env: {
        ...process.env,
        FIXTURE_MODE: mode,
        REDIS_URL: redisUrl,
        SESSION_KEY_PREFIX: sessionPrefix
      }
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`session fixture ${mode} failed: ${stderr}`))
      else resolve(stdout)
    })
  })

const fixtureSource = `
import { ConfigProvider, Effect, Layer, ManagedRuntime } from "effect"
import { NodeRedis } from "@effect/platform-node"
import * as Redis from "effect/persistence/Redis"
import { SessionService } from "./dist/session.js"

const prefix = process.env.SESSION_KEY_PREFIX ?? ""
if (!/^test:session:reference:[0-9a-f-]{36}:$/.test(prefix)) {
  throw new Error("Refusing an unvalidated session prefix")
}
const runtime = ManagedRuntime.make(NodeRedis.layer({ url: process.env.REDIS_URL }))
if (process.env.FIXTURE_MODE === "delete") {
  await runtime.runPromise(Effect.gen(function*() {
    const redis = yield* Redis.Redis
    let cursor = "0"
    do {
      const page = yield* redis.send("SCAN", cursor, "MATCH", prefix + "*", "COUNT", "100")
      const keys = page[1].filter((key) => key.startsWith(prefix))
      if (keys.length > 0) yield* redis.send("DEL", ...keys)
      cursor = page[0]
    } while (cursor !== "0")
  }))
} else {
  const sessionRuntime = ManagedRuntime.make(SessionService.layer.pipe(
    Layer.provide(NodeRedis.layer({ url: process.env.REDIS_URL })),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ SESSION_KEY_PREFIX: prefix })))
  ))
  const established = await sessionRuntime.runPromise(Effect.gen(function*() {
    const service = yield* SessionService
    return yield* service.establish({
      identity: { issuer: "https://provider.test/", subject: "subject-1" },
      policy: { idleTimeoutMinutes: 30, warningLeadMinutes: 5 },
      tenantAlias: "springfield"
    })
  }))
  process.stdout.write(JSON.stringify({
    deadline: established.session.idleDeadlineEpochMilliseconds,
    reference: established.reference,
    warning: established.session.warningLeadMinutes
  }))
  await sessionRuntime.dispose()
}
await runtime.dispose()
`

assert.equal(typeof forbidden, "function")
assert.equal(typeof notFound, "function")
assert.equal(typeof redirect, "function")
assert.equal(typeof unauthorized, "function")
assert.equal(typeof stubExportsReady, "function")
assert.equal(typeof NextResponse, "object")

void describe("reference session enforcement", () => {
  void it("consumes a confirmed-fresh session from instance A on instance B", {
    skip: "B6 freshness confirmation is not approved or functioning, so V-002 stays incomplete"
  }, () => {
    // A fixture, a redirect, or signed auth_time is not this confirmation.
  })

  void it("denies absent, forged, mismatched, and stale reference requests", { timeout: 180_000 }, async () => {
    assert.match(sessionPrefix, ownedSessionPrefix)
    const portA = await freePort()
    const portB = await freePort()
    const staticPort = await freePort()
    const primary = await spawnFrontend(siteOptions(undefined), portA)
    const secondary = await spawnFrontend(siteOptions(undefined), portB)
    const staticSite = await spawnFrontend(siteOptions("springfield"), staticPort)
    let browserClose: (() => Promise<void>) | undefined
    try {
      await waitUntilReady(primary.child, primary.logs)
      await waitUntilReady(secondary.child, secondary.logs)
      await waitUntilReady(staticSite.child, staticSite.logs)

      const absent = await request(portB, `springfield.localhost:${String(portB)}`, "/")
      assert.equal(absent.status, 307)
      assert.equal(absent.location, "/auth/login")
      assert.equal(absent.setCookieCount, 0)
      assert.doesNotMatch(absent.body, /subject-1|Reference session/)

      const forged = await request(portB, `springfield.localhost:${String(portB)}`, "/", "not-a-reference")
      assert.equal(forged.status, 307)
      assert.equal(forged.location, "/auth/login")
      assert.equal(forged.setCookieCount, 0)
      assert.doesNotMatch(forged.body, /subject-1|Reference session/)

      const unknownHost = await request(portB, `capital-city.localhost:${String(portB)}`, "/")
      assert.equal(unknownHost.status, 404)
      assert.equal(unknownHost.location, undefined)
      assert.doesNotMatch(unknownHost.body, /springfield|shelbyville|subject-1/i)

      const staticHost = await request(staticPort, "not-a-host.example", "/")
      assert.equal(staticHost.status, 307)
      assert.equal(staticHost.location, "/auth/login")

      const fixture = JSON.parse(await runFixture("establish")) as {
        readonly deadline: number
        readonly reference: string
        readonly warning: number
      }
      const mismatch = await request(
        portB,
        `shelbyville.localhost:${String(portB)}`,
        "/",
        fixture.reference
      )
      assert.equal(mismatch.status, 403)
      assert.match(mismatch.body, /Access denied/)
      assert.equal(mismatch.setCookieCount, 0)
      assert.doesNotMatch(mismatch.body, /subject-1|springfield/)

      const browser = await applicationBrowser(portB, [`springfield.localhost:${String(portB)}`])
      browserClose = browser.close
      const context = await browser.browser.newContext()
      const page = await context.newPage()
      await context.addCookies([{
        name: "pathable-session",
        url: `http://springfield.localhost:${String(portB)}/`,
        value: fixture.reference
      }])
      await page.goto(`http://springfield.localhost:${String(portB)}/`)
      const button = page.getByRole("button", { name: "Record reference operation" })
      await button.waitFor()
      const text = await page.locator("body").innerText()
      assert.match(text, /subject-1/)
      assert.match(text, /springfield/)
      assert.match(text, new RegExp(String(fixture.deadline)))
      assert.match(text, new RegExp(String(fixture.warning)))
      let focused = false
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await page.keyboard.press("Tab")
        focused = await page.evaluate(() =>
          document.activeElement?.textContent.includes("Record reference operation") ?? false
        )
        if (focused) break
      }
      assert.equal(focused, true)
      const focusVisible = await page.evaluate(() => {
        const active = document.activeElement
        if (!(active instanceof HTMLElement)) return false
        const style = getComputedStyle(active)
        return style.outlineStyle !== "none" || style.boxShadow !== "none"
      })
      assert.equal(focusVisible, true)
      await page.keyboard.press("Enter")
      await page.getByRole("status").filter({ hasText: "The reference operation finished." }).waitFor()
      const afterSuccess = (await context.cookies()).filter((cookie) => cookie.name !== "pathable-session")
      assert.equal(afterSuccess.length, 1)

      await runFixture("delete")
      await button.press("Enter")
      await page.getByRole("status").filter({ hasText: "This operation is unavailable" }).waitFor()
      const afterDenial = (await context.cookies()).filter((cookie) => cookie.name !== "pathable-session")
      assert.equal(afterDenial.length, 1)
      assert.doesNotMatch(await page.locator("body").innerText(), /The reference operation finished\./)
    } finally {
      if (browserClose !== undefined) await browserClose()
      await stopProcess(primary.child)
      await stopProcess(secondary.child)
      await stopProcess(staticSite.child)
      await runFixture("delete").catch(() => undefined)
    }
  })

  void it("does not stop a shared Redis service to imitate an outage", {
    skip: "Redis was already running outside this execution, so the page outage check stays incomplete"
  }, () => {
    // Stopping shared Redis would disturb other work. Service-level disconnection is separate evidence.
  })
})
