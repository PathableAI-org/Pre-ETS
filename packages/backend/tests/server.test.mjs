import { NodeHttpServer } from "@effect/platform-node"
import { Context, Effect, Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createServer } from "node:http"
import test from "node:test"

import { appLayer } from "../dist/index.js"

test("importing the application does not start the process", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", "await import(\"./dist/main.js\")"], {
    cwd: new URL("../", import.meta.url),
    timeout: 5000
  })

  assert.equal(result.status, 0)
})

for (const port of ["not-a-port", "0", "65536"]) {
  test(`BACKEND_PORT=${port} prevents startup`, () => {
    const result = spawnSync(process.execPath, ["dist/main.js"], {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8",
      env: { ...process.env, BACKEND_PORT: port },
      timeout: 5000
    })

    assert.equal(result.status, 1)
    assert.match(`${result.stdout}${result.stderr}`, /BACKEND_PORT/u)
  })
}

test("serves liveness and releases the listening port on shutdown", async () => {
  const serverLayer = HttpRouter.serve(appLayer).pipe(
    Layer.provideMerge(NodeHttpServer.layer(createServer, { host: "127.0.0.1", port: 0 }))
  )

  const port = await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const services = yield* Layer.build(serverLayer)
    const { address } = Context.get(services, HttpServer.HttpServer)
    assert.equal(address._tag, "InetAddressV4")

    const response = yield* Effect.promise(() =>
      fetch(`http://127.0.0.1:${address.port}/healthz`, {
        headers: { connection: "close" }
      })
    )
    assert.equal(response.status, 200)
    assert.equal(yield* Effect.promise(() => response.text()), "ok")

    const missing = yield* Effect.promise(() =>
      fetch(`http://127.0.0.1:${address.port}/visits`, {
        headers: { connection: "close" }
      })
    )
    assert.equal(missing.status, 404)
    yield* Effect.promise(() => missing.text())

    const disabledWrite = yield* Effect.promise(() =>
      fetch(`http://127.0.0.1:${address.port}/visits`, {
        body: "{}",
        headers: { connection: "close", "content-type": "application/json" },
        method: "POST"
      })
    )
    assert.equal(disabledWrite.status, 404)
    yield* Effect.promise(() => disabledWrite.text())

    return address.port
  })))

  const listener = createServer()
  try {
    await new Promise((resolve, reject) => {
      listener.once("error", reject)
      listener.listen(port, "127.0.0.1", resolve)
    })
  } finally {
    if (listener.listening) {
      await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()))
    }
  }
})
