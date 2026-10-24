import assert from "node:assert/strict"
import http from "node:http"
import { test } from "node:test"

import {
  applicationBrowser,
  freePort,
  listenOnLoopback,
  stopProcess,
  waitUntilReady
} from "../../support/oidc/harness.ts"

await test("owned browser hops retain each logical Host while external traffic keeps its destination", async () => {
  const applicationRequests: string[] = []
  const externalRequests: string[] = []
  const external = http.createServer((request, response) => {
    externalRequests.push(`${String(request.headers.host)}${String(request.url)}`)
    response.end("external destination")
  })
  const externalPort = await listenOnLoopback(external)
  const application = http.createServer((request, response) => {
    applicationRequests.push(`${String(request.headers.host)}${String(request.url)}`)
    if (request.url === "/") {
      response.writeHead(307, { Location: "/auth/login" }).end()
    } else if (request.url === "/auth/login") {
      response.writeHead(307, { Location: `http://127.0.0.1:${String(externalPort)}/external` }).end()
    } else {
      response.end("application asset")
    }
  })
  const applicationPort = await listenOnLoopback(application)
  let owned: Awaited<ReturnType<typeof applicationBrowser>> | undefined
  try {
    owned = await applicationBrowser(applicationPort, ["springfield.example.test", "shelbyville.example.test"])
    const page = await owned.browser.newPage()
    const responses: number[] = []
    page.on("response", (response) => {
      responses.push(response.status())
    })
    await page.goto("http://shelbyville.example.test/asset")
    assert.equal(await page.locator("body").innerText(), "application asset")
    const response = await page.goto("http://springfield.example.test/")
    assert.equal(response?.status(), 200)
    assert.equal(page.url(), `http://127.0.0.1:${String(externalPort)}/external`)
    assert.equal(await page.locator("body").innerText(), "external destination")
    assert.deepEqual(responses, [200, 307, 307, 200])
    assert.deepEqual(applicationRequests, [
      "shelbyville.example.test/asset",
      "springfield.example.test/",
      "springfield.example.test/auth/login"
    ])
    assert.deepEqual(externalRequests, [`127.0.0.1:${String(externalPort)}/external`])
  } finally {
    await owned?.close()
    await Promise.all([
      new Promise<void>((resolve) =>
        application.close(() => {
          resolve()
        })
      ),
      new Promise<void>((resolve) =>
        external.close(() => {
          resolve()
        })
      )
    ])
  }
})

await test("callback routing targets the intended second frontend process", async () => {
  const instanceARequests: string[] = []
  const instanceBRequests: { host: string; path: string }[] = []
  const instanceA = http.createServer((request, response) => {
    instanceARequests.push(`${String(request.headers.host)}${String(request.url)}`)
    if (request.url === "/") {
      response.writeHead(307, { Location: "/auth/login" }).end()
      return
    }
    response
      .writeHead(307, { Location: "http://springfield.example.test/auth/callback?code=controlled&state=controlled" })
      .end()
  })
  const instanceB = http.createServer((request, response) => {
    instanceBRequests.push({ host: String(request.headers.host), path: String(request.url) })
    response.writeHead(204).end()
  })
  const [instanceAPort, instanceBPort] = await Promise.all([
    listenOnLoopback(instanceA),
    listenOnLoopback(instanceB)
  ])
  let owned: Awaited<ReturnType<typeof applicationBrowser>> | undefined
  try {
    owned = await applicationBrowser(instanceAPort, ["springfield.example.test"], instanceBPort)
    const page = await owned.browser.newPage()
    try {
      await page.goto("http://springfield.example.test/")
    } catch (error) {
      assert.ok(error instanceof Error)
      assert.match(error.message, /net::ERR_ABORTED/)
    }
    assert.equal(instanceBRequests.length, 1)
    const [callback] = instanceBRequests
    assert.ok(callback)
    assert.equal(callback.host, "springfield.example.test")
    assert.equal(callback.path, "/auth/callback?code=controlled&state=controlled")
  } finally {
    await owned?.close()
    await Promise.all([
      new Promise<void>((resolve) =>
        instanceA.close(() => {
          resolve()
        })
      ),
      new Promise<void>((resolve) =>
        instanceB.close(() => {
          resolve()
        })
      )
    ])
  }
})

await test("process readiness is bounded and owned processes always close", async () => {
  // Spawning a real `next` process requires a build; exercise the bounded-readiness
  // and close mechanics against a controlled child that holds a server open and
  // never satisfies the frontend readiness marker.
  const { spawn } = await import("node:child_process")
  const child = spawn(
    process.execPath,
    ["-e", "require(\"node:http\").createServer((_q, r) => r.end(\"ok\")).listen(0, \"127.0.0.1\")"],
    { detached: true, stdio: ["ignore", "ignore", "ignore"] }
  )
  await assert.rejects(
    () => waitUntilReady(child, () => "", 300),
    (error: unknown) => error instanceof Error && error.message.includes("timed out")
  )
  await stopProcess(child)
  assert.ok(child.exitCode !== null || child.signalCode !== null, "owned child process exited after stopProcess")
})

await test("freePort returns distinct usable loopback ports", async () => {
  const first = await freePort()
  const second = await freePort()
  assert.notEqual(first, second)
  assert.ok(first > 0 && second > 0)
})
