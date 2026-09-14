import { type ApplicationRuntime, INVALID_MODE_DIAGNOSTIC, type ModeSelection } from "./model.ts"

export function selectTenantMode(
  rawMode: string | undefined,
  runtime: ApplicationRuntime
): ModeSelection {
  if (rawMode === undefined || rawMode === "") {
    return { mode: "host" }
  }

  if (rawMode === "host") {
    return { mode: "host" }
  }

  if (rawMode === "static") {
    return runtime === "development" ? { mode: "static" } : { mode: "host" }
  }

  return {
    diagnostic: INVALID_MODE_DIAGNOSTIC,
    mode: "host"
  }
}
