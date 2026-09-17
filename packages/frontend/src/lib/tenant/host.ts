import { type HostSuffix, isCanonicalTenantSlug } from "./types.ts"

export function bindHost(rawHost: string | undefined, suffix: HostSuffix): string | undefined {
  if (rawHost === undefined || rawHost.trim() === "") {
    return undefined
  }

  if (/[\s,/\\?#@]/.test(rawHost) || rawHost.includes("://")) {
    return undefined
  }

  const hostname = hostnameOf(rawHost)
  if (hostname === undefined) {
    return undefined
  }

  const normalized = hostname.toLowerCase()
  if (normalized.startsWith(".") || normalized.endsWith(".") || normalized.includes("..")) {
    return undefined
  }

  const suffixText = `.${suffix}`
  if (!normalized.endsWith(suffixText)) {
    return undefined
  }

  const slug = normalized.slice(0, -suffixText.length)
  if (slug.includes(".") || !isCanonicalTenantSlug(slug)) {
    return undefined
  }

  return slug
}

export function hostnameOf(rawHost: string): string | undefined {
  const separator = rawHost.lastIndexOf(":")
  if (separator === -1) {
    return rawHost
  }

  if (rawHost.indexOf(":") !== separator) {
    return undefined
  }

  const hostname = rawHost.slice(0, separator)
  const portText = rawHost.slice(separator + 1)
  if (hostname === "" || !/^[1-9]\d{0,4}$/.test(portText)) {
    return undefined
  }

  const port = Number(portText)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return undefined
  }

  return hostname
}
