export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return
  }

  // ManagedRuntime boot always calls registerOTel + Effect global Tracer bridge.
  // Set OTEL_SDK_DISABLED=true to keep export/instrumentation off.
  await import("./lib/runtime.ts")
}
