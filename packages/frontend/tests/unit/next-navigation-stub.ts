export class ForbiddenError extends Error {
  constructor() {
    super("FORBIDDEN")
    this.name = "ForbiddenError"
  }
}

export class NotFoundError extends Error {
  constructor() {
    super("NEXT_HTTP_ERROR_FALLBACK;404")
    this.name = "NotFoundError"
  }
}

export class RedirectError extends Error {
  readonly url: string

  constructor(url: string) {
    super(`NEXT_REDIRECT:${url}`)
    this.name = "RedirectError"
    this.url = url
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super("UNAUTHORIZED")
    this.name = "UnauthorizedError"
  }
}

export function forbidden(): never {
  throw new ForbiddenError()
}

export function notFound(): never {
  throw new NotFoundError()
}

export function redirect(url: string): never {
  throw new RedirectError(url)
}

export function unauthorized(): never {
  throw new UnauthorizedError()
}
