import "server-only"

const tenantRuntime = process.env.NODE_ENV === "development"
  ? await import("./dev.ts")
  : await import("./prod.ts")

export const getCurrentTenant = tenantRuntime.getCurrentTenant
export const getCurrentTenantConfig = tenantRuntime.getCurrentTenantConfig
export {
  createEnvTenantOperations,
  createTenantOperations,
  type TenantOperationResult,
  type TenantOperations
} from "./operations.ts"
export type { TenantConfig } from "./types.ts"
export { effectiveIdleTimeoutMinutes } from "./types.ts"
