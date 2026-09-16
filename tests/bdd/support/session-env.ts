import { randomBytes } from "node:crypto"

import type { TenantWorld } from "./world.ts"

import { DEFAULT_SESSION_TTL_SECONDS } from "../../../packages/frontend/src/lib/session/types.ts"

export function ensureSessionSettings(world: TenantWorld): void {
  world.sessionSigningSecret ??= randomBytes(32).toString("base64url")
  world.sessionKeyPrefix ??= `bdd:session:${randomBytes(8).toString("hex")}:`
  world.redisUrl ??= process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
  world.sessionTtlSeconds ??= DEFAULT_SESSION_TTL_SECONDS
  world.sessionStoreTimeoutMs ??= 2000
  world.sessionCookieJar ??= new Map<string, string>()
}
