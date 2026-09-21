import { type ChildProcess, spawn } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import net from "node:net"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

import type { TenantWorld } from "./world.ts"

import { materializeTenantConfigDir } from "./fixtures.ts"
import { ensureSessionSettings } from "./session-env.ts"

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)))
const FRONTEND_ROOT = path.join(REPO_ROOT, "packages/frontend")
const READY_TIMEOUT_MS = 120_000

export async function closeOwnedResources(world: TenantWorld): Promise<void> {
  await discardBrowserPages(world)
  await world.browser?.close().catch(() => undefined)
  await terminateProcess(world.ownedProcess)
  world.ownedProcess = undefined
  world.browser = undefined
}

export async function ensureBrowser(world: TenantWorld): Promise<void> {
  world.browser ??= await chromium.launch({
    args: [
      "--host-resolver-rules=MAP *.pathable.com 127.0.0.1,MAP *.localhost 127.0.0.1,MAP localhost 127.0.0.1,MAP pathable.com 127.0.0.1,MAP www.pathable.com 127.0.0.1"
    ]
  })
}

export async function ensureOwnedProcess(world: TenantWorld): Promise<void> {
  const signature = processSignature(world)
  if (world.ownedProcess !== undefined && world.processSignature === signature) {
    return
  }

  if (world.ownedProcess !== undefined) {
    await restartOwnedProcess(world, { preserveCookies: true })
  } else {
    await startOwnedProcess(world)
  }

  world.processSignature = signature
}

export async function restartOwnedProcess(
  world: TenantWorld,
  options: { readonly preserveCookies?: boolean } = {}
): Promise<void> {
  ensureSessionSettings(world)
  await terminateProcess(world.ownedProcess)
  world.ownedProcess = undefined
  world.processSignature = undefined
  if (options.preserveCookies !== true) {
    await discardBrowserPages(world)
    world.sessionCookieJar = new Map()
  }
  await startOwnedProcess(world)
  world.processSignature = processSignature(world)
}

export async function startOwnedProcess(world: TenantWorld): Promise<void> {
  await assertPortFree(world.port)
  // Next 16 keeps a per-project dev lock; clear stale locks after abrupt scenario teardown.
  if (world.runtime !== "production") {
    await fs.promises.rm(path.join(FRONTEND_ROOT, ".next", "dev", "lock"), { force: true })
  }

  if (world.runtime === "production" && world.oidcMockIssuer === undefined) {
    const { ensureMockOidcIssuer } = await import("./oidc-mock.ts")
    await ensureMockOidcIssuer(world)
  }

  const child = spawn(
    path.join(FRONTEND_ROOT, "node_modules/.bin/next"),
    world.runtime === "production"
      ? ["start", "-H", "127.0.0.1", "-p", String(world.port)]
      : ["dev", "--webpack", "-H", "127.0.0.1", "-p", String(world.port)],
    {
      cwd: FRONTEND_ROOT,
      detached: true,
      env: buildProcessEnv(world),
      stdio: ["ignore", "pipe", "pipe"]
    }
  )
  world.ownedProcess = child
  const logs: string[] = []
  child.stdout.on("data", (chunk: Buffer) => {
    logs.push(chunk.toString("utf8"))
  })
  child.stderr.on("data", (chunk: Buffer) => {
    logs.push(chunk.toString("utf8"))
  })
  await waitForReady(world.port, child, logs)
}

function applyLocalConfigEnv(env: NodeJS.ProcessEnv, world: TenantWorld): void {
  const alias = world.staticTenantAlias ?? world.localStaticRecord?.slug
  if (alias === undefined) {
    return
  }

  env.TENANT_STATIC_ALIAS = alias
}

function applyOidcEnv(env: NodeJS.ProcessEnv, world: TenantWorld): void {
  env.OIDC_TX_KEY_PREFIX = world.oidcTxKeyPrefix
  if (world.oidcClientSecretsJson !== undefined) {
    env.OIDC_CLIENT_SECRETS_JSON = world.oidcClientSecretsJson
  }
}

function applySessionEnv(env: NodeJS.ProcessEnv, world: TenantWorld): void {
  env.NEXT_TELEMETRY_DISABLED = "1"
  // Prefer polling watchers in the BDD harness so macOS/sandbox EMFILE from
  // recursive native watches does not tear down `.next/dev` mid-request.
  env.WATCHPACK_POLLING = "true"
  env.CHOKIDAR_USEPOLLING = "true"
  env.NODE_ENV = world.runtime === "production" ? "production" : "development"
  env.REDIS_URL = world.redisUrl ?? process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
  env.SESSION_SIGNING_SECRET = world.sessionSigningSecret
  env.SESSION_TTL_SECONDS = String(world.sessionTtlSeconds)
  env.SESSION_STORE_TIMEOUT_MS = String(world.sessionStoreTimeoutMs)
  env.SESSION_KEY_PREFIX = world.sessionKeyPrefix
  if (world.runtime === "production" && world.oidcMockIssuer !== undefined) {
    env.BDD_ALLOW_LOOPBACK_HTTP = "1"
  }
}

function applyTenantRecordsEnv(env: NodeJS.ProcessEnv, world: TenantWorld): void {
  const production = world.runtime === "production"
  const dir = materializeTenantConfigDir(world, production)
  if (world.tenantConfigDirProblem === "an empty path") {
    env.TENANT_CONFIG_DIR = ""
  } else {
    env.TENANT_CONFIG_DIR = dir
  }

  // Former JSON documents may be set to prove silent ignore (filesystem remains authoritative).
  if (world.formerInlineRecordsJson !== undefined) {
    env.TENANT_CONFIG_RECORDS_JSON = world.formerInlineRecordsJson
  }

  if (world.formerLocalConfigJson !== undefined) {
    env.TENANT_LOCAL_CONFIG_JSON = world.formerLocalConfigJson
  }
}

