import { HttpRouter, HttpServerResponse } from "effect/http"

export const appLayer = HttpRouter.add("GET", "/healthz", HttpServerResponse.text("ok"))
