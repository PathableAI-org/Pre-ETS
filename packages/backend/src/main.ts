import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Config, Effect, Layer } from "effect"
import { HttpRouter } from "effect/http"
import { createServer } from "node:http"

import { appLayer } from "./index.js"

const main = Effect.gen(function*() {
  const port = yield* Config.Port("BACKEND_PORT").pipe(Config.withDefault(8080))

  yield* Layer.launch(
    HttpRouter.serve(appLayer).pipe(
      Layer.provide(NodeHttpServer.layer(createServer, { host: "127.0.0.1", port }))
    )
  )
})

if (import.meta.main) {
  NodeRuntime.runMain(main)
}
