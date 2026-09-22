import assert from "node:assert/strict"
import { type ChildProcess, spawn } from "node:child_process"
import fs from "node:fs/promises"
import http from "node:http"
import net from "node:net"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"

import type { CapabilityWorld } from "./world.ts"

import { sessionCookieHeader } from "./fixtures.ts"
import { listenOnLoopback } from "./listen.ts"

const frontend = path.resolve("packages/frontend")
export function loginLocation(world: CapabilityWorld): URL {
  assert.ok(world.response)
  assert.ok(
    [302, 303, 307, 308].includes(world.response.status),
    `expected login redirect, received ${String(world.response.status)}: ${world.logs}`
  )
  assert.ok(world.response.headers.location)
  return new URL(world.response.headers.location)
}
export async function requestSite(world: CapabilityWorld, host: string, document = true): Promise<void> {
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
export async function startSite(world: CapabilityWorld): Promise<void> {
  if (world.process) return
  if (world.runtime === "production") {
    await fs.access(path.join(frontend, ".next/BUILD_ID")).catch(() => {
      throw new Error(
        "BDD production tests require a frontend build. Run pnpm --filter @pathableai/pre-ets-frontend build first."
      )
    })
  }
  world.port = await freePort()
  world.logs = ""
  const child = spawn(path.join(frontend, "node_modules/.bin/next"), [
    world.runtime === "production" ? "start" : "dev",
    ...(world.runtime === "development" ? ["--webpack"] : []),
    "-H",
    "127.0.0.1",
    "-p",
    String(world.port)
  ], {
    cwd: frontend,
    detached: true,
    env: {
      ...process.env,
      BDD_ALLOW_LOOPBACK_HTTP: "1",
      NEXT_TELEMETRY_DISABLED: "1",
      NODE_ENV: world.runtime,
      OIDC_CLIENT_SECRETS_JSON: "{}",
      OIDC_TX_KEY_PREFIX: `${world.config.keyPrefix}oidc:`,
      OIDC_TX_SIGNING_SECRET: Buffer.from(world.config.signingSecret).toString("base64url"),
      REDIS_URL: world.config.redisUrl,
      SESSION_KEY_PREFIX: world.config.keyPrefix,
      SESSION_SIGNING_SECRET: Buffer.from(world.config.signingSecret).toString("base64url"),
      SESSION_STORE_TIMEOUT_MS: "2000",
      SESSION_TTL_SECONDS: "86400",
      TENANT_CONFIG_DIR: world.directory,
      TENANT_CONFIG_RECORDS_JSON: "",
      TENANT_LOCAL_CONFIG_JSON: "",
      TENANT_RESOLUTION: world.staticAlias ? "static" : "host",
      TENANT_STATIC_ALIAS: world.staticAlias ?? "",
      WATCHPACK_POLLING: "true"
    },
    stdio: ["ignore", "pipe", "pipe"]
  })
  world.process = child
  child.stdout.on("data", (data: Buffer) => {
    world.logs += data.toString()
  })
  child.stderr.on("data", (data: Buffer) => {
    world.logs += data.toString()
  })
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
export async function stopSite(world: CapabilityWorld): Promise<void> {
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
