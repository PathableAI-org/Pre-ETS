export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return
  }

  // The local form preview has no tenant, session, or observability runtime.
  if (process.env.NODE_ENV === "development" && process.env.PRE_ETS_ONSITE_PROTOTYPE === "1") {
    return
  }

  // ManagedRuntime boot always calls registerOTel + Effect global Tracer bridge.
  // Set OTEL_SDK_DISABLED=true to keep export/instrumentation off.
  await import("./lib/runtime.ts")
}
