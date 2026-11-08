export interface RequestHost {
  readonly hostname: string
  readonly port: string
}

/** Keeps an explicit port. Scheme defaults are applied only once the callback origin is known. */
export const parseRequestHost = (raw: string): RequestHost | undefined => {
  if (raw.trim() !== raw || raw === "" || /[/?#@\\]/.test(raw)) return undefined
  try {
    const url = new URL(`opaque://${raw}`)
    if (url.hostname === "" || url.pathname !== "" || url.search !== "" || url.hash !== "") return undefined
    return { hostname: url.hostname.toLowerCase(), port: url.port }
  } catch {
    return undefined
  }
}

/**
 * Hostnames treated as local development: `localhost`, `*.localhost`, 127.0.0.0/8, and `[::1]`. Takes a
 * URL-style hostname (lowercase, IPv6 in brackets), as `URL.hostname` and {@link parseRequestHost} return it.
 */
export const isLoopbackHostname = (hostname: string): boolean =>
  hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "[::1]" ||
  /^127(?:\.\d{1,3}){3}$/.test(hostname)
