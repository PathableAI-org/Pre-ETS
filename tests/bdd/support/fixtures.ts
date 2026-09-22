import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"

import type { CapabilityWorld } from "./world.ts"

import { signSessionCookie } from "../../../packages/frontend/src/lib/session/cookie.ts"
import {
  generateSessionId,
  SESSION_COOKIE_NAME,
  type SessionRecord
} from "../../../packages/frontend/src/lib/session/types.ts"

export async function seedSession(
  world: CapabilityWorld,
  authenticated = false,
  tenantId = "springfield"
): Promise<void> {
  world.sessionId = generateSessionId()
  const record: SessionRecord = {
    expiresAt: world.baseTime + 86400,
    tenantId,
    ...(authenticated ?
      {
        idleDurationMinutes: 5,
        idleExpiresAt: world.baseTime + 300,
        lastActivityAt: world.baseTime,
        userId: "synthetic-bdd-user",
        userName: "BDD User"
      } :
      {})
  }
  world.originalRecord = record
  assert.equal((await world.store.create(world.sessionId, record)).kind, "created")
  world.cookie = await signSessionCookie(
    { exp: record.expiresAt, sid: world.sessionId, tenant: tenantId },
    world.config
  )
}
export function sessionCookieHeader(world: CapabilityWorld): Record<string, string> {
  return world.cookie === undefined ? {} : { Cookie: `${SESSION_COOKIE_NAME}=${world.cookie}` }
}
export function tenantConfig(world: CapabilityWorld, tenant = "springfield", displayName?: string) {
  return {
    displayName: displayName ?? (tenant === "springfield" ? "Springfield Demo" : "Shelbyville Demo"),
    idleTimeoutMinutes: 5,
    oidc: { clientAuth: "public" as const, clientId: `${tenant}-web`, issuer: world.issuer }
  }
}
export async function writeConfidentialTenant(world: CapabilityWorld): Promise<void> {
  const config = tenantConfig(world)
  const oidc = { ...config.oidc, clientAuth: "confidential" }
  await fs.writeFile(
    path.join(world.directory, "springfield.json"),
    JSON.stringify({ config: { ...config, oidc }, slug: "springfield" })
  )
}
export async function writeTenant(world: CapabilityWorld, tenant: string, displayName?: string): Promise<void> {
  await fs.writeFile(
    path.join(world.directory, `${tenant}.json`),
    JSON.stringify({ config: tenantConfig(world, tenant, displayName), slug: tenant })
  )
}

export async function writeTenants(world: CapabilityWorld): Promise<void> {
  await writeTenant(world, "springfield")
  await writeTenant(world, "shelbyville")
}
