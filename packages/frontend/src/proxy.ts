import { createProtectionProxy } from "@pathableai/pre-ets-frontend-services"
import { type NextProxy, NextResponse } from "next/server"

import { tenantFailureResponse } from "./features/access-responses.ts"

/** Every matched request passes the default protection gate before any page, route handler, or Server Action. */
export const proxy: NextProxy = createProtectionProxy({
  forbiddenDocument: (request) => Promise.resolve(NextResponse.rewrite(new URL("/access-denied", request.url))),
  tenantFailure: tenantFailureResponse
})

/** Only framework build assets and development tooling bypass the gate (asset designation pending finding F-1). */
export const config = {
  matcher: ["/((?!_next/static/|_next/webpack-hmr|__nextjs).*)"]
}
