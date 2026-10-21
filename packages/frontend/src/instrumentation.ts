export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return
  }

  // ManagedRuntime boot reads optional OTEL config. An OTLP endpoint enables
  // registerOTel and the Effect global tracer. OTEL_SDK_DISABLED=true, or no
  // endpoint, leaves the noop tracer in place.
  await import("./lib/runtime.ts")
}
