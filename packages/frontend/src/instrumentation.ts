export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return
  }

  // ManagedRuntime boot registers @vercel/otel when OTEL_EXPORTER_OTLP_ENDPOINT
  // is present and installs the Effect global Tracer bridge.
  await import("./lib/runtime.ts")
}
