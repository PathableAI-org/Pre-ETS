import type { NextResponse } from "next/server"

import { attachActiveOtelParent } from "../../../../lib/observability/active-parent.ts"
import { healthErrorEffect } from "../../../../lib/observability/health-effects.ts"
import { Runtime } from "../../../../lib/runtime.ts"

export async function GET(): Promise<NextResponse> {
  return Runtime.runPromise(attachActiveOtelParent(healthErrorEffect))
}
