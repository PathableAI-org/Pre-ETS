import type { ChildProcess } from "node:child_process"

import http, { type IncomingHttpHeaders } from "node:http"

import type { AppWorld } from "./world.ts"

import { sessionCookieHeader } from "./fixtures.ts"
import { freePort, spawnFrontend, stopProcess, waitUntilReady } from "./harness.ts"

const responseHeaders = (source: IncomingHttpHeaders): Record<string, string> => {
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue
    headers[name] = Array.isArray(value) ? value.join("\n") : value
  }
  return headers
}

export type RecordedResponse = NonNullable<AppWorld["response"]>

/** Fetch Metadata a browser sends: document navigations, application fetches, and image subresources. */
export const FETCH_METADATA = {
  application: { "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" },
  document: { "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" },
  image: { "sec-fetch-dest": "image", "sec-fetch-mode": "no-cors" },
  "metadata-less": {}
} as const satisfies Record<string, Record<string, string>>

export type FetchMetadataKind = keyof typeof FETCH_METADATA

interface SiteRequest {
  readonly cookie?: string | undefined
  readonly headers: Readonly<Record<string, string>>
  readonly host: string
  readonly method: string
  readonly path: string
  readonly port: number
}

export async function requestInstance(
  world: AppWorld,
  port: number,
  host: string,
  requestPath: string,
  document = true,
  cookie?: string
): Promise<RecordedResponse> {
  const headers = document ?
    { Accept: "text/html", ...FETCH_METADATA.document } :
    { Accept: "application/json" }
  return sendRequest(world, { cookie, headers, host, method: "GET", path: requestPath, port })
}

export async function requestSite(world: AppWorld, host: string, document = true, requestPath = "/"): Promise<void> {
  await startSite(world)
  world.response = await requestInstance(world, world.port, host, requestPath, document)
}

/** Starts the owned site if needed and records the response to one request with the given Fetch Metadata. */
export async function requestSiteWith(
  world: AppWorld,
  request: {
    readonly headers: Readonly<Record<string, string>>
    readonly host: string
    readonly method: string
    readonly path: string
  }
): Promise<void> {
  await startSite(world)
  world.response = await sendRequest(world, { ...request, port: world.port })
}

/** Sends one unfollowed request to an owned instance with the logical Host and the world's session cookie. */
async function sendRequest(world: AppWorld, site: SiteRequest): Promise<RecordedResponse> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      Host: site.host,
      "x-forwarded-proto": "https",
      ...sessionCookieHeader(world),
      ...world.extraHeaders,
      ...site.headers
    }
    // Node rejects an undefined header value, so an absent cookie must stay absent.
    if (site.cookie !== undefined) headers.Cookie = site.cookie
    const request = http.request(
      {
        headers,
        hostname: "127.0.0.1",
        method: site.method,
        path: site.path,
        port: site.port
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
    request.end()
  })
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
