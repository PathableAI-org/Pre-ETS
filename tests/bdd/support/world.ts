import type { ChildProcess } from "node:child_process"

import { setWorldConstructor, World } from "@cucumber/cucumber"
import { fileURLToPath } from "node:url"

const tenantConfigDir = fileURLToPath(new URL("../../../fixtures/tenant-config", import.meta.url))

export class AppWorld extends World {
  allowInsecureLoopback = true
  baseHostname: string | undefined
  callbackOrigins: Record<string, string> = {
    shelbyville: "http://shelbyville.localhost:3000",
    springfield: "http://springfield.localhost:3000"
  }
  cookie: string | undefined
  directory = tenantConfigDir
  extraHeaders: Record<string, string> = {}
  logs = ""
  ownedDirectory: string | undefined
  port = 0
  process: ChildProcess | undefined
  readonly redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
  response: undefined | { body: string; headers: Record<string, string>; status: number }
  restrictedPaths: string[] = []
  runtime: "development" | "production" = "production"
  staticAlias: string | undefined
}
setWorldConstructor(AppWorld)
