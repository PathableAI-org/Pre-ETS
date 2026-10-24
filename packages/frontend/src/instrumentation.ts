export const register = async (): Promise<void> => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (process.env.NEXT_PHASE === "phase-production-build") return
  const runtime = await import("./lib/production-runtime.ts")
  await runtime.startProductionRuntime()
}