function applyTenantResolutionEnv(env: NodeJS.ProcessEnv, world: TenantWorld): void {
  if (world.unsupportedMode !== undefined) {
    env.TENANT_RESOLUTION = world.unsupportedMode
    return
  }

  if (world.resolutionMode !== undefined) {
    env.TENANT_RESOLUTION = world.resolutionMode
  }
}

async function assertPortFree(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer()
    server.once("error", (error) => {
      const code = "code" in error ? String(error.code) : "unknown"
      reject(new Error(`Test port ${String(port)} is occupied (${code}); refusing to reuse an existing server.`))
    })
    server.listen(port, "127.0.0.1", () => {
      server.close(() => {
        resolve()
      })
    })
  })
}

function buildProcessEnv(world: TenantWorld): NodeJS.ProcessEnv {
  ensureSessionSettings(world)
  const env = clearHarnessEnv({ ...process.env })
  applySessionEnv(env, world)
  applyOidcEnv(env, world)
  applyTenantResolutionEnv(env, world)
  applyTenantRecordsEnv(env, world)
  applyLocalConfigEnv(env, world)
  return env
}

function clearHarnessEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  delete env.TENANT_RESOLUTION
  delete env.TENANT_CONFIG_DIR
  delete env.TENANT_STATIC_ALIAS
  delete env.TENANT_CONFIG_RECORDS_JSON
  delete env.TENANT_LOCAL_CONFIG_JSON
  delete env.OIDC_CLIENT_SECRETS_JSON
  delete env.OIDC_TX_KEY_PREFIX
  delete env.BDD_ALLOW_LOOPBACK_HTTP
  return env
}

async function discardBrowserPages(world: TenantWorld): Promise<void> {
  await world.springfieldPage?.context().close().catch(() => undefined)
  await world.shelbyvillePage?.context().close().catch(() => undefined)
  await world.page?.context().close().catch(() => undefined)
  await world.browserContext?.close().catch(() => undefined)
  world.browserContext = undefined
  world.page = undefined
  world.springfieldPage = undefined
  world.shelbyvillePage = undefined
}

function filesystemSignatureFields(world: TenantWorld): Record<string, unknown> {
  return {
    aliasProblems: world.aliasFileProblems ?? {},
    configDirProblem: world.tenantConfigDirProblem ?? "",
    formerInline: world.formerInlineRecordsJson ?? "",
    formerLocal: world.formerLocalConfigJson ?? "",
    omitAliases: world.omitAliasFiles ?? [],
    staticAlias: world.staticTenantAlias ?? world.localStaticRecord?.slug ?? "",
    tenants: world.tenants
  }
}

function oidcSignatureFields(world: TenantWorld): Record<string, unknown> {
  return {
    defect: world.oidcDefect ?? "",
    fixtures: world.oidcFixtures ?? [],
    forcedFailure: world.oidcForcedFailure ?? "",
    mockIssuer: world.oidcMockIssuer ?? "",
    oidcSecrets: world.oidcClientSecretsJson ?? "",
    oidcTxPrefix: world.oidcTxKeyPrefix ?? "",
    unreadable: world.oidcUnreadableConfig
  }
}

function processSignature(world: TenantWorld): string {
  ensureSessionSettings(world)
  return JSON.stringify({
    ...filesystemSignatureFields(world),
    ...oidcSignatureFields(world),
    ...sessionSignatureFields(world),
    invalidDisplayName: world.invalidDisplayName ?? "",
    port: world.port
  })
}

function sessionSignatureFields(world: TenantWorld): Record<string, unknown> {
  return {
    redisUrl: world.redisUrl ?? "",
    resolutionMode: world.resolutionMode ?? "host",
    runtime: world.runtime ?? "development",
    sessionKeyPrefix: world.sessionKeyPrefix ?? "",
    sessionSigningSecret: world.sessionSigningSecret ?? "",
    sessionTtlSeconds: world.sessionTtlSeconds ?? ""
  }
}

async function terminateProcess(child: ChildProcess | undefined): Promise<void> {
  if (child?.pid === undefined) {
    return
  }

  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }

  const pid = child.pid

  const exited = new Promise<void>((resolve) => {
    child.once("exit", () => {
      resolve()
    })
  })

  try {
    process.kill(-pid, "SIGTERM")
  } catch {
    child.kill("SIGTERM")
  }

  const first = await Promise.race([exited, delay(2000).then(() => "timeout" as const)])
  if (first !== "timeout") {
    return
  }

  try {
    process.kill(-pid, "SIGKILL")
  } catch {
    child.kill("SIGKILL")
  }

  await Promise.race([exited, delay(2000)])
}

async function waitForReady(port: number, child: ChildProcess, logs: string[]): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < READY_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      throw new Error(
        `Owned test process exited with ${String(child.exitCode)}\n${logs.join("")}`
      )
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get({ hostname: "127.0.0.1", path: "/favicon.ico", port }, (res) => {
          res.resume()
          resolve()
        })
        req.on("error", reject)
      })
      return
    } catch {
      await delay(200)
    }
  }

  throw new Error(`Owned test process on port ${String(port)} was not ready in time`)
}
