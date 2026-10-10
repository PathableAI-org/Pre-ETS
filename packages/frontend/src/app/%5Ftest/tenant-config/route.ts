import { Effect } from "effect"
import { NextResponse } from "next/server"

import { Runtime } from "../../../lib/runtime"
import { TenantConfigService } from "../../../lib/tenant"

export async function GET(request: Request): Promise<NextResponse> {
  const host = request.headers.get("host") ?? ""
  const config = await Effect.gen(function*() {
    const service = yield* TenantConfigService
    return yield* service.getConfigFromHost(host)
  }).pipe(Runtime.runPromise)

  return NextResponse.json(config, {
    headers: { "Cache-Control": "private, no-store" },
    status: 200
  })
}
