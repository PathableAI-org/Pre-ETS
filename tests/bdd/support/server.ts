import { type ChildProcess, spawn } from "node:child_process"
import fs from "node:fs/promises"
import http from "node:http"
import net from "node:net"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"

import type { AppWorld } from "./world.ts"

import { sessionCookieHeader } from "./fixtures.ts"
import { listenOnLoopback } from "./listen.ts"

const frontend = path.resolve("packages/frontend")
export async function requestSite(world: AppWorld, host: string, document = true): Promise<void> {
  await startSite(world)
  world.response = await new Promise((resolve, reject) => {
    const request = http.get({
      headers: {
        Host: host,
        "x-forwarded-proto": "https",
        ...sessionCookieHeader(world),
        ...world.extraHeaders,
        ...(document ? { Accept: "text/html", "sec-fetch-dest": "document" } : { Accept: "application/json" })
      },
      hostname: "127.0.0.1",
      path: world.extraHeaders["x-bdd-query"] ?? "/",
      port: world.port
    }, (response) => {
      let body = ""
      response.setEncoding("utf8")
      response.on("data", (chunk: string) => {
        body += chunk
      })
      response.on("end", () => {
        const headers: Record<string, string> = {}
        for (const [name, value] of Object.entries(response.headers)) {
          if (value !== undefined) headers[name] = Array.isArray(value) ? value.join("\n") : value
        }
        resolve({ body, headers, status: response.statusCode ?? 0 })
      })
      response.on("error", reject)
    })
    request.on("error", reject)
    request.setTimeout(30000, () => {
      request.destroy(new Error("BDD HTTP request timed out"))
    })
  })
}
export async function startSite(world: AppWorld): Promise<void> {
  if (world.process) return
  await ensureProductionBuild(world.runtime)
  world.port = await freePort()
  world.logs = ""
  const child = spawnFrontend(world)
  world.process = child
  attachLogStreams(world, child)
  await waitUntilReady(world, child)
}

export async function stopSite(world: AppWorld): Promise<void> {
  const child = world.process
  if (!child?.pid || !running(child)) {
    world.process = undefined
    return
  }
  signalProcessGroup(child.pid, "SIGTERM")
  for (let tries = 0; tries < 30 && running(child); tries++) await delay(100)
  if (running(child)) signalProcessGroup(child.pid, "SIGKILL")
  world.process = undefined
}

function attachLogStreams(world: AppWorld, child: ChildProcess): void {
  child.stdout?.on("data", (data: Buffer) => {
    world.logs += data.toString()
  })
  child.stderr?.on("data", (data: Buffer) => {
    world.logs += data.toString()
  })
}

async function ensureProductionBuild(runtime: AppWorld["runtime"]): Promise<void> {
  if (runtime !== "production") return
  await fs.access(path.join(frontend, ".next/BUILD_ID")).catch(() => {
    throw new Error(
      "BDD production tests require a frontend build. Run pnpm --filter @pathableai/pre-ets-frontend build first."
    )
  })
}

async function freePort(): Promise<number> {
  const server = net.createServer()
  const port = await listenOnLoopback(server)
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
  return port
}

function running(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null
}
function signalProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal)
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error
  }
}

function siteEnv(world: AppWorld): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BDD_ALLOW_LOOPBACK_HTTP: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: world.runtime,
    OIDC_CLIENT_SECRETS_JSON: "{}",
    OIDC_TX_KEY_PREFIX: `${world.keyPrefix}oidc:`,
    OIDC_TX_SIGNING_SECRET: Buffer.from(world.signingSecret).toString("base64url"),
    REDIS_URL: world.redisUrl,
    SESSION_KEY_PREFIX: world.keyPrefix,
    SESSION_SIGNING_SECRET: Buffer.from(world.signingSecret).toString("base64url"),
    SESSION_STORE_TIMEOUT_MS: "2000",
    SESSION_TTL_SECONDS: "86400",
    TENANT_CONFIG_DIR: world.directory,
    TENANT_CONFIG_RECORDS_JSON: "",
    TENANT_LOCAL_CONFIG_JSON: "",
    TENANT_RESOLUTION: world.staticAlias ? "static" : "host",
    TENANT_STATIC_ALIAS: world.staticAlias ?? "",
    WATCHPACK_POLLING: "true"
  }
}

function spawnFrontend(world: AppWorld): ChildProcess {
  return spawn(path.join(frontend, "node_modules/.bin/next"), [
    world.runtime === "production" ? "start" : "dev",
    "-H",
    "127.0.0.1",
    "-p",
    String(world.port)
  ], {
    cwd: frontend,
    detached: true,
    env: siteEnv(world),
    stdio: ["ignore", "pipe", "pipe"]
  })
}

async function waitUntilReady(world: AppWorld, child: ChildProcess): Promise<void> {
  let spawnError: Error | undefined
  child.once("error", (error) => {
    spawnError = error
  })
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError
    if (child.exitCode !== null) throw new Error(`BDD server exited: ${world.logs}`)
    if (world.logs.includes("Ready in")) return
    await delay(100)
  }
  throw new Error(`BDD server startup timed out: ${world.logs}`)
}
