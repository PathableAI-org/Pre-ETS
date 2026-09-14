const headersStore = globalThis as { __preetsRequestHeaders?: Map<string, string> }
headersStore.__preetsRequestHeaders ??= new Map()

export const requestHeaders = headersStore.__preetsRequestHeaders

export function headers(): Promise<{ get(name: string): null | string }> {
  return Promise.resolve({
    get(name: string): null | string {
      return requestHeaders.get(name.toLowerCase()) ?? null
    }
  })
}

export function setRequestHost(host: string | undefined): void {
  requestHeaders.clear()
  if (host !== undefined) {
    requestHeaders.set("host", host)
  }
}
