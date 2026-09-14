import "server-only"

const tenantRuntime = process.env.NODE_ENV === "production" ? await import("./prod.ts") : await import("./dev.ts")

export const getCurrentTenant = tenantRuntime.getCurrentTenant
export { getCurrentTenantConfig } from "./actions.ts"
export type { TenantConfig } from "./types.ts"
