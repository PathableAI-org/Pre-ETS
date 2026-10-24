import type { ChildProcess } from "node:child_process"
import type { Server } from "node:net"
import type { Browser } from "playwright"

import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import http, { type IncomingMessage, type ServerResponse } from "node:http"
import net from "node:net"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { chromium } from "playwright"

const frontend = path.resolve("packages/frontend")

export interface SiteOptions {
  readonly allowInsecureLoopback: boolean
  readonly baseHostname: string | undefined
  readonly callbackOrigins: Record<string, string>
  readonly directory: string
  readonly redisUrl: string
  readonly runtime: "development" | "production"
  readonly staticAlias: string | undefined
  readonly transactionPrefix: string
  readonly transactionTtlSeconds: number
}

/** Reserves and releases an ephemeral loopback port for a child process. */
export async function freePort(): Promise<number> {
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

/** Binds a server to an ephemeral 127.0.0.1 port and resolves that port. */
export async function listenOnLoopback(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject)
      resolve()
    })
  })
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  return address.port
}

/** Spawns the frontend `next` server on the given loopback port and returns its log sink. */
export async function spawnFrontend(
  options: SiteOptions,
  port: number
): Promise<{ child: ChildProcess; logs: () => string }> {
  await ensureProductionBuild(options.runtime)
  let logs = ""
  const child = spawn(
    path.join(frontend, "node_modules/.bin/next"),
    [options.runtime === "production" ? "start" : "dev", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: frontend,
      detached: true,
      env: siteEnv(options),
      stdio: ["ignore", "pipe", "pipe"]
    }
  )
  child.stdout.on("data", (data: Buffer) => {
    logs += data.toString()
  })
  child.stderr.on("data", (data: Buffer) => {
    logs += data.toString()
  })
  return { child, logs: () => logs }
}

async function ensureProductionBuild(runtime: SiteOptions["runtime"]): Promise<void> {
  if (runtime !== "production") return
  await fs.access(path.join(frontend, ".next/BUILD_ID")).catch(() => {
    throw new Error(
      "Production frontend tests require a build. Run pnpm --filter @pathableai/pre-ets-frontend build first."
    )
  })
}

/** Builds the frontend process environment without mutating process.env or the caller's world. */
function siteEnv(options: SiteOptions): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: options.runtime,
    OIDC_ALLOW_INSECURE_LOOPBACK: String(options.allowInsecureLoopback),
    OIDC_CALLBACK_ORIGINS_JSON: JSON.stringify(options.callbackOrigins),
    OIDC_TX_KEY_PREFIX: options.transactionPrefix,
    OIDC_TX_TTL_SECONDS: String(options.transactionTtlSeconds),
    REDIS_URL: options.redisUrl,
    TENANT_CONFIG_DIR: options.directory,
    TENANT_CONFIG_RECORDS_JSON: "",
    TENANT_LOCAL_CONFIG_JSON: "",
    TENANT_RESOLUTION: options.staticAlias === undefined ? "host" : "static",
    TENANT_STATIC_ALIAS: options.staticAlias ?? "",
    WATCHPACK_POLLING: "true"
  }
  if (options.baseHostname === undefined) delete env.BASE_HOSTNAME
  else env.BASE_HOSTNAME = options.baseHostname
  return env
}

const running = (child: ChildProcess): boolean => child.exitCode === null && child.signalCode === null

const processDoesNotExist = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ESRCH"

function signalProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal)
  } catch (error) {
    if (!processDoesNotExist(error)) throw error
  }
}

const waitForExit = async (child: ChildProcess): Promise<void> => {
  for (let tries = 0; tries < 30; tries++) {
    if (!running(child)) return
    await delay(100)
  }
}

/** Signals the child's process group and drains until it exits, escalating to SIGKILL. */
export async function stopProcess(child: ChildProcess | undefined): Promise<void> {
  if (child === undefined || !running(child)) return
  const pid = child.pid
  if (pid === undefined) return
  signalProcessGroup(pid, "SIGTERM")
  await waitForExit(child)
  if (running(child)) signalProcessGroup(pid, "SIGKILL")
}

const readinessFailure = (
  child: ChildProcess,
  spawnError: Error | undefined,
  logs: () => string
): Error | undefined => {
  if (spawnError !== undefined) return spawnError
  if (child.exitCode !== null) return new Error(`Frontend server exited: ${logs()}`)
  return undefined
}

const observedReadyAt = (readyAt: number | undefined, logs: string) =>
  readyAt === undefined && logs.includes("Ready in") ? Date.now() : readyAt

