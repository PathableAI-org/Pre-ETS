import type { NextResponse } from "next/server"

import { healthErrorEffect } from "../../../../lib/observability/health-effects.ts"
import { Runtime } from "../../../../lib/runtime.ts"

export async function GET(): Promise<NextResponse> {
  return Runtime.runPromise(healthErrorEffect)
}
