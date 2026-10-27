import type { ChildProcess } from "node:child_process"

import http, { type IncomingHttpHeaders } from "node:http"

import type { AppWorld } from "./world.ts"

import { freePort, spawnFrontend, stopProcess, waitUntilReady } from "../../support/oidc/harness.ts"
import { sessionCookieHeader } from "./fixtures.ts"

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
    const request = http.get(
      {
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
      },
      (response) => {
        let body = ""
        response.setEncoding("utf8")
        response.on("data", (chunk: string) => {
          body += chunk
        })
        response.on("end", () => {
          resolve({ body, headers: responseHeaders(response.headers), status: response.statusCode ?? 0 })
        })
        response.on("error", reject)
      }
    )
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

const siteOptionsFor = (world: AppWorld) => ({
  allowInsecureLoopback: world.allowInsecureLoopback,
  baseHostname: world.baseHostname,
  callbackOrigins: world.callbackOrigins,
  directory: world.directory,
  redisUrl: world.redisUrl,
  runtime: world.runtime,
  sessionPrefix: world.sessionPrefix,
  staticAlias: world.staticAlias,
  transactionPrefix: world.transactionPrefix,
  transactionTtlSeconds: world.transactionTtlSeconds
})

const attachLogToWorld = (world: AppWorld, child: ChildProcess, secondary: boolean): void => {
  const append = (data: Buffer) => {
    if (secondary) world.secondaryLogs += data.toString()
    else world.logs += data.toString()
  }
  child.stdout?.on("data", append)
  child.stderr?.on("data", append)
}

export async function startSecondSite(world: AppWorld): Promise<void> {
  await startSite(world)
  if (world.secondaryProcess) return
  world.secondaryPort = await freePort()
  world.secondaryLogs = ""
  const { child, logs } = await spawnFrontend(siteOptionsFor(world), world.secondaryPort)
  world.secondaryProcess = child
  attachLogToWorld(world, child, true)
  await waitUntilReady(child, logs)
}

export async function stopSite(world: AppWorld): Promise<void> {
  await stopProcess(world.secondaryProcess)
  await stopProcess(world.process)
  world.secondaryProcess = undefined
  world.process = undefined
}

async function startSite(world: AppWorld): Promise<void> {
  if (world.process) return
  world.port = await freePort()
  world.logs = ""
  const { child, logs } = await spawnFrontend(siteOptionsFor(world), world.port)
  world.process = child
  attachLogToWorld(world, child, false)
  await waitUntilReady(child, logs)
}
