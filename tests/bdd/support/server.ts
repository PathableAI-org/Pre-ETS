import { type ChildProcess, spawn } from "node:child_process"
import fs from "node:fs/promises"
import http, { type IncomingHttpHeaders } from "node:http"
import net from "node:net"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"

import type { AppWorld } from "./world.ts"

import { sessionCookieHeader } from "./fixtures.ts"
import { listenOnLoopback } from "./listen.ts"

const frontend = path.resolve("packages/frontend")

const responseHeaders = (source: IncomingHttpHeaders): Record<string, string> => {
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue
    headers[name] = Array.isArray(value) ? value.join("\n") : value
  }
  return headers
}

export async function requestInstance(
  world: AppWorld,
  port: number,
  host: string,
  requestPath: string,
  document = true,
  cookie?: string
): Promise<{ body: string; headers: Record<string, string>; status: number }> {
  return new Promise((resolve, reject) => {
    const request = http.get({
      headers: {
        Host: host,
        "x-forwarded-proto": "https",
        ...sessionCookieHeader(world),
        ...world.extraHeaders,
        ...(cookie === undefined ? {} : { Cookie: cookie }),
        ...(document ? { Accept: "text/html", "sec-fetch-dest": "document" } : { Accept: "application/json" })
      },
      hostname: "127.0.0.1",
      path: requestPath,
      port
    }, (response) => {
      let body = ""
      response.setEncoding("utf8")
      response.on("data", (chunk: string) => {
        body += chunk
      })
      response.on("end", () => {
        resolve({ body, headers: responseHeaders(response.headers), status: response.statusCode ?? 0 })
      })
      response.on("error", reject)
    })
    request.on("error", reject)
    request.setTimeout(30000, () => {
      request.destroy(new Error("BDD HTTP request timed out"))
    })
  })
}

export async function requestSite(world: AppWorld, host: string, document = true, requestPath = "/"): Promise<void> {
  await startSite(world)
  world.response = await requestInstance(world, world.port, host, requestPath, document)
}
export async function startSecondSite(world: AppWorld): Promise<void> {
  await startSite(world)
  if (world.secondaryProcess) return
  world.secondaryPort = await freePort()
  world.secondaryLogs = ""
  const child = spawnFrontend(world, world.secondaryPort)
  world.secondaryProcess = child
  attachLogStreams(world, child, true)
  await waitUntilReady(child, () => world.secondaryLogs)
}

export async function stopSite(world: AppWorld): Promise<void> {
  await stopProcess(world.secondaryProcess)
  await stopProcess(world.process)
  world.secondaryProcess = undefined
  world.process = undefined
}

function attachLogStreams(world: AppWorld, child: ChildProcess, secondary = false): void {
  child.stdout?.on("data", (data: Buffer) => {
    if (secondary) world.secondaryLogs += data.toString()
    else world.logs += data.toString()
  })
  child.stderr?.on("data", (data: Buffer) => {
    if (secondary) world.secondaryLogs += data.toString()
    else world.logs += data.toString()
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

const processDoesNotExist = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ESRCH"

function signalProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal)
  } catch (error) {
    if (!processDoesNotExist(error)) throw error
  }
}
function siteEnv(world: AppWorld): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: world.runtime,
    OIDC_ALLOW_INSECURE_LOOPBACK: String(world.allowInsecureLoopback),
    OIDC_CALLBACK_ORIGINS_JSON: JSON.stringify(world.callbackOrigins),
    OIDC_TX_KEY_PREFIX: world.transactionPrefix,
    OIDC_TX_TTL_SECONDS: String(world.transactionTtlSeconds),
    REDIS_URL: world.redisUrl,
    TENANT_CONFIG_DIR: world.directory,
    TENANT_CONFIG_RECORDS_JSON: "",
    TENANT_LOCAL_CONFIG_JSON: "",
    TENANT_RESOLUTION: world.staticAlias ? "static" : "host",
    TENANT_STATIC_ALIAS: world.staticAlias ?? "",
    WATCHPACK_POLLING: "true"
  }
  if (world.baseHostname === undefined) delete env.BASE_HOSTNAME
  else env.BASE_HOSTNAME = world.baseHostname
  return env
}

function spawnFrontend(world: AppWorld, port: number): ChildProcess {
  return spawn(path.join(frontend, "node_modules/.bin/next"), [
    world.runtime === "production" ? "start" : "dev",
    "-H",
    "127.0.0.1",
    "-p",
    String(port)
  ], {
    cwd: frontend,
    detached: true,
    env: siteEnv(world),
    stdio: ["ignore", "pipe", "pipe"]
  })
}

async function startSite(world: AppWorld): Promise<void> {
  if (world.process) return
  await ensureProductionBuild(world.runtime)
  world.port = await freePort()
  world.logs = ""
  const child = spawnFrontend(world, world.port)
  world.process = child
  attachLogStreams(world, child)
  await waitUntilReady(child, () => world.logs)
}

const activePid = (child: ChildProcess | undefined): number | undefined => {
  if (child === undefined || !running(child)) return undefined
  return child.pid
}

const waitForExit = async (child: ChildProcess): Promise<void> => {
  for (let tries = 0; tries < 30; tries++) {
    if (!running(child)) return
    await delay(100)
  }
}

async function stopProcess(child: ChildProcess | undefined): Promise<void> {
  const pid = activePid(child)
  if (pid === undefined || child === undefined) return
  signalProcessGroup(pid, "SIGTERM")
  await waitForExit(child)
  if (running(child)) signalProcessGroup(pid, "SIGKILL")
}

const readinessFailure = (child: ChildProcess, spawnError: Error | undefined, logs: () => string) => {
  if (spawnError !== undefined) return spawnError
  if (child.exitCode !== null) return new Error(`BDD server exited: ${logs()}`)
  return undefined
}

const observedReadyAt = (readyAt: number | undefined, logs: string): number | undefined =>
  readyAt === undefined && logs.includes("Ready in") ? Date.now() : readyAt

const instrumentationSettled = (readyAt: number | undefined): boolean =>
  readyAt !== undefined && Date.now() - readyAt >= 1_000

async function waitUntilReady(child: ChildProcess, logs: () => string): Promise<void> {
  let spawnError: Error | undefined
  let readyAt: number | undefined
  child.once("error", (error) => {
    spawnError = error
  })
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    const failure = readinessFailure(child, spawnError, logs)
    if (failure !== undefined) throw failure
    readyAt = observedReadyAt(readyAt, logs())
    // Next announces its listener before async instrumentation finishes. Keep the
    // harness gate closed long enough for the awaited runtime/Redis probe to settle.
    if (instrumentationSettled(readyAt)) return
    await delay(100)
  }
  throw new Error(`BDD server startup timed out: ${logs()}`)
}
