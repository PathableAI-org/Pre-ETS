import type { NextResponse } from "next/server"

import { healthOkEffect } from "../../../lib/observability/health-effects.ts"
import { Runtime } from "../../../lib/runtime.ts"

export async function GET(): Promise<NextResponse> {
  return Runtime.runPromise(healthOkEffect)
}
