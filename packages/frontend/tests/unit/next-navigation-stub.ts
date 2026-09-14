export class ForbiddenError extends Error {
  constructor() {
    super("FORBIDDEN")
    this.name = "ForbiddenError"
  }
}

export function forbidden(): never {
  throw new ForbiddenError()
}
