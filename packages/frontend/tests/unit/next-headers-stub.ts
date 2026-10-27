const headersStore = globalThis as { __preetsRequestHeaders?: Map<string, string> }
headersStore.__preetsRequestHeaders ??= new Map()

export const requestHeaders = headersStore.__preetsRequestHeaders

interface CookieWrite {
  readonly options: Record<string, unknown> | undefined
}

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

const cookieValues = new Map<string, string>()
const cookieWrites: CookieWrite[] = []

export function cookies(): Promise<{
  get(name: string): undefined | { readonly value: string }
  set(name: string, value: string, options?: Record<string, unknown>): void
}> {
  return Promise.resolve({
    get(name: string) {
      const value = cookieValues.get(name)
      return value === undefined ? undefined : { value }
    },
    set(_name: string, _value: string, options?: Record<string, unknown>) {
      cookieWrites.push({ options })
    }
  })
}

export function cookieWriteCount(): number {
  return cookieWrites.length
}

export function cookieWriteOptions(): readonly (Record<string, unknown> | undefined)[] {
  return cookieWrites.map((write) => write.options)
}

export function resetRequestCookies(): void {
  cookieValues.clear()
  cookieWrites.length = 0
}

export function setRequestCookie(name: string, value: string): void {
  cookieValues.set(name, value)
}
