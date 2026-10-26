export const NextResponse = {
  json() {
    return {}
  }
}

export const stubExportsReady = () => typeof NextResponse.json === "function" && typeof forbidden === "function"

export function forbidden() {
  throw new Error("FORBIDDEN")
}

export function notFound() {
  throw new Error("NOT_FOUND")
}

export function redirect(url) {
  throw new Error(`NEXT_REDIRECT:${url}`)
}

export function unauthorized() {
  throw new Error("UNAUTHORIZED")
}
