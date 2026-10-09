import { Effect } from "effect"
import { NextResponse } from "next/server"

import { Runtime } from "../../../lib/runtime"
import { getTenantConfigPath, getTenantResolutionMode } from "../../../lib/tenant"

export async function GET(request: Request): Promise<NextResponse> {
  const host = request.headers.get("host") ?? ""
  const { configPath, resolutionMode } = await Effect.gen(function*() {
    return {
      configPath: yield* getTenantConfigPath(host),
      resolutionMode: yield* getTenantResolutionMode()
    }
  }).pipe(Runtime.runPromise)

  return NextResponse.json({
    configPath,
    resolutionMode
  }, {
    headers: { "Cache-Control": "private, no-store" },
    status: 200
  })
}
