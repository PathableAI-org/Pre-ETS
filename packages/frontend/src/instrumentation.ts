export const register = async (): Promise<void> => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (process.env.NEXT_PHASE === "phase-production-build") return
  const runtime = await import("@pathableai/pre-ets-frontend-services")
  await runtime.startProductionRuntime()
}
