import { isNextProductionBuildPhase, registerObservability } from "./lib/observability/register.ts"

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return
  }

  // Skip OTEL registration during `next build` so production builds stay clean
  // when traces env is present from the host shell. Effect runtime still boots.
  if (!isNextProductionBuildPhase()) {
    registerObservability()
  }

  await import("./lib/runtime.ts")
}
