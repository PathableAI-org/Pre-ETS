import { Effect, Result } from "effect"
import { NextResponse } from "next/server"

import { httpErrorJson } from "../../../lib/error.ts"
import { Runtime } from "../../../lib/runtime"
import { TenantConfigService } from "../../../lib/tenant"

const noStore = { "Cache-Control": "private, no-store" }

export async function GET(request: Request): Promise<NextResponse> {
  const host = request.headers.get("host") ?? ""
  const result = await Effect.gen(function*() {
    const service = yield* TenantConfigService
    return yield* service.getConfigFromHost(host)
  }).pipe(Effect.result, Runtime.runPromise)

  if (Result.isFailure(result)) return httpErrorJson(result.failure, noStore)
  return NextResponse.json(result.success, {
    headers: noStore,
    status: 200
  })
}
