import { NextResponse } from "next/server"

import { Runtime } from "../../../lib/runtime"
import { getTenantResolutionMode } from "../../../lib/tenant"

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    resolutionMode: await getTenantResolutionMode().pipe(
      Runtime.runPromise
    )
  }, {
    headers: { "Cache-Control": "private, no-store" },
    status: 200
  })
}
