import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Config, Effect, Layer } from "effect"
import { HttpRouter } from "effect/http"
import { createServer } from "node:http"

import { appLayer, devAppLayer } from "./index.js"
import { VisitStoreLive } from "./visit.js"

const main = Effect.gen(function*() {
  const port = yield* Config.Port("BACKEND_PORT").pipe(Config.withDefault(3001))
  const devWritesEnabled = process.env.BACKEND_ENABLE_DEV_VISIT_WRITE === "true"
  if (devWritesEnabled && process.env.NODE_ENV !== "development") {
    return yield* Effect.fail(new Error("Local visit writes require NODE_ENV=development"))
  }

  const server = devWritesEnabled
    ? HttpRouter.serve(devAppLayer).pipe(Layer.provide(VisitStoreLive))
    : HttpRouter.serve(appLayer)

  yield* Layer.launch(server.pipe(Layer.provide(NodeHttpServer.layer(createServer, { host: "127.0.0.1", port }))))
})

if (import.meta.main) {
  NodeRuntime.runMain(main)
}