const instrumentationSettled = (readyAt: number | undefined): boolean =>
  readyAt !== undefined && Date.now() - readyAt >= 1_000

interface ProxyOptions {
  readonly applicationPort: number
  readonly authorities: readonly string[]
  readonly callbackPort?: number
  readonly callbacks: { readonly cookie: string; readonly url: string }[]
  readonly interceptCallback: boolean
}

/**
 * Waits until the frontend announces its listener and its async instrumentation
 * (runtime/Redis probe) has had time to settle, or fails with a bounded error.
 */
export async function waitUntilReady(child: ChildProcess, logs: () => string, timeoutMs = 120_000): Promise<void> {
  let spawnError: Error | undefined
  let readyAt: number | undefined
  child.once("error", (error) => {
    spawnError = error
  })
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const failure = readinessFailure(child, spawnError, logs)
    if (failure !== undefined) throw failure
    readyAt = observedReadyAt(readyAt, logs())
    if (instrumentationSettled(readyAt)) return
    await delay(100)
  }
  throw new Error(`Frontend server startup timed out: ${logs()}`)
}

const captureCallback = (
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  owned: boolean,
  options: ProxyOptions
): boolean => {
  if (!owned || url.pathname !== "/auth/callback") return false
  options.callbacks.push({ cookie: request.headers.cookie ?? "", url: url.href })
  if (!options.interceptCallback) return false
  response.writeHead(204, { "cache-control": "no-store" })
  response.end()
  return true
}

const applicationPortFor = (url: URL, options: ProxyOptions): number =>
  url.pathname === "/auth/callback" && options.callbackPort !== undefined ?
    options.callbackPort :
    options.applicationPort

const forwardRequest = (
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  owned: boolean,
  options: ProxyOptions
): void => {
  const upstream = http.request(
    {
      headers: { ...request.headers, host: url.host },
      hostname: owned ? "127.0.0.1" : url.hostname,
      method: request.method,
      path: `${url.pathname}${url.search}`,
      port: owned ? applicationPortFor(url, options) : Number(url.port || 80)
    },
    (incoming) => {
      response.writeHead(incoming.statusCode ?? 502, incoming.headers)
      incoming.pipe(response)
    }
  )
  upstream.on("error", () => {
    if (!response.headersSent) response.writeHead(502)
    response.end()
  })
  response.on("close", () => upstream.destroy())
  request.pipe(upstream)
}

const proxyRequest = (request: IncomingMessage, response: ServerResponse, options: ProxyOptions): void => {
  const url = new URL(request.url ?? "/", "http://invalid")
  const owned = options.authorities.includes(url.host)
  if (captureCallback(request, response, url, owned, options)) return
  forwardRequest(request, response, url, owned, options)
}

/**
 * Launches Chromium behind an owned local proxy so every application hop stays
 * on the loopback transport while external (Keycloak) HTTPS keeps its real
 * destination. `callbackPort` routes `/auth/callback` to a second instance.
 */
export async function applicationBrowser(
  port: number,
  authorities: readonly string[],
  callbackPort?: number,
  interceptCallback = false
): Promise<{
  browser: Browser
  callbacks: { readonly cookie: string; readonly url: string }[]
  close: () => Promise<void>
}> {
  const callbacks: { readonly cookie: string; readonly url: string }[] = []
  const options: ProxyOptions = {
    applicationPort: port,
    authorities,
    callbacks,
    interceptCallback,
    ...(callbackPort === undefined ? {} : { callbackPort })
  }
  const proxy = http.createServer((request, response) => {
    proxyRequest(request, response, options)
  })
  proxy.on("connect", (request, client, head) => {
    const destination = new URL(`https://${request.url ?? "invalid"}`)
    const upstream = net.connect(Number(destination.port || 443), destination.hostname, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n")
      upstream.write(head)
      client.pipe(upstream)
      upstream.pipe(client)
    })
    upstream.on("error", () => client.destroy())
    client.on("error", () => upstream.destroy())
    client.on("close", () => upstream.destroy())
  })
  const proxyPort = await listenOnLoopback(proxy)
  const stopProxy = async () => {
    proxy.closeAllConnections()
    await new Promise<void>((resolve) =>
      proxy.close(() => {
        resolve()
      })
    )
  }
  try {
    const browser = await chromium.launch({
      proxy: { server: `http://127.0.0.1:${String(proxyPort)}` }
    })
    return {
      browser,
      callbacks,
      close: async () => {
        try {
          await browser.close()
        } finally {
          await stopProxy()
        }
      }
    }
  } catch (error) {
    await stopProxy()
    throw error
  }
}
