import net from "node:net"

import type { HttpExchange } from "./world.ts"

export function decodeChunked(body: string): string {
  let decoded = ""
  let remaining = body
  while (remaining.length > 0) {
    const lineEnd = remaining.indexOf("\r\n")
    if (lineEnd === -1) {
      return body
    }

    const size = Number.parseInt(remaining.slice(0, lineEnd), 16)
    if (Number.isNaN(size)) {
      return body
    }

    if (size === 0) {
      break
    }

    const dataStart = lineEnd + 2
    decoded += remaining.slice(dataStart, dataStart + size)
    remaining = remaining.slice(dataStart + size + 2)
  }

  return decoded
}

export function parseRawHttp(raw: string): HttpExchange {
  const { body: rawBody, head } = splitHeadAndBody(raw)
  const headers = collectHeaders(head.split("\r\n").slice(1))
  const body = maybeDecodeChunkedBody(rawBody, headers["transfer-encoding"])

  return {
    body,
    headers,
    status: parseStatusCode(head)
  }
}

export async function sendRawGet(options: {
  readonly extraHeaders?: Record<string, string>
  readonly host?: string | undefined
  readonly omitHostHeader?: boolean
  readonly path: string
  readonly port: number
}): Promise<HttpExchange> {
  const version = options.omitHostHeader === true ? "HTTP/1.0" : "HTTP/1.1"
  const headerLines = ["Connection: close", "Accept-Encoding: identity"]
  if (options.omitHostHeader !== true) {
    headerLines.push(`Host: ${options.host ?? ""}`)
  }

  for (const [name, value] of Object.entries(options.extraHeaders ?? {})) {
    headerLines.push(`${name}: ${value}`)
  }

  const payload = `GET ${options.path} ${version}\r\n${headerLines.join("\r\n")}\r\n\r\n`
  return parseRawHttp(await readSocketResponse(options.port, payload))
}

function collectHeaders(lines: readonly string[]): Record<string, string> {
  const headers: Record<string, string> = {}
  const setCookies: string[] = []
  for (const line of lines) {
    const index = line.indexOf(":")
    if (index === -1) {
      continue
    }

    const name = line.slice(0, index).trim().toLowerCase()
    const value = line.slice(index + 1).trim()
    if (name === "set-cookie") {
      setCookies.push(value)
      continue
    }

    headers[name] = headers[name] === undefined ? value : `${headers[name]}, ${value}`
  }

  if (setCookies.length > 0) {
    headers["set-cookie"] = setCookies.join("\n")
  }

  return headers
}

function maybeDecodeChunkedBody(body: string, transferEncoding: string | undefined): string {
  if ((transferEncoding ?? "").includes("chunked")) {
    return decodeChunked(body)
  }

  return body
}

function parseStatusCode(head: string): number {
  const statusMatch = /^HTTP\/\d(?:\.\d)?\s+(\d+)/.exec(head.split("\r\n")[0] ?? "")
  return statusMatch === null ? 0 : Number(statusMatch[1])
}

async function readSocketResponse(port: number, payload: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1")
    const chunks: Buffer[] = []
    socket.on("connect", () => {
      socket.write(payload)
    })
    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk)
    })
    socket.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"))
    })
    socket.on("error", reject)
    socket.setTimeout(10_000, () => {
      socket.destroy(new Error("HTTP request timed out"))
    })
  })
}

function splitHeadAndBody(raw: string): { readonly body: string; readonly head: string } {
  const separator = raw.indexOf("\r\n\r\n")
  if (separator === -1) {
    return { body: "", head: raw }
  }

  return {
    body: raw.slice(separator + 4),
    head: raw.slice(0, separator)
  }
}
