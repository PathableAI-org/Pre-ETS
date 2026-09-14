import { fail, type HostSuffix, isCanonicalTenantSlug, ok, type TenantResult } from "./model.ts"

const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/

export function bindHost(rawHost: string | undefined, suffix: HostSuffix): TenantResult<string> {
  if (rawHost === undefined || rawHost.trim() === "") {
    return fail("invalid-host")
  }

  if (/[\s,/\\?#@]/.test(rawHost) || rawHost.includes(",") || rawHost.includes("://")) {
    return fail("invalid-host")
  }

  const authority = splitHostPort(rawHost)
  if (authority === undefined) {
    return fail("invalid-host")
  }

  const hostname = authority.hostname.toLowerCase()
  if (hostname.endsWith(".") || hostname.startsWith(".") || hostname.includes("..")) {
    return fail("invalid-host")
  }

  if (IPV4_PATTERN.test(hostname) || hostname.includes(":")) {
    return fail("invalid-host")
  }

  const labels = hostname.split(".")
  const suffixLabels = suffix.split(".")
  if (labels.length !== suffixLabels.length + 1) {
    return fail("invalid-host")
  }

  const hostSuffix = labels.slice(1).join(".")
  if (hostSuffix !== suffix) {
    return fail("invalid-host")
  }

  const slug = labels[0]
  if (slug === undefined || !isCanonicalTenantSlug(slug)) {
    return fail("invalid-host")
  }

  return ok(slug)
}

function splitHostPort(rawHost: string): undefined | { hostname: string; port?: number } {
  if (rawHost.startsWith("[")) {
    return undefined
  }

  const colonCount = rawHost.split(":").length - 1
  if (colonCount === 0) {
    return { hostname: rawHost }
  }

  if (colonCount !== 1) {
    return undefined
  }

  const separator = rawHost.lastIndexOf(":")
  const hostname = rawHost.slice(0, separator)
  const portText = rawHost.slice(separator + 1)
  if (hostname === "" || !/^[1-9]\d{0,4}$/.test(portText)) {
    return undefined
  }

  const port = Number(portText)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return undefined
  }

  return { hostname, port }
}
