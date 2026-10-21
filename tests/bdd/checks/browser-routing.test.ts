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
