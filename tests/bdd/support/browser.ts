import type { Browser } from "playwright"

import http, { type IncomingMessage, type ServerResponse } from "node:http"
import net from "node:net"
import { chromium } from "playwright"

import { listenOnLoopback } from "./listen.ts"

interface ProxyOptions {
  readonly applicationPort: number
  readonly authorities: readonly string[]
  readonly callbackPort?: number
  readonly callbacks: { readonly cookie: string; readonly url: string }[]
  readonly interceptCallback: boolean
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
  const upstream = http.request({
    headers: { ...request.headers, host: url.host },
    hostname: owned ? "127.0.0.1" : url.hostname,
    method: request.method,
    path: `${url.pathname}${url.search}`,
    port: owned ? applicationPortFor(url, options) : Number(url.port || 80)
  }, (incoming) => {
    response.writeHead(incoming.statusCode ?? 502, incoming.headers)
    incoming.pipe(response)
  })
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

// Chromium does not re-run Playwright route handlers for HTTP redirect hops.
// An owned browser proxy keeps every application hop on the local transport.
// External HTTP requests and TLS tunnels retain their real destinations.
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
