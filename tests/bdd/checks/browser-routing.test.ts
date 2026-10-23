import assert from "node:assert/strict"
import http from "node:http"
import { test } from "node:test"

import { applicationBrowser } from "../support/browser.ts"
import { listenOnLoopback } from "../support/listen.ts"

await test("application redirects retain each logical Host while external navigation stays external", async () => {
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

await test("callback-path host-only correlation crosses instances but not tenant authorities", async () => {
  const instanceARequests: { cookie: string; host: string; path: string }[] = []
  const instanceBRequests: { cookie: string; host: string; path: string }[] = []
  const instanceA = http.createServer((request, response) => {
    instanceARequests.push({
      cookie: request.headers.cookie ?? "",
      host: request.headers.host ?? "",
      path: request.url ?? ""
    })
    if (request.url === "/") {
      response.writeHead(307, { Location: "/auth/login" }).end()
      return
    }
    response.writeHead(307, {
      Location: "http://springfield.example.test/auth/callback?code=controlled&state=controlled",
      "Set-Cookie": `oidc-correlation=${"A".repeat(43)}; HttpOnly; SameSite=Lax; Path=/auth/callback`
    }).end()
  })
  const instanceB = http.createServer((request, response) => {
    instanceBRequests.push({
      cookie: request.headers.cookie ?? "",
      host: request.headers.host ?? "",
      path: request.url ?? ""
    })
    response.writeHead(204).end()
  })
  const [instanceAPort, instanceBPort] = await Promise.all([
    listenOnLoopback(instanceA),
    listenOnLoopback(instanceB)
  ])
  let owned: Awaited<ReturnType<typeof applicationBrowser>> | undefined
  try {
    owned = await applicationBrowser(
      instanceAPort,
      ["springfield.example.test", "shelbyville.example.test"],
      instanceBPort
    )
    const page = await owned.browser.newPage()
    const visitNoContent = async (url: string) => {
      try {
        await page.goto(url)
      } catch (error) {
        assert.ok(error instanceof Error)
        assert.match(error.message, /net::ERR_ABORTED/)
      }
    }
    await visitNoContent("http://springfield.example.test/")
    await visitNoContent("http://shelbyville.example.test/auth/callback?code=other&state=other")

    assert.deepEqual(instanceARequests.map(({ host, path }) => `${host}${path}`), [
      "springfield.example.test/",
      "springfield.example.test/auth/login"
    ])
    const [sameTenantCallback, otherTenantCallback] = instanceBRequests
    assert.ok(sameTenantCallback)
    assert.ok(otherTenantCallback)
    assert.equal(sameTenantCallback.host, "springfield.example.test")
    assert.equal(sameTenantCallback.cookie, `oidc-correlation=${"A".repeat(43)}`)
    assert.equal(otherTenantCallback.host, "shelbyville.example.test")
    assert.equal(otherTenantCallback.cookie, "")
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
