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
