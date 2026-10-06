export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return
  }

  // Effect ManagedRuntime boots here and installs Effect OtlpTracer when
  // OTEL_TRACES_ENABLED is set (see lib/runtime.ts / lib/observability/register.ts).
  await import("./lib/runtime.ts")
}
