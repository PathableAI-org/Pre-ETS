import type { ChildProcess } from "node:child_process"
import type { Server } from "node:http"
import type { Browser, BrowserContext, Page } from "playwright"

import { setWorldConstructor, World } from "@cucumber/cucumber"
import { randomBytes, randomUUID } from "node:crypto"
import { createClient } from "redis"

import type { RecordQualifyingActivityResult } from "../../../packages/frontend/src/lib/session/activity.ts"
import type { GuardAuthenticatedAccessResult } from "../../../packages/frontend/src/lib/session/guard.ts"
import type { SetupSessionResult } from "../../../packages/frontend/src/lib/session/setup.ts"
import type { TenantOperationResult } from "../../../packages/frontend/src/lib/tenant/operations.ts"
import type { SessionConfig, SessionRecord, TenantConfig } from "./types.ts"

import { RedisSessionStore } from "../../../packages/frontend/src/lib/session/store.ts"

export class CapabilityWorld extends World {
  activityResult: RecordQualifyingActivityResult | undefined
  readonly baseTime = Math.floor(Date.now() / 1000)
  browser: Browser | undefined
  readonly config: SessionConfig = {
    keyPrefix: `bdd:${randomUUID()}:`,
    redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    signingSecret: randomBytes(32),
    storeTimeoutMs: 2000,
    ttlSeconds: 86400
  }
  readonly client = createClient({
    disableOfflineQueue: true,
    socket: { connectTimeout: 2000, reconnectStrategy: false },
    url: this.config.redisUrl
  })
  context: BrowserContext | undefined
  cookie: string | undefined
  directory = ""
  extraHeaders: Record<string, string> = {}
  failWrites = false
  guardResult: GuardAuthenticatedAccessResult | undefined
  issuer = "https://identity.example/realms/pre-ets"
  logs = ""
  now = this.baseTime
  originalRecord: SessionRecord | undefined
  page: Page | undefined
  parsedConfig: TenantConfig | undefined
  port = 0
  process: ChildProcess | undefined
  provider: Server | undefined
  response: undefined | { body: string; headers: Record<string, string>; status: number }
  runtime: "development" | "production" = "production"
  sessionId = ""
  setupResult: SetupSessionResult | undefined
  staticAlias: string | undefined
  readonly store = new RedisSessionStore(this.config, {
    clientFactory: () => ({
      connect: async () => {
        if (!this.client.isOpen) await this.client.connect()
      },
      eval: (script, options) => this.client.eval(script, options),
      get: (key) => this.client.get(key),
      isOpen: this.client.isOpen,
      set: (key, value, options) => this.client.set(key, value, options)
    }),
    clock: () => this.now
  })
  tenantResult: TenantOperationResult | undefined
  tenantResults: TenantOperationResult[] = []
}
setWorldConstructor(CapabilityWorld)
