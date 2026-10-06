import fs from "node:fs/promises"
import path from "node:path"

import type { AppWorld } from "./world.ts"

import { SESSION_COOKIE_NAME } from "../../../packages/frontend/src/lib/session/types.ts"

export function sessionCookieHeader(world: AppWorld): Record<string, string> {
  return world.cookie === undefined ? {} : { Cookie: `${SESSION_COOKIE_NAME}=${world.cookie}` }
}
export function tenantConfig(world: AppWorld, tenant = "springfield", displayName?: string) {
  return {
    displayName: displayName ?? (tenant === "springfield" ? "Springfield Demo" : "Shelbyville Demo"),
    idleTimeoutMinutes: 5,
    oidc: { clientAuth: "public" as const, clientId: `${tenant}-web`, issuer: world.issuer }
  }
}
export async function writeTenant(world: AppWorld, tenant: string, displayName?: string): Promise<void> {
  await fs.writeFile(
    path.join(world.directory, `${tenant}.json`),
    JSON.stringify(tenantConfig(world, tenant, displayName))
  )
}

export async function writeTenants(world: AppWorld): Promise<void> {
  await writeTenant(world, "springfield")
  await writeTenant(world, "shelbyville")
}
