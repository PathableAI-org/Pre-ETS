export const NextResponse = {
  json(): Record<string, never> {
    return {}
  }
}

export const stubExportsReady = (): boolean =>
  typeof NextResponse.json === "function" && typeof forbidden === "function"

export function forbidden(): never {
  throw new Error("FORBIDDEN")
}

export function notFound(): never {
  throw new Error("NOT_FOUND")
}

export function redirect(url: string): never {
  throw new Error(`NEXT_REDIRECT:${url}`)
}

export function unauthorized(): never {
  throw new Error("UNAUTHORIZED")
}
