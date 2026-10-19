import type { Browser } from "playwright"

import http from "node:http"
import net from "node:net"
import { chromium } from "playwright"

import { listenOnLoopback } from "./listen.ts"

// Chromium does not re-run Playwright route handlers for HTTP redirect hops.
// An owned browser proxy keeps every application hop on the local transport.
// External HTTP requests and TLS tunnels retain their real destinations.
export async function applicationBrowser(port: number, authorities: readonly string[]): Promise<{
  browser: Browser
  close: () => Promise<void>
}> {
  const proxy = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://invalid")
    const owned = authorities.includes(url.host)
    const upstream = http.request({
      headers: { ...request.headers, host: url.host },
      hostname: owned ? "127.0.0.1" : url.hostname,
      method: request.method,
      path: `${url.pathname}${url.search}`,
      port: owned ? port : Number(url.port || 80)
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
