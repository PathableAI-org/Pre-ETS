import { Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"

import { devVisitRoutes } from "./visit.js"

export const appLayer = HttpRouter.add("GET", "/healthz", HttpServerResponse.text("ok"))

export const devAppLayer = Layer.mergeAll(appLayer, devVisitRoutes)
