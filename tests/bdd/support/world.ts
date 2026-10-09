import type { ChildProcess } from "node:child_process"

import { setWorldConstructor, World } from "@cucumber/cucumber"
import { randomBytes, randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"

const tenantConfigDir = fileURLToPath(new URL("../../../fixtures/tenant-config", import.meta.url))

export class AppWorld extends World {
  baseHostname: string | undefined
  cookie: string | undefined
  directory = tenantConfigDir
  extraHeaders: Record<string, string> = {}
  readonly keyPrefix = `bdd:${randomUUID()}:`
  logs = ""
  port = 0
  process: ChildProcess | undefined
  readonly redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
  response: undefined | { body: string; headers: Record<string, string>; status: number }
  runtime: "development" | "production" = "production"
  readonly signingSecret = randomBytes(32)
  staticAlias: string | undefined
}
setWorldConstructor(AppWorld)
